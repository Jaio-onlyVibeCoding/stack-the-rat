// Condivisione del setup: lo stato di gioco diventa un link.
// Nel link ci sono solo gli id Scryfall delle carte; chi apre il link le riscarica da Scryfall.
// Il testo è compresso (deflate) e codificato in base64url, dopo "#s=".

import { bumpUid, type Game, type PlayerId, type StackKind, type Zone } from './game';
import type { Choices } from './choices';
import { fetchByIds } from './scryfall';

/** Dati in più di una carta: attaccata a, carte sotto (mutare), segnalini, collegata a */
interface Extra {
  a?: number;
  u?: [string, PlayerId][];
  c?: Record<string, number>;
  l?: number;
}

interface Shared {
  v: 1;
  p: PlayerId[];
  a: PlayerId;
  pr: PlayerId | null;
  ps: PlayerId[];
  r: number | null;
  /** pila: [uid, idScryfall, proprietario, controllore, bersagli, tipo, testo abilità] */
  s: [number, string, PlayerId, PlayerId, string[], StackKind?, string?, Choices?, (0 | 1)?, number[]?][];
  /** carte: [uid, idScryfall, proprietario, controllore, zona, token, tappata, preparata, girata] */
  o: [number, string, PlayerId, PlayerId, Zone, 0 | 1, (0 | 1)?, (0 | 1)?, (0 | 1)?, Extra?][];
  g: Record<string, string>;
  /** sottofase */
  st?: number;
}

const toB64Url = (bytes: Uint8Array) => {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const extraOf = (o: Game['objs'][number]): Extra | undefined => {
  const e: Extra = {};
  if (o.attachedTo) e.a = o.attachedTo;
  if (o.under?.length) e.u = o.under.map((u) => [u.card.scryfallId, u.owner]);
  if (o.counters && Object.keys(o.counters).length) e.c = o.counters;
  if (o.linkedTo) e.l = o.linkedTo;
  return Object.keys(e).length ? e : undefined;
};

export async function encodeGame(g: Game): Promise<string> {
  const shared: Shared = {
    v: 1,
    p: g.players,
    a: g.active,
    pr: g.priority,
    ps: g.passed,
    r: g.resolving,
    s: g.stack.map((x) => [x.uid, x.card.scryfallId, x.owner, x.controller, x.targets, x.kind, x.text, x.choices, x.copy ? 1 : 0, x.returns]),
    o: g.objs.map((o) => [o.uid, o.card.scryfallId, o.owner, o.controller, o.zone, o.token ? 1 : 0, o.tapped ? 1 : 0, o.prepared ? 1 : 0, o.flipped ? 1 : 0, extraOf(o)]),
    g: g.gone,
    st: g.step,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(shared));
  return toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeGame(code: string): Promise<Game> {
  const bytes = await pipe(fromB64Url(code), new DecompressionStream('deflate-raw'));
  const s = JSON.parse(new TextDecoder().decode(bytes)) as Shared;
  if (s.v !== 1) throw new Error('Unknown version');
  const cards = await fetchByIds([
    ...s.s.map((x) => x[1]),
    ...s.o.map((x) => x[1]),
    ...s.o.flatMap((x) => (x[9]?.u ?? []).map((u) => u[0])),
  ]);
  const maxUid = Math.max(0, ...s.s.map((x) => x[0]), ...s.o.map((x) => x[0]));
  bumpUid(maxUid);
  return {
    players: s.p,
    active: s.a,
    priority: s.pr,
    passed: s.ps,
    resolving: s.r,
    gone: s.g,
    step: s.st ?? 3,
    stack: s.s
      .filter((x) => cards.has(x[1]))
      .map(([uid, id, owner, controller, targets, kind, text, choices, copy, returns]) => ({
        uid,
        card: cards.get(id)!,
        owner,
        controller,
        targets,
        kind: kind ?? 'spell',
        text,
        choices,
        copy: copy === 1,
        returns,
      })),
    objs: s.o
      .filter((x) => cards.has(x[1]))
      .map(([uid, id, owner, controller, zone, token, tapped, prepared, flipped, x]) => ({
        uid,
        card: cards.get(id)!,
        owner,
        controller,
        zone,
        token: token === 1,
        tapped: tapped === 1,
        prepared: prepared === 1,
        flipped: flipped === 1,
        attachedTo: x?.a,
        under: x?.u?.filter((u) => cards.has(u[0])).map((u) => ({ card: cards.get(u[0])!, owner: u[1] })),
        counters: x?.c,
        linkedTo: x?.l,
      })),
  };
}

export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}#s=${code}`;
}

/** Codice di un setup condiviso presente nell'indirizzo, se c'è. */
export function sharedCodeFromUrl(): string | null {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}
