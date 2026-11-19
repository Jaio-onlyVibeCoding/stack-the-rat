// Condivisione del setup: lo stato di gioco diventa un link.
// Nel link ci sono solo gli id Scryfall delle carte; chi apre il link le riscarica da Scryfall.
// Il testo è compresso (deflate) e codificato in base64url, dopo "#s=".

import { bumpUid, type Game, type PlayerId, type StackKind, type Zone } from './game';
import { fetchByIds } from './scryfall';

interface Shared {
  v: 1;
  p: PlayerId[];
  a: PlayerId;
  pr: PlayerId | null;
  ps: PlayerId[];
  r: number | null;
  /** pila: [uid, idScryfall, proprietario, controllore, bersagli, tipo, testo abilità] */
  s: [number, string, PlayerId, PlayerId, string[], StackKind?, string?][];
  /** carte: [uid, idScryfall, proprietario, controllore, zona, token] */
  o: [number, string, PlayerId, PlayerId, Zone, 0 | 1][];
  g: Record<string, string>;
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

export async function encodeGame(g: Game): Promise<string> {
  const shared: Shared = {
    v: 1,
    p: g.players,
    a: g.active,
    pr: g.priority,
    ps: g.passed,
    r: g.resolving,
    s: g.stack.map((x) => [x.uid, x.card.scryfallId, x.owner, x.controller, x.targets, x.kind, x.text]),
    o: g.objs.map((o) => [o.uid, o.card.scryfallId, o.owner, o.controller, o.zone, o.token ? 1 : 0]),
    g: g.gone,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(shared));
  return toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeGame(code: string): Promise<Game> {
  const bytes = await pipe(fromB64Url(code), new DecompressionStream('deflate-raw'));
  const s = JSON.parse(new TextDecoder().decode(bytes)) as Shared;
  if (s.v !== 1) throw new Error('Unknown version');
  const cards = await fetchByIds([...s.s.map((x) => x[1]), ...s.o.map((x) => x[1])]);
  const maxUid = Math.max(0, ...s.s.map((x) => x[0]), ...s.o.map((x) => x[0]));
  bumpUid(maxUid);
  return {
    players: s.p,
    active: s.a,
    priority: s.pr,
    passed: s.ps,
    resolving: s.r,
    gone: s.g,
    stack: s.s
      .filter((x) => cards.has(x[1]))
      .map(([uid, id, owner, controller, targets, kind, text]) => ({
        uid,
        card: cards.get(id)!,
        owner,
        controller,
        targets,
        kind: kind ?? 'spell',
        text,
      })),
    objs: s.o
      .filter((x) => cards.has(x[1]))
      .map(([uid, id, owner, controller, zone, token]) => ({
        uid,
        card: cards.get(id)!,
        owner,
        controller,
        zone,
        token: token === 1,
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
