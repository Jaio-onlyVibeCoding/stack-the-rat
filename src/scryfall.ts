// Accesso all'API pubblica di Scryfall: https://scryfall.com/docs/api
// Regole di Scryfall: max ~10 richieste al secondo, header Accept, cache dei risultati.

const API = 'https://api.scryfall.com';
const MIN_GAP_MS = 100;
let nextSlot = 0;

async function waitTurn() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = now + wait + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  await waitTurn(); // distanzia le richieste di almeno 100 ms
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
  layout: string;
  scryfall_uri: string;
  keywords?: string[];
  card_faces?: RawFace[];
  /** missing, placeholder ("immagine non disponibile"), lowres, highres_scan */
  image_status?: string;
}

/** Una faccia (o metà) di una carta con più parti: carta divisa, avventura, bifronte, preparazione. */
export interface Face {
  name: string;
  printedName: string;
  manaCost: string;
  typeLine: string;
  text: string;
  oracleText: string;
  image?: string;
  /** Se una magia lanciata con questa faccia entra sul campo di battaglia */
  isPermanent: boolean;
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
  /** Testo Oracle inglese */
  oracleText: string;
  image?: string;
  art?: string;
  /** Se risolve, entra sul campo di battaglia (CR 608.3) invece di andare al cimitero */
  isPermanent: boolean;
  /** Struttura della carta su Scryfall: normal, split, adventure, modal_dfc, transform, prepare… */
  layout: string;
  /** Facce/metà della carta (vuoto se è una carta semplice) */
  faces: Face[];
  /** Parole chiave inglesi (Kicker, Flashback…) */
  keywords: string[];
  /** Pagina della carta su scryfall.com */
  scryfallUri: string;
  /** Tipo inglese (Oracle) del fronte */
  oracleType: string;
}

const PERMANENT_TYPES = /\b(Creature|Artifact|Enchantment|Planeswalker|Land|Battle)\b/;

export function toCard(r: RawCard): Card {
  // Le carte con più facce hanno immagini e testi dentro card_faces: di default usiamo il fronte
  const f = r.card_faces?.[0];
  const img = r.image_uris ?? f?.image_uris;
  const faces: Face[] = (r.card_faces ?? []).map((x) => ({
    name: x.name,
    printedName: x.printed_name ?? x.name,
    manaCost: x.mana_cost ?? '',
    typeLine: x.printed_type_line ?? x.type_line ?? '',
    text: x.printed_text ?? x.oracle_text ?? '',
    oracleText: x.oracle_text ?? '',
    image: x.image_uris?.normal,
    isPermanent: PERMANENT_TYPES.test(x.type_line ?? ''),
  }));
  // Nome stampato: per le carte con più facce lo ricostruiamo dalle facce
  const printedName =
    r.printed_name ?? (faces.length ? faces.map((x) => x.printedName).join(' // ') : r.name);
  return {
    scryfallId: r.id,
    name: r.name,
    printedName,
    lang: r.lang,
    manaCost: r.mana_cost ?? f?.mana_cost ?? '',
    typeLine: r.printed_type_line ?? r.type_line ?? f?.printed_type_line ?? f?.type_line ?? '',
    text: r.printed_text ?? r.oracle_text ?? faces.map((x) => x.text).join('\n—\n'),
    oracleText: r.oracle_text ?? faces.map((x) => x.oracleText).join('\n—\n'),
    image: img?.normal,
    art: img?.art_crop,
    // tipo inglese (Oracle) del fronte: le carte bifronte lanciate usano il fronte
    isPermanent: PERMANENT_TYPES.test(f?.type_line ?? r.type_line ?? ''),
    layout: r.layout,
    faces,
    keywords: r.keywords ?? [],
    scryfallUri: r.scryfall_uri,
    oracleType: f?.type_line ?? r.type_line ?? '',
  };
}

export interface Suggestion {
  /** Nome inglese (Oracle): identifica la carta */
  name: string;
  /** Nome stampato in un'altra lingua, se la ricerca ha trovato quello */
  printed?: string;
}

/**
 * Suggerimenti mentre si scrive, in qualsiasi lingua.
 * 1) autocomplete di Scryfall: nomi inglesi che iniziano con il testo;
 * 2) ricerca con lang:any: trova anche i nomi stampati in altre lingue (es. "fulmine").
 */
export async function suggest(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const [auto, intl] = await Promise.all([
    get<{ data: string[] }>(`/cards/autocomplete?q=${encodeURIComponent(q)}`, signal),
    get<{ data: RawCard[] }>(
      `/cards/search?q=${encodeURIComponent(`${q} lang:any`)}&unique=cards&order=name`,
      signal,
      // la ricerca estesa è un extra: se fallisce restano i suggerimenti inglesi
    ).catch(() => null),
  ]);
  // Ordine: nome identico al testo, poi nomi che iniziano col testo, poi il resto
  const needle = q.trim().toLowerCase();
  const rank = (s: Suggestion) => {
    const names = [s.printed, s.name].filter(Boolean).map((n) => n!.toLowerCase());
    if (names.some((n) => n === needle)) return 0;
    if (names.some((n) => n.startsWith(needle))) return 1;
    return 2;
  };
  const all: Suggestion[] = (auto?.data ?? []).map((name) => ({ name }));
  const seen = new Set(all.map((s) => s.name));
  for (const c of intl?.data ?? []) {
    if (seen.has(c.name)) continue;
    const printed = c.printed_name ?? c.card_faces?.[0]?.printed_name;
    // Teniamo solo le carte trovate per nome (non per testo o tipo)
    if (![c.name, printed].some((n) => n?.toLowerCase().includes(needle))) continue;
    seen.add(c.name);
    all.push({ name: c.name, printed: printed && printed !== c.name ? printed : undefined });
  }
  // sort è stabile: a parità di rango resta l'ordine di Scryfall
  const out = all.sort((a, b) => rank(a) - rank(b)).slice(0, 25);
  return out;
}

const cache = new Map<string, Card>();

/**
 * Carta per nome esatto: la stampa più leggibile (moderna, normale) nella lingua indicata;
 * se non esiste, usa la versione inglese.
 */
export async function getCard(name: string, scryLang: string): Promise<Card | null> {
  const key = `${name}|${scryLang ?? 'en'}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let card: Card | null = null;
  // Stampa più leggibile: la più recente con cornice moderna (2015), bordo nero, testo vicino all'Oracle.
  // Escluse Secret Lair, promo, versioni speciali (showcase, borderless, full art), digitali e da collezione.
  // Priorità alla lingua: moderna → normale → qualsiasi nella lingua scelta; poi lo stesso in inglese.
  const hasImg = (c: RawCard) =>
    !!(c.image_uris || c.card_faces?.[0]?.image_uris) && c.image_status !== 'missing' && c.image_status !== 'placeholder';
  const base = '-is:promo -is:boosterfun -is:fullart -is:textless -is:oversized -st:memorabilia -st:token -st:funny';
  const tries = [`frame:2015 border:black -set:sld ${base}`, `-set:sld ${base}`, ''];
  outer: for (const l of [...new Set([scryLang || 'en', 'en'])]) {
    for (const extra of tries) {
      const q = encodeURIComponent(`!"${name}" lang:${l} game:paper ${extra}`.trim());
      const r = await get<{ data: RawCard[] }>(`/cards/search?q=${q}&unique=prints&order=released&dir=desc`).catch(() => null);
      // Solo carte con lo stesso nome completo: "!" di Scryfall trova anche carte che hanno
      // quel nome su una faccia sola (es. Emeritus of Conflict // Lightning Bolt)
      const exact = r?.data?.find((c) => c.name === name && hasImg(c));
      if (exact) {
        card = toCard(exact);
        break outer;
      }
    }
  }
  if (!card) {
    const r = await get<RawCard>(`/cards/named?exact=${encodeURIComponent(name)}`);
    if (r) card = toCard(r);
  }
  if (card) cache.set(key, card);
  return card;
}

/** Recupera più carte per id Scryfall (max 75 per richiesta). Usato per caricare un setup condiviso. */
export async function fetchByIds(ids: string[]): Promise<Map<string, Card>> {
  const out = new Map<string, Card>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 75) {
    await waitTurn();
    const res = await fetch(API + '/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers: unique.slice(i, i + 75).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`Scryfall ${res.status}`);
    const j = (await res.json()) as { data: RawCard[] };
    for (const r of j.data) out.set(r.id, toCard(r));
  }
  return out;
}

export interface Ruling {
  source: string;
  published_at: string;
  comment: string;
}
const rulingsCache = new Map<string, Ruling[]>();
/** Chiarimenti ufficiali (rulings) di una carta, in inglese. */
export async function fetchRulings(scryfallId: string): Promise<Ruling[]> {
  const hit = rulingsCache.get(scryfallId);
  if (hit) return hit;
  const r = await get<{ data: Ruling[] }>(`/cards/${scryfallId}/rulings`);
  const data = r?.data ?? [];
  rulingsCache.set(scryfallId, data);
  return data;
}
