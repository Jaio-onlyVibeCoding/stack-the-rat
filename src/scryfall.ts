// Accesso all'API pubblica di Scryfall: https://scryfall.com/docs/api
// Regole di Scryfall: max ~10 richieste al secondo, header Accept, cache dei risultati.

const API = 'https://api.scryfall.com';
const MIN_GAP_MS = 100;
let nextSlot = 0;

async function get<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  // Distanzia le richieste di almeno 100 ms
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = now + wait + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));

  const res = await fetch(API + path, { headers: { Accept: 'application/json' }, signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scryfall ${res.status}`);
  return (await res.json()) as T;
}

interface RawFace {
  name: string;
  printed_name?: string;
  mana_cost?: string;
  type_line?: string;
  printed_type_line?: string;
  oracle_text?: string;
  printed_text?: string;
  image_uris?: { normal: string; art_crop: string };
}

interface RawCard extends RawFace {
  id: string;
  lang: string;
  card_faces?: RawFace[];
}

export interface Card {
  scryfallId: string;
  /** Nome inglese (Oracle) */
  name: string;
  /** Nome stampato nella lingua della carta */
  printedName: string;
  lang: string;
  manaCost: string;
  typeLine: string;
  text: string;
  image?: string;
  art?: string;
}

function toCard(r: RawCard): Card {
  // Le carte bifronte hanno immagini e testi dentro card_faces: usiamo il fronte
  const f = r.card_faces?.[0];
  const img = r.image_uris ?? f?.image_uris;
  return {
    scryfallId: r.id,
    name: r.name,
    printedName: r.printed_name ?? f?.printed_name ?? r.name,
    lang: r.lang,
    manaCost: r.mana_cost ?? f?.mana_cost ?? '',
    typeLine: r.printed_type_line ?? r.type_line ?? f?.printed_type_line ?? f?.type_line ?? '',
    text: r.printed_text ?? r.oracle_text ?? f?.printed_text ?? f?.oracle_text ?? '',
    image: img?.normal,
    art: img?.art_crop,
  };
}

/** Suggerimenti di nomi (in inglese) mentre si scrive. */
export async function autocomplete(q: string, signal?: AbortSignal): Promise<string[]> {
  const r = await get<{ data: string[] }>(`/cards/autocomplete?q=${encodeURIComponent(q)}`, signal);
  return r?.data ?? [];
}

const cache = new Map<string, Card>();

/**
 * Carta per nome esatto. Se è indicata una lingua, prova la stampa più recente in quella lingua;
 * se non esiste, usa la versione inglese.
 */
export async function getCard(name: string, scryLang: string | null): Promise<Card | null> {
  const key = `${name}|${scryLang ?? 'en'}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let card: Card | null = null;
  if (scryLang && scryLang !== 'en') {
    const q = encodeURIComponent(`!"${name}" lang:${scryLang}`);
    const r = await get<{ data: RawCard[] }>(`/cards/search?q=${q}&unique=prints&order=released&dir=desc`);
    if (r?.data?.length) card = toCard(r.data[0]);
  }
  if (!card) {
    const r = await get<RawCard>(`/cards/named?exact=${encodeURIComponent(name)}`);
    if (r) card = toCard(r);
  }
  if (card) cache.set(key, card);
  return card;
}
