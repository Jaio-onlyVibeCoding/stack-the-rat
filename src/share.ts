// Condivisione del setup: lo stato di gioco (e, se richiesto, tutto lo storico) diventa un link.
// Nel link ci sono solo gli id Scryfall delle carte; chi apre il link le riscarica da Scryfall.
// Il testo è compresso (deflate) e codificato in base64url, dopo "#s=".
//
// Formati:
//   v1: una sola condizione di gioco (link creati prima dello storico condiviso; ancora leggibili)
//   v2: elenco di condizioni [ora, messaggi, partita] + posizione attuale nello storico

import { bumpUid, type Game, type PlayerId, type StackKind, type Zone } from './game';
import type { Choices } from './choices';
import { fetchByIds, type Card } from './scryfall';

/** Dati in più di una carta: attaccata a, carte sotto (mutare), segnalini, collegata a */
interface Extra {
  a?: number;
  u?: [string, PlayerId][];
  c?: Record<string, number>;
  l?: number;
}

/** Una condizione di gioco in forma compatta */
interface Compact {
  p: PlayerId[];
  a: PlayerId;
  pr: PlayerId | null;
  ps: PlayerId[];
  r: number | null;
  /** pila: [uid, idScryfall, proprietario, controllore, bersagli, tipo, testo abilità, scelte, copia, carte che tornano] */
  s: [number, string, PlayerId, PlayerId, string[], StackKind?, string?, Choices?, (0 | 1)?, number[]?][];
  /** carte: [uid, idScryfall, proprietario, controllore, zona, token, tappata, preparata, girata, extra] */
  o: [number, string, PlayerId, PlayerId, Zone, 0 | 1, (0 | 1)?, (0 | 1)?, (0 | 1)?, Extra?][];
  g: Record<string, string>;
  /** sottofase */
  st?: number;
}

interface SharedV1 extends Compact {
  v: 1;
}

interface SharedV2 {
  v: 2;
  /** storico: [ora, messaggi, condizione] */
  h: [string, string[], Compact][];
  /** posizione attuale nello storico */
  i: number;
}

/** Ciò che serve all'app: le condizioni con i loro messaggi e la posizione attuale. */
export interface SharedTimeline {
  timeline: { game: Game; messages: string[]; time: string }[];
  pos: number;
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

function toCompact(g: Game): Compact {
  return {
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
}

/** Id Scryfall di tutte le carte di una condizione */
const idsOf = (c: Compact) => [
  ...c.s.map((x) => x[1]),
  ...c.o.map((x) => x[1]),
  ...c.o.flatMap((x) => (x[9]?.u ?? []).map((u) => u[0])),
];
const maxUidOf = (c: Compact) => Math.max(0, ...c.s.map((x) => x[0]), ...c.o.map((x) => x[0]));

function fromCompact(s: Compact, cards: Map<string, Card>): Game {
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

/**
 * Crea il codice da mettere nel link.
 * withHistory = true: tutto lo storico (avanti/indietro funzionano anche per chi apre il link);
 * false: solo la condizione attuale.
 */
export async function encodeShare(
  timeline: SharedTimeline['timeline'],
  pos: number,
  withHistory: boolean,
): Promise<string> {
  const shared: SharedV2 = withHistory
    ? { v: 2, h: timeline.map((s) => [s.time, s.messages, toCompact(s.game)]), i: pos }
    : { v: 2, h: [[timeline[pos].time, [], toCompact(timeline[pos].game)]], i: 0 };
  const bytes = new TextEncoder().encode(JSON.stringify(shared));
  return toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeShare(code: string): Promise<SharedTimeline> {
  const bytes = await pipe(fromB64Url(code), new DecompressionStream('deflate-raw'));
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as SharedV1 | SharedV2;
  let snaps: [string, string[], Compact][];
  if (raw.v === 1) snaps = [['', [], raw]];
  else if (raw.v === 2) snaps = raw.h;
  else throw new Error('Unknown version');
  const cards = await fetchByIds(snaps.flatMap((s) => idsOf(s[2])));
  bumpUid(Math.max(0, ...snaps.map((s) => maxUidOf(s[2]))));
  const timeline = snaps.map(([time, messages, c]) => ({ time, messages, game: fromCompact(c, cards) }));
  const pos = raw.v === 2 ? Math.min(Math.max(0, raw.i), timeline.length - 1) : 0;
  return { timeline, pos };
}

/** Archivio dei link brevi (Cloudflare Worker, vedi cloudflare/README.md) */
export const SHORT_LINK_URL = 'https://stack-the-rat.jaio-vibes.workers.dev';

/** Salva il codice nell'archivio e restituisce il link corto; null se l'archivio non risponde. */
export async function shortLink(code: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${SHORT_LINK_URL}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: code,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id?: string };
    return id ? `${SHORT_LINK_URL}/${id}` : null;
  } catch {
    return null;
  }
}

export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}#s=${code}`;
}

/** Codice di un setup condiviso presente nell'indirizzo, se c'è. */
export function sharedCodeFromUrl(): string | null {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}
