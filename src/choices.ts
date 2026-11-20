// Scelte fatte lanciando una magia o attivando un'abilità (CR 601.2b–d):
// faccia/metà da lanciare, modalità, valore di X, costi aggiuntivi o alternativi, altre scelte libere.

import type { Card, Face } from './scryfall';

export interface Choices {
  /** indice della faccia lanciata (carte divise, avventure, bifronte modali) */
  face?: number;
  /** valore scelto per X */
  x?: number;
  /** indici delle modalità scelte */
  modes?: number[];
  /** costi aggiuntivi o alternativi pagati (parole chiave inglesi: Kicker, Flashback…) */
  extras?: string[];
  /** altre scelte, testo libero */
  note?: string;
}

/** Carte di cui si può scegliere quale faccia/metà lanciare dalla mano. */
const FACE_LAYOUTS = ['split', 'adventure', 'modal_dfc'];
export const canChooseFace = (c: Card) => FACE_LAYOUTS.includes(c.layout) && c.faces.length > 1;

/** Costi aggiuntivi: si pagano in più (CR 118.8). */
export const ADDITIONAL_COSTS = [
  'Kicker', 'Multikicker', 'Buyback', 'Entwine', 'Bargain', 'Offspring', 'Gift', 'Casualty',
  'Replicate', 'Squad', 'Conspire', 'Splice', 'Strive', 'Escalate',
];
/** Costi alternativi: sostituiscono il costo di mana; se ne può usare uno solo (CR 118.9a). */
export const ALTERNATIVE_COSTS = [
  'Flashback', 'Escape', 'Overload', 'Evoke', 'Dash', 'Blitz', 'Prowl', 'Surge', 'Emerge', 'Spectacle',
  'Madness', 'Foretell', 'Disturb', 'Mutate', 'Plot', 'Miracle', 'Awaken', 'Jump-start', 'Retrace',
  'Cleave', 'Freerunning', 'Impending', 'Harmonize', 'Warp', 'Sneak',
];

/** Faccia effettivamente in pila (o null se la carta è semplice). */
export function chosenFace(card: Card, ch?: Choices, copyOfPrepared = false): Face | null {
  if (copyOfPrepared) return card.faces[1] ?? null;
  if (!canChooseFace(card)) return null;
  return card.faces[ch?.face ?? 0] ?? null;
}

export function hasX(card: Card, face: Face | null): boolean {
  return (face?.manaCost ?? card.manaCost).includes('{X}');
}

/**
 * Modalità di una carta modale ("Choose one —" seguito da righe "•", oppure Spree con righe "+").
 * Usa le righe stampate se sono tante quante quelle Oracle, altrimenti quelle Oracle.
 */
export function parseModes(card: Card, face: Face | null): { max: number; options: string[] } | null {
  const oracle = (face?.oracleText ?? card.oracleText).split('\n');
  const printed = (face?.text ?? card.text).split('\n');
  const spree = card.keywords.includes('Spree');
  const header = oracle.find((l) => /^Choose (one or both|one or more|any number|one|two|three|four)\b/i.test(l));
  if (!header && !spree) return null;
  const isMode = (l: string) => l.startsWith('•') || (spree && l.startsWith('+'));
  const oModes = oracle.filter(isMode);
  if (!oModes.length) return null;
  const pModes = printed.filter(isMode);
  const options = (pModes.length === oModes.length ? pModes : oModes).map((l) => l.replace(/^[•+]\s*/, ''));
  const word = header?.match(/^Choose (one or both|one or more|any number|one|two|three|four)/i)?.[1].toLowerCase();
  const limits: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, 'one or both': 2 };
  const max = word && word in limits ? limits[word] : options.length;
  return { max, options };
}

/** Parole chiave della carta che corrispondono a costi aggiuntivi o alternativi. */
export function costKeywords(card: Card) {
  return {
    additional: card.keywords.filter((k) => ADDITIONAL_COSTS.includes(k)),
    alternative: card.keywords.filter((k) => ALTERNATIVE_COSTS.includes(k)),
  };
}

/** Breve riepilogo delle scelte, da mostrare sulla carta in pila e nello storico. */
export function summarize(card: Card, ch: Choices | undefined, labels: { mode: string }): string[] {
  if (!ch) return [];
  const out: string[] = [];
  const face = canChooseFace(card) && ch.face !== undefined ? card.faces[ch.face] : null;
  if (face) out.push(face.printedName);
  if (ch.x !== undefined) out.push(`X=${ch.x}`);
  if (ch.modes?.length) out.push(`${labels.mode} ${ch.modes.map((m) => m + 1).join('+')}`);
  for (const e of ch.extras ?? []) out.push(e);
  if (ch.note) out.push(ch.note);
  return out;
}
