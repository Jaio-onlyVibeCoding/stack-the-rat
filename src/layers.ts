// Calcolatore dei layer (CR 613): ordina gli effetti continui inseriti a mano
// per layer/sottolayer e poi per timestamp (ordine nell'elenco), e calcola forza e costituzione.
import { LAYER_IDS, type CardObj, type Effect, type LayerId } from './game';

export interface LayerLine {
  layer: LayerId;
  /** effetto inserito dall'utente, oppure riga automatica (segnalini, a faccia in giù) */
  effect?: Effect;
  auto?: 'counters' | 'faceDown';
  /** forza/costituzione dopo questa riga (solo L-7) */
  pt?: [number, number];
  /** valore dei segnalini (riga automatica) */
  counters?: [number, number];
}

export interface LayerResult {
  lines: LayerLine[];
  /** forza/costituzione finali, se l'oggetto ne ha */
  pt?: [number, number];
  /** stampa con * (abilità che definisce le caratteristiche): va inserita come L-7a */
  star: boolean;
}

const num = (s?: string) => {
  if (s === undefined) return undefined;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
};

const isFaceDown = (o: CardObj) =>
  !!o.flipped && o.card.faces.filter((f) => f.image).length <= 1 && o.card.layout !== 'flip';

/** Forza/costituzione stampate della faccia visibile (a faccia in giù: 2/2, CR 708.2a) */
function printed(o: CardObj): { p?: string; t?: string } {
  if (isFaceDown(o)) return { p: '2', t: '2' };
  if (o.flipped && o.card.faces[1]) return { p: o.card.faces[1].power, t: o.card.faces[1].toughness };
  return { p: o.card.power, t: o.card.toughness };
}

export function computeLayers(o: CardObj): LayerResult {
  const effects = o.effects ?? [];
  const order = (e: Effect) => LAYER_IDS.indexOf(e.layer);
  // ordinamento stabile: a parità di layer resta l'ordine di inserimento (timestamp)
  const sorted = effects.map((e, i) => ({ e, i })).sort((a, b) => order(a.e) - order(b.e) || a.i - b.i).map((x) => x.e);

  const pr = printed(o);
  const star = !isFaceDown(o) && [pr.p, pr.t].some((x) => x?.includes('*'));
  const hasPT = pr.p !== undefined || effects.some((e) => e.layer === '7a' || e.layer === '7b');
  let p = num(pr.p) ?? 0;
  let t = num(pr.t) ?? 0;
  let switched = false;
  const c1 = o.counters?.['+1/+1'] ?? 0;
  const c2 = o.counters?.['-1/-1'] ?? 0;

  const lines: LayerLine[] = [];
  if (isFaceDown(o)) lines.push({ layer: '1b', auto: 'faceDown' });
  let countersDone = false;
  const addCounters = () => {
    if (countersDone) return;
    countersDone = true;
    if (!c1 && !c2) return;
    p += c1 - c2;
    t += c1 - c2;
    lines.push({ layer: '7c', auto: 'counters', counters: [c1 - c2, c1 - c2], pt: [p, t] });
  };
  for (const e of sorted) {
    // i segnalini sono nel 7c (CR 613.4c): li mettiamo prima degli effetti 7c inseriti; l'ordine nel 7c non cambia la somma
    if (e.layer === '7c' || e.layer === '7d') addCounters();
    if (e.layer === '7a' || e.layer === '7b') {
      if (e.p !== undefined) p = e.p;
      if (e.t !== undefined) t = e.t;
    } else if (e.layer === '7c') {
      p += e.p ?? 0;
      t += e.t ?? 0;
    } else if (e.layer === '7d') {
      switched = !switched;
    }
    const shown: [number, number] = switched && e.layer === '7d' ? [t, p] : [p, t];
    lines.push({ layer: e.layer, effect: e, pt: e.layer.startsWith('7') ? shown : undefined });
  }
  addCounters();
  const final: [number, number] = switched ? [t, p] : [p, t];
  // la riga 7d mostra il valore dopo lo scambio: le righe 7d successive alternano
  if (switched || effects.some((e) => e.layer === '7d')) {
    let sw = false;
    for (const l of lines) if (l.layer === '7d' && l.effect) {
      sw = !sw;
      l.pt = sw ? [t, p] : [p, t];
    }
  }
  return { lines, pt: hasPT ? final : undefined, star };
}

/** Formattazione di un valore di forza/costituzione con il segno (per L-7c) */
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
