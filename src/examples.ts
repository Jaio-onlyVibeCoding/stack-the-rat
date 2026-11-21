// Esempi prestabiliti sui layer (CR 613). Ogni esempio è una serie di passi: ogni passo è
// uno stato del gioco (va nello storico) con una spiegazione e la tabella dei layer.
// Nei testi, {ref} viene sostituito dal nome stampato della carta (nella lingua dell'interfaccia).
import { initialGame, newUid, objKey, type CardObj, type Game, type PlayerId, type StackItem } from './game';
import type { Card } from './scryfall';
import type { Lang } from './i18n';

export type L = { en: string; it: string };
export interface LayerRow {
  /** layer o sottolayer: 1a, 2, 4, 7c… */
  l: string;
  t: L;
}
export interface StepInfo {
  /** riga nello storico */
  log: L;
  /** spiegazione */
  text: L;
  rows?: LayerRow[];
  /** etichette sulle carte: ref → forza/costituzione (in basso a destra) */
  badges?: Record<string, string | L>;
  /** etichette di testo: ref → tipo, nome copiato… (all'altezza dei segnalini) */
  tags?: Record<string, string | L>;
}
export interface ExampleDef {
  id: string;
  /** numero mostrato nell'elenco: 1a, 1b, 2… */
  num: string;
  title: L;
  sub: L;
  /** ref → nome inglese della carta */
  cards: Record<string, string>;
  build: (b: Builder) => void;
}
export interface BuiltStep {
  game: Game;
  info: StepInfo;
  /** uid → etichetta */
  badges: Record<number, string | L>;
  tags: Record<number, string | L>;
}

const A: PlayerId = 'A';
const B: PlayerId = 'B';

/** Costruisce gli stati di un esempio a partire da riferimenti simbolici alle carte. */
export class Builder {
  g: Game = { ...initialGame(), objs: [], stack: [], gone: {} };
  steps: BuiltStep[] = [];
  /** ref → uid attuale (cambia quando l'oggetto cambia zona) */
  uid: Record<string, number> = {};
  constructor(public cards: Record<string, Card>, public lang: Lang) {}

  private card(ref: string): Card {
    const key = ref.replace(/\d+$/, '');
    return this.cards[ref] ?? this.cards[key];
  }
  key(ref: string): string {
    if (ref.startsWith('player:')) return ref;
    const u = this.uid[ref];
    if (this.g.stack.some((x) => x.uid === u)) return objKey.stack(u);
    return objKey.perm(u);
  }
  perm(ref: string, p: PlayerId, extra: Partial<CardObj> = {}) {
    const uid = newUid();
    this.uid[ref] = uid;
    this.g = { ...this.g, objs: [...this.g.objs, { uid, card: this.card(ref), owner: p, controller: p, zone: 'battlefield', ...extra }] };
    return this;
  }
  set(ref: string, patch: Partial<CardObj>) {
    const u = this.uid[ref];
    this.g = { ...this.g, objs: this.g.objs.map((o) => (o.uid === u ? { ...o, ...patch } : o)) };
    return this;
  }
  /** al cimitero del proprietario */
  bury(ref: string) {
    const u = this.uid[ref];
    const o = this.g.objs.find((x) => x.uid === u)!;
    const nu = newUid();
    this.uid[ref] = nu;
    this.g = {
      ...this.g,
      objs: [...this.g.objs.filter((x) => x.uid !== u), { uid: nu, card: o.card, owner: o.owner, controller: o.owner, zone: 'graveyard' }],
      gone: { ...this.g.gone, [objKey.perm(u)]: `gy:${o.owner}` },
    };
    return this;
  }
  /** esce e rientra subito (es. Cloudshift): nuovo oggetto (CR 400.7) */
  reenter(ref: string, patch: Partial<CardObj> = {}) {
    const u = this.uid[ref];
    const o = this.g.objs.find((x) => x.uid === u)!;
    const nu = newUid();
    this.uid[ref] = nu;
    this.g = {
      ...this.g,
      objs: [...this.g.objs.filter((x) => x.uid !== u), { uid: nu, card: o.card, owner: o.owner, controller: o.owner, zone: 'battlefield', ...patch }],
      gone: { ...this.g.gone, [objKey.perm(u)]: objKey.perm(nu) },
    };
    return this;
  }
  private push(ref: string, item: Omit<StackItem, 'uid'>) {
    const uid = newUid();
    this.uid[ref] = uid;
    this.g = { ...this.g, stack: [...this.g.stack, { uid, ...item }] };
  }
  cast(ref: string, p: PlayerId, targets: string[] = []) {
    this.push(ref, { card: this.card(ref), owner: p, controller: p, targets: targets.map((t) => this.key(t)), kind: 'spell' });
    return this;
  }
  /** abilità innescata: ref è il nome dell'oggetto nello storico, source la carta che la genera */
  trigger(ref: string, source: string, p: PlayerId, text: L) {
    this.push(ref, { card: this.card(source), owner: p, controller: p, targets: [], kind: 'triggered', text: fillCards(pick(text, this.lang), this.cards) });
    return this;
  }
  /** risolve l'oggetto in cima: un permanente entra sul campo, una magia va al cimitero, un'abilità cessa di esistere */
  resolve(ref: string) {
    const top = this.g.stack[this.g.stack.length - 1];
    const stack = this.g.stack.slice(0, -1);
    if (top.kind !== 'spell') {
      this.g = { ...this.g, stack };
      return this;
    }
    const nu = newUid();
    this.uid[ref] = nu;
    const zone = top.card.isPermanent ? 'battlefield' : 'graveyard';
    this.g = {
      ...this.g,
      stack,
      objs: [...this.g.objs, { uid: nu, card: top.card, owner: top.owner, controller: top.controller, zone }],
      gone: { ...this.g.gone, [objKey.stack(top.uid)]: zone === 'battlefield' ? objKey.perm(nu) : `gy:${top.owner}` },
    };
    return this;
  }
  active(p: PlayerId) {
    this.g = { ...this.g, active: p, priority: p };
    return this;
  }
  snap(info: StepInfo) {
    const byUid = (m?: Record<string, string | L>) => {
      const out: Record<number, string | L> = {};
      for (const [ref, v] of Object.entries(m ?? {})) if (this.uid[ref] !== undefined) out[this.uid[ref]] = v;
      return out;
    };
    this.steps.push({ game: this.g, info, badges: byUid(info.badges), tags: byUid(info.tags) });
    return this;
  }
}

/** Sostituisce {ref} con il nome stampato della carta. */
export function fillCards(s: string, cards: Record<string, Card>): string {
  // {ref} = nome della carta; {ref.0} / {ref.1} = nome di una faccia
  return s.replace(/\{(\w+)(?:\.(\d))?\}/g, (m, ref: string, face?: string) => {
    const c = cards[ref] ?? cards[ref.replace(/\d+$/, '')];
    if (!c) return m;
    if (face !== undefined) return c.faces[+face]?.printedName ?? c.printedName;
    return c.printedName;
  });
}
export const pick = (x: L | string, lang: Lang) => (typeof x === 'string' ? x : x[lang] ?? x.en);

const r = (l: string, en: string, it: string): LayerRow => ({ l, t: { en, it } });
const s = (en: string, it: string): L => ({ en, it });

const TITLE_1 = s('Static ability or spell/ability effect?', 'Abilità statica o effetto di una magia/abilità?');
const TITLE_3 = s('Switching power and toughness is always last (L-7d)', 'Invertire forza e costituzione è sempre l’ultimo passo (L-7d)');
const TITLE_4 = s('You can copy only copiable values (L-1a)', 'Puoi copiare solo i valori copiabili (L-1a)');
const TITLE_9 = s('An effect that started does not stop (613.6, L-4, L-6, L-7b)', 'Un effetto già iniziato non si ferma (613.6, L-4, L-6, L-7b)');

export const EXAMPLES: ExampleDef[] = [
  {
    id: 'static-vs-spell',
    num: '1a',
    title: TITLE_1,
    sub: s('Who is affected and for how long', 'Chi viene colpito e per quanto'),
    cards: { anthem: 'Glorious Anthem', charge: 'Inspired Charge', bear: 'Grizzly Bears', dis: 'Disenchant' },
    build: (b) => {
      b.perm('anthem', A).perm('bear1', A).snap({
        log: s('Setup: {anthem} and {bear1}.', 'Situazione: {anthem} e {bear1}.'),
        text: s(
          '{anthem} has a static ability: your creatures get +1/+1 as long as it is on the battlefield (CR 604). The affected group is checked continuously (611.3a).',
          "{anthem} ha un'abilità statica: le tue creature prendono +1/+1 finché è sul campo (CR 604). Il gruppo colpito si controlla in ogni momento (611.3a).",
        ),
        rows: [r('L-7c', '{anthem}: +1/+1 (static ability)', '{anthem}: +1/+1 (abilità statica)')],
        badges: { bear1: '3/3' },
      });
      b.cast('charge', A).snap({
        log: s('A casts {charge}.', 'A lancia {charge}.'),
        text: s('{charge} is on the stack: it does nothing until it resolves.', '{charge} è in pila: non fa niente finché non si risolve.'),
        badges: { bear1: '3/3' },
      });
      b.resolve('charge').snap({
        log: s('{charge} resolves.', '{charge} si risolve.'),
        text: s(
          'It creates a continuous effect until end of turn. The affected group is locked in now: only the creatures you control right now (611.2c).',
          'Crea un effetto continuo fino alla fine del turno. Il gruppo colpito si fissa adesso: solo le creature che controlli in questo momento (611.2c).',
        ),
        rows: [
          r('L-7c', '{anthem}: +1/+1 (static, timestamp of the permanent, 613.7a)', '{anthem}: +1/+1 (statica, timestamp del permanente, 613.7a)'),
          r('L-7c', '{charge}: +2/+1 (resolved, timestamp of resolution, 613.7b)', '{charge}: +2/+1 (risolta, timestamp della risoluzione, 613.7b)'),
        ],
        badges: { bear1: '5/4' },
      });
      b.perm('bear2', A).snap({
        log: s('A second {bear2} enters.', 'Entra un secondo {bear2}.'),
        text: s(
          "The new {bear2} gets the {anthem} bonus (static ability), but not the {charge} bonus: it wasn't there when the spell resolved.",
          'Il nuovo {bear2} prende il bonus di {anthem} (abilità statica), ma non quello di {charge}: non c’era quando la magia si è risolta.',
        ),
        rows: [r('L-7c', 'Second {bear2}: only {anthem} +1/+1', 'Secondo {bear2}: solo {anthem} +1/+1')],
        badges: { bear1: '5/4', bear2: '3/3' },
      });
      b.cast('dis', B, ['anthem']).snap({
        log: s('B casts {dis} targeting {anthem}.', 'B lancia {dis} su {anthem}.'),
        text: s('{dis} will destroy {anthem}.', '{dis} distruggerà {anthem}.'),
        badges: { bear1: '5/4', bear2: '3/3' },
      });
      b.resolve('dis').bury('anthem').snap({
        log: s('{dis} resolves: {anthem} is destroyed.', '{dis} si risolve: {anthem} viene distrutto.'),
        text: s(
          'Without {anthem} its static ability stops immediately: both creatures lose its +1/+1. The {charge} effect stays until end of turn, but only on the first {bear1}.',
          'Senza {anthem} la sua abilità statica smette subito di funzionare: entrambe le creature perdono il suo +1/+1. L’effetto di {charge} resta fino alla fine del turno, ma solo sul primo {bear1}.',
        ),
        rows: [
          r('L-7c', 'First {bear1}: {charge} +2/+1 → 4/3', 'Primo {bear1}: {charge} +2/+1 → 4/3'),
          r('L-7c', 'Second {bear2}: nothing → 2/2', 'Secondo {bear2}: niente → 2/2'),
        ],
        badges: { bear1: '4/3', bear2: '2/2' },
      });
    },
  },
  {
    id: 'same-layer',
    num: '1b',
    title: TITLE_1,
    sub: s('Interaction in the same layer', 'Interazione nello stesso layer'),
    cards: { humility: 'Humility', bear: 'Grizzly Bears', wings: 'Wings of Velis Vel' },
    build: (b) => {
      b.perm('humility1', A).perm('bear', A).snap({
        log: s('Setup: {humility1} and {bear} of A.', 'Situazione: {humility1} e {bear} di A.'),
        text: s(
          '{humility1} has a static ability: all creatures lose all abilities and have base power and toughness 1/1 (L-6, L-7b).',
          '{humility1} ha un’abilità statica: tutte le creature perdono le abilità e hanno forza e costituzione base 1/1 (L-6, L-7b).',
        ),
        rows: [r('L-7b', '{humility1}: base 1/1', '{humility1}: base 1/1')],
        badges: { bear: '1/1' },
      });
      b.cast('wings', A, ['bear']).snap({
        log: s('A casts {wings} targeting {bear}.', 'A lancia {wings} su {bear}.'),
        text: s(
          'Until end of turn: base power and toughness 4/4, all creature types, flying.',
          'Fino alla fine del turno: forza e costituzione base 4/4, tutti i tipi di creatura, volare.',
        ),
        badges: { bear: '1/1' },
      });
      b.resolve('wings').snap({
        log: s('{wings} resolves.', '{wings} si risolve.'),
        text: s(
          'Two effects that set power and toughness, both in L-7b: the timestamp decides. {humility1} has the timestamp of the permanent (613.7a), {wings} that of its resolution (613.7b): it is newer, so it applies after and wins. Same in L-6: {humility1} removes the abilities, then {wings} gives flying.',
          'Due effetti che impostano forza e costituzione, entrambi nel L-7b: decide il timestamp. {humility1} ha il timestamp del permanente (613.7a), {wings} quello della risoluzione (613.7b): è più recente, quindi si applica dopo e vince. Lo stesso nel L-6: {humility1} toglie le abilità, poi {wings} dà volare.',
        ),
        rows: [
          r('L-6', '{humility1}: no abilities → {wings}: flying', '{humility1}: nessuna abilità → {wings}: volare'),
          r('L-7b', '{humility1} 1/1 → {wings} 4/4', '{humility1} 1/1 → {wings} 4/4'),
        ],
        badges: { bear: '4/4' },
        tags: { bear: s('Flying', 'Volare') },
      });
      b.cast('humility2', B).snap({
        log: s('B casts a second {humility2}.', 'B lancia una seconda {humility2}.'),
        text: s('When it resolves it will have the newest timestamp.', 'Quando si risolve avrà il timestamp più recente.'),
        badges: { bear: '4/4' },
        tags: { bear: s('Flying', 'Volare') },
      });
      b.resolve('humility2').snap({
        log: s('The second {humility2} resolves.', 'La seconda {humility2} si risolve.'),
        text: s(
          'Now the newest effect is the second {humility2}: in L-6 it removes flying, in L-7b it sets 1/1 after {wings}. The ruling of {wings} says it: it overwrites only the setting effects that existed before it resolved.',
          'Ora l’effetto più recente è la seconda {humility2}: nel L-6 toglie volare, nel L-7b imposta 1/1 dopo {wings}. Lo dice il ruling di {wings}: sovrascrive solo gli effetti di impostazione che esistevano prima della sua risoluzione.',
        ),
        rows: [
          r('L-6', '{humility1} → {wings}: flying → {humility2}: no abilities', '{humility1} → {wings}: volare → {humility2}: nessuna abilità'),
          r('L-7b', '{humility1} 1/1 → {wings} 4/4 → {humility2} 1/1', '{humility1} 1/1 → {wings} 4/4 → {humility2} 1/1'),
        ],
        badges: { bear: '1/1' },
      });
    },
  },
  {
    id: 'set-modify',
    num: '2',
    title: s('Setting and modifying power (L-7b, L-7c)', 'Impostare e modificare la forza (L-7b, L-7c)'),
    sub: s('', ''),
    cards: { frog: 'Turn to Frog', bear: 'Grizzly Bears', growth: 'Giant Growth' },
    build: (b) => {
      b.perm('bear', B, { counters: { '+1/+1': 2 } }).snap({
        log: s('Setup: {bear} of B with two +1/+1 counters.', 'Situazione: {bear} di B con due segnalini +1/+1.'),
        text: s('2/2 base, 2× +1/+1 counters (L-7c): 4/4.', '2/2 base, 2× segnalini +1/+1 (L-7c): 4/4.'),
        rows: [r('L-7c', '2× +1/+1 counters', '2× segnalini +1/+1')],
        badges: { bear: '4/4' },
      });
      b.cast('frog', A, ['bear']).snap({
        log: s('A casts {frog} targeting {bear}.', 'A lancia {frog} su {bear}.'),
        text: s('B can respond.', 'B può rispondere.'),
        badges: { bear: '4/4' },
      });
      b.cast('growth', B, ['bear']).snap({
        log: s('B responds with {growth} on {bear}.', 'B risponde con {growth} su {bear}.'),
        text: s('{growth} is on top: it resolves first.', '{growth} è in cima: si risolve per prima.'),
        badges: { bear: '4/4' },
      });
      b.resolve('growth').snap({
        log: s('{growth} resolves.', '{growth} si risolve.'),
        text: s('+3/+3 until end of turn (L-7c): 7/7.', '+3/+3 fino alla fine del turno (L-7c): 7/7.'),
        rows: [r('L-7c', '2× +1/+1 counters, {growth} +3/+3', '2× segnalini +1/+1, {growth} +3/+3')],
        badges: { bear: '7/7' },
      });
      b.resolve('frog').snap({
        log: s('{frog} resolves.', '{frog} si risolve.'),
        text: s(
          '{frog} resolved later, but "becomes 1/1" is applied in L-7b, before all the modifications in L-7c. {growth} is not cancelled: 1/1 +2/+2 +3/+3 = 6/6.',
          '{frog} si è risolta dopo, ma "diventa 1/1" si applica nel L-7b, prima di tutte le modifiche del L-7c. {growth} non viene cancellata: 1/1 +2/+2 +3/+3 = 6/6.',
        ),
        rows: [
          r('L-4', 'Frog (loses creature type Bear)', 'Rana (perde il tipo Orso)'),
          r('L-5', 'Blue', 'Blu'),
          r('L-6', 'Loses all abilities', 'Perde tutte le abilità'),
          r('L-7b', '{frog}: base 1/1', '{frog}: base 1/1'),
          r('L-7c', '2× +1/+1 counters, {growth} +3/+3', '2× segnalini +1/+1, {growth} +3/+3'),
        ],
        badges: { bear: '6/6' },
      });
    },
  },
  {
    id: 'switch',
    num: '3a',
    title: TITLE_3,
    sub: s('The result you do not expect', 'Il risultato che non ti aspetti'),
    cards: { wall: 'Wall of Stone', growth: 'Giant Growth', inside: 'Inside Out', brute: 'Brute Strength' },
    build: (b) => {
      b.perm('wall', A).snap({
        log: s('Setup: {wall} (0/8).', 'Situazione: {wall} (0/8).'),
        text: s(
          'We start with {growth}: if {inside} came first, {wall} would become 8/0 and die (toughness 0, 704.5f).',
          'Si parte con {growth}: se arrivasse prima {inside}, {wall} diventerebbe 8/0 e morirebbe (costituzione 0, 704.5f).',
        ),
        badges: { wall: '0/8' },
      });
      b.cast('growth', A, ['wall']).snap({
        log: s('A casts {growth} targeting {wall}.', 'A lancia {growth} su {wall}.'),
        text: s('+3/+3 until end of turn, when it resolves.', '+3/+3 fino alla fine del turno, quando si risolve.'),
        badges: { wall: '0/8' },
      });
      b.resolve('growth').snap({
        log: s('{growth} resolves.', '{growth} si risolve.'),
        text: s('0/8 +3/+3 = 3/11 (L-7c).', '0/8 +3/+3 = 3/11 (L-7c).'),
        rows: [r('L-7c', '{growth} +3/+3 → 3/11', '{growth} +3/+3 → 3/11')],
        badges: { wall: '3/11' },
      });
      b.cast('inside', A, ['wall']).snap({
        log: s('A casts {inside} targeting {wall}.', 'A lancia {inside} su {wall}.'),
        text: s('It will switch power and toughness until end of turn.', 'Scambierà forza e costituzione fino alla fine del turno.'),
        badges: { wall: '3/11' },
      });
      b.resolve('inside').snap({
        log: s('{inside} resolves.', '{inside} si risolve.'),
        text: s('The switch is applied in L-7d, after everything else: 3/11 → 11/3.', 'Lo scambio si applica nel L-7d, dopo tutto il resto: 3/11 → 11/3.'),
        rows: [r('L-7c', '{growth} +3/+3 → 3/11', '{growth} +3/+3 → 3/11'), r('L-7d', '{inside}: switch → 11/3', '{inside}: scambio → 11/3')],
        badges: { wall: '11/3' },
      });
      b.cast('brute', A, ['wall']).snap({
        log: s('A casts {brute} (+3/+1) targeting {wall}.', 'A lancia {brute} (+3/+1) su {wall}.'),
        text: s(
          'It arrives after the switch. Will {wall} be 11/3 +3/+1 = 14/4? No: see the next step.',
          'Arriva dopo lo scambio. {wall} sarà 11/3 +3/+1 = 14/4? No: guarda il passo successivo.',
        ),
        badges: { wall: '11/3' },
      });
      b.resolve('brute').snap({
        log: s('{brute} resolves.', '{brute} si risolve.'),
        text: s(
          'All the +X/+X are added in L-7c, and only then the switch is applied in L-7d, whatever the order of the spells: 0/8 +3/+3 +3/+1 = 6/12, switched = 12/6.',
          'Tutti i +X/+X si sommano nel L-7c, e solo dopo si applica lo scambio nel L-7d, in qualunque ordine siano arrivate le magie: 0/8 +3/+3 +3/+1 = 6/12, invertito = 12/6.',
        ),
        rows: [r('L-7c', '{growth} +3/+3, {brute} +3/+1 → 6/12', '{growth} +3/+3, {brute} +3/+1 → 6/12'), r('L-7d', '{inside}: switch → 12/6', '{inside}: scambio → 12/6')],
        badges: { wall: '12/6' },
      });
    },
  },
  {
    id: 'tifa',
    num: '3b',
    title: TITLE_3,
    sub: s('Another example', 'Un altro esempio'),
    cards: { tifa: 'Tifa Lockhart', forest: 'Forest', inside: 'Inside Out' },
    build: (b) => {
      const trig = s('Landfall — double the power of {tifa} until end of turn.', 'Terraferma — raddoppia la forza di {tifa} fino alla fine del turno.');
      b.perm('tifa', A).snap({
        log: s('Setup: {tifa} (1/2).', 'Situazione: {tifa} (1/2).'),
        text: s(
          'Landfall ability: whenever a land you control enters, double its power until end of turn. Doubling = it gets +X/+0, where X is its power when the ability resolves.',
          'Abilità di terraferma: ogni volta che entra una terra che controlli, raddoppia la sua forza fino alla fine del turno. Raddoppiare = prende +X/+0, dove X è la sua forza quando l’abilità si risolve.',
        ),
        badges: { tifa: '1/2' },
      });
      b.perm('forest1', A).trigger('t1', 'tifa', A, trig).snap({
        log: s('{forest1} enters: the landfall ability triggers.', 'Entra {forest1}: si innesca l’abilità di terraferma.'),
        text: s('The triggered ability is on the stack.', 'L’abilità innescata è in pila.'),
        badges: { tifa: '1/2' },
      });
      b.resolve('t1').snap({
        log: s('The landfall ability resolves: X = 1.', 'L’abilità di terraferma si risolve: X = 1.'),
        text: s('+1/+0 (L-7c): 2/2.', '+1/+0 (L-7c): 2/2.'),
        rows: [r('L-7c', '+1/+0', '+1/+0')],
        badges: { tifa: '2/2' },
      });
      b.perm('forest2', A).trigger('t2', 'tifa', A, trig).snap({
        log: s('{forest2} enters: the landfall ability triggers.', 'Entra {forest2}: si innesca l’abilità di terraferma.'),
        text: s('Its power is 2: X will be 2.', 'La sua forza è 2: X sarà 2.'),
        badges: { tifa: '2/2' },
      });
      b.resolve('t2').snap({
        log: s('The landfall ability resolves: X = 2.', 'L’abilità di terraferma si risolve: X = 2.'),
        text: s('+2/+0 more: 4/2.', 'Altri +2/+0: 4/2.'),
        rows: [r('L-7c', '+1/+0, +2/+0', '+1/+0, +2/+0')],
        badges: { tifa: '4/2' },
      });
      b.cast('inside', A, ['tifa']).snap({
        log: s('A casts {inside} targeting {tifa}.', 'A lancia {inside} su {tifa}.'),
        text: s('It will switch power and toughness until end of turn.', 'Scambierà forza e costituzione fino alla fine del turno.'),
        badges: { tifa: '4/2' },
      });
      b.resolve('inside').snap({
        log: s('{inside} resolves.', '{inside} si risolve.'),
        text: s('Switch (L-7d): 4/2 → 2/4.', 'Scambio (L-7d): 4/2 → 2/4.'),
        rows: [r('L-7c', '+1/+0, +2/+0 → 4/2', '+1/+0, +2/+0 → 4/2'), r('L-7d', 'Switch → 2/4', 'Scambio → 2/4')],
        badges: { tifa: '2/4' },
      });
      b.perm('forest3', A).trigger('t3', 'tifa', A, trig).snap({
        log: s('{forest3} enters: the landfall ability triggers.', 'Entra {forest3}: si innesca l’abilità di terraferma.'),
        text: s('When it resolves, its power is 2: X = 2.', 'Quando si risolve, la sua forza è 2: X = 2.'),
        badges: { tifa: '2/4' },
      });
      b.resolve('t3').snap({
        log: s('The landfall ability resolves: +2/+0.', 'L’abilità di terraferma si risolve: +2/+0.'),
        text: s(
          'The +2/+0 is added in L-7c, before the switch: 1/2 +1 +2 +2 = 6/2, switched = 2/6. Power does not grow: the bonus ends up in toughness.',
          'Il +2/+0 si somma nel L-7c, prima dello scambio: 1/2 +1 +2 +2 = 6/2, invertito = 2/6. La forza non cresce: il bonus finisce nella costituzione.',
        ),
        rows: [r('L-7c', '+1/+0, +2/+0, +2/+0 → 6/2', '+1/+0, +2/+0, +2/+0 → 6/2'), r('L-7d', 'Switch → 2/6', 'Scambio → 2/6')],
        badges: { tifa: '2/6' },
      });
    },
  },
  {
    id: 'clone',
    num: '4a',
    title: TITLE_4,
    sub: s('The basics', 'Le basi'),
    cards: { clone: 'Clone', bear: 'Grizzly Bears', growth: 'Giant Growth' },
    build: (b) => {
      b.perm('bear', B, { counters: { '+1/+1': 1 } }).cast('growth', B, ['bear']).resolve('growth').snap({
        log: s('Setup: {bear} of B with a counter and {growth}.', 'Situazione: {bear} di B con un segnalino e {growth}.'),
        text: s('2/2 +1/+1 +3/+3 = 6/6.', '2/2 +1/+1 +3/+3 = 6/6.'),
        rows: [r('L-7c', 'Counter +1/+1, {growth} +3/+3', 'Segnalino +1/+1, {growth} +3/+3')],
        badges: { bear: '6/6' },
      });
      b.cast('clone', A).snap({
        log: s('A casts {clone}.', 'A lancia {clone}.'),
        text: s('As it enters, it will copy {bear}.', 'Entrando, copierà {bear}.'),
        badges: { bear: '6/6' },
      });
      b.resolve('clone').snap({
        log: s('{clone} enters as a copy of {bear}.', '{clone} entra come copia di {bear}.'),
        text: s(
          'It copies only what is printed on the card (copiable values, 707.2): name, cost, types, text, 2/2. Not counters, not {growth}.',
          'Copia solo ciò che è stampato sulla carta (valori copiabili, 707.2): nome, costo, tipi, testo, 2/2. Non i segnalini, non {growth}.',
        ),
        rows: [r('L-1a', '{clone} becomes {bear} 2/2', '{clone} diventa {bear} 2/2')],
        badges: { bear: '6/6', clone: '2/2' },
        tags: { clone: '{bear}' },
      });
    },
  },
  {
    id: 'clone-face-down',
    num: '4b',
    title: TITLE_4,
    sub: s('Face-down cards', 'Carte a faccia in giù'),
    cards: { angel: 'Exalted Angel', clone: 'Clone' },
    build: (b) => {
      b.perm('angel', B, { flipped: true }).snap({
        log: s('Setup: {angel} of B, face down.', 'Situazione: {angel} di B, a faccia in giù.'),
        text: s(
          'Face down it is a 2/2 creature with no name, no text, no subtypes (708.2a, L-1b).',
          'A faccia in giù è una creatura 2/2 senza nome, testo né sottotipi (708.2a, L-1b).',
        ),
        rows: [r('L-1b', 'Face down: 2/2, no name, no abilities', 'A faccia in giù: 2/2, senza nome né abilità')],
        badges: { angel: '2/2' },
      });
      b.cast('clone', A).snap({
        log: s('A casts {clone}.', 'A lancia {clone}.'),
        text: s('As it enters, it will copy the face-down creature.', 'Entrando, copierà la creatura a faccia in giù.'),
        badges: { angel: '2/2' },
      });
      b.resolve('clone').snap({
        log: s('{clone} enters as a copy of the face-down creature.', '{clone} entra come copia della creatura a faccia in giù.'),
        text: s(
          'After L-1a and L-1b, the characteristics of an object are its copiable values (613.2c). The face-down status is part of them: {clone} becomes a 2/2 with no name and no abilities, but it is face up.',
          'Dopo il L-1a e il L-1b, le caratteristiche di un oggetto sono i suoi valori copiabili (613.2c). Lo stato a faccia in giù ne fa parte: {clone} diventa un 2/2 senza nome né abilità, ma è a faccia in su.',
        ),
        rows: [r('L-1a', '{clone}: copy of a face-down 2/2', '{clone}: copia di un 2/2 a faccia in giù')],
        badges: { angel: '2/2', clone: '2/2' },
        tags: { clone: s('Copy: face-down 2/2', 'Copia: 2/2 a faccia in giù') },
      });
      b.set('angel', { flipped: false }).snap({
        log: s('B turns {angel} face up.', 'B gira {angel} a faccia in su.'),
        text: s(
          'The copiable values of {angel} return to normal (708.8): 4/5 with flying and lifelink. {clone} does not change: its values were fixed when it entered.',
          'I valori copiabili di {angel} tornano normali (708.8): 4/5 con volare e legame vitale. {clone} non cambia: i suoi valori sono stati fissati quando è entrato.',
        ),
        rows: [r('L-1a', '{clone}: still a 2/2 with no name', '{clone}: resta un 2/2 senza nome')],
        badges: { angel: '4/5', clone: '2/2' },
        tags: { clone: s('Copy: face-down 2/2', 'Copia: 2/2 a faccia in giù') },
      });
    },
  },
  {
    id: 'clone-dfc',
    num: '4c',
    title: TITLE_4,
    sub: s('Transformed double-faced cards', 'Carte bifronte trasformate'),
    cards: { fable: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', clone: 'Clone' },
    build: (b) => {
      const lore = b.lang === 'it' ? 'Sapere' : 'Lore';
      b.perm('fable', A, { counters: { [lore]: 2 } }).snap({
        log: s('Setup: {fable.0} of A with two lore counters.', 'Situazione: {fable.0} di A con due segnalini sapere.'),
        text: s(
          'At the start of the precombat main phase A puts the third lore counter on it (703.4f).',
          'All’inizio della fase principale pre-combattimento A ci mette il terzo segnalino sapere (703.4f).',
        ),
      });
      b.set('fable', { counters: { [lore]: 3 } })
        .trigger('ch3', 'fable', A, s('III — Exile this Saga, then return it to the battlefield transformed under your control.', 'III — Esilia questa Saga, poi rimettila sul campo di battaglia trasformata sotto il tuo controllo.'))
        .snap({
          log: s('Third lore counter: chapter III triggers.', 'Terzo segnalino sapere: si innesca il capitolo III.'),
          text: s('The chapter ability is on the stack.', 'L’abilità del capitolo è in pila.'),
        });
      b.resolve('ch3').reenter('fable', { flipped: true }).snap({
        log: s('Chapter III resolves: {fable.0} returns transformed.', 'Il capitolo III si risolve: {fable.0} torna trasformata.'),
        text: s(
          'Exiled and returned: it is a new object (400.7), with summoning sickness. It enters with the back face up: {fable.1}, a 2/2 Goblin Shaman enchantment creature.',
          'Esiliata e tornata: è un nuovo oggetto (400.7), con debolezza da evocazione. Entra con il retro a faccia in su: {fable.1}, incantesimo creatura Goblin Sciamano 2/2.',
        ),
        badges: { fable: '2/2' },
      });
      b.cast('clone', A).snap({
        log: s('A casts {clone}.', 'A lancia {clone}.'),
        text: s('As it enters, it will copy {fable.1}.', 'Entrando, copierà {fable.1}.'),
        badges: { fable: '2/2' },
      });
      b.resolve('clone').snap({
        log: s('{clone} enters as a copy of {fable.1}.', '{clone} entra come copia di {fable.1}.'),
        text: s(
          'Copying a double-faced permanent uses only the face that is up (707.8): {clone} becomes {fable.1} 2/2 with its ability. But {clone} is not a double-faced card: it cannot transform, and if it leaves the battlefield it is {clone} again.',
          'Copiando un permanente bifronte si usa solo la faccia a faccia in su (707.8): {clone} diventa {fable.1} 2/2 con la sua abilità. Ma {clone} non è una carta bifronte: non può trasformarsi, e se lascia il campo di battaglia torna {clone}.',
        ),
        rows: [r('L-1a', '{clone}: copy of {fable.1} (face up only)', '{clone}: copia di {fable.1} (solo la faccia in su)')],
        badges: { fable: '2/2', clone: '2/2' },
        tags: { clone: '{fable.1}' },
      });
    },
  },
  {
    id: 'clone-mutate',
    num: '4d',
    title: TITLE_4,
    sub: s('Mutated cards', 'Carte mutate'),
    cards: { elves: 'Llanowar Elves', gem: 'Gemrazer', clone: 'Clone' },
    build: (b) => {
      b.perm('elves', A).snap({
        log: s('Setup: {elves} of A.', 'Situazione: {elves} di A.'),
        text: s('1/1 with "{T}: Add {G}".', '1/1 con "{T}: Aggiungi {G}".'),
        badges: { elves: '1/1' },
      });
      b.cast('gem', A, ['elves']).snap({
        log: s('A casts {gem} for its mutate cost, targeting {elves}.', 'A lancia {gem} con il costo di mutare, su {elves}.'),
        text: s('Mutate targets (115.1e): there is an arrow.', 'Mutare bersaglia (115.1e): c’è la freccia.'),
        badges: { elves: '1/1' },
      });
      b.resolve('gem');
      // fusione: lo stesso oggetto di prima, con Gemrazer sopra (731)
      const gemObj = b.g.objs.find((o) => o.uid === b.uid.gem)!;
      b.g = { ...b.g, objs: b.g.objs.filter((o) => o.uid !== b.uid.gem) };
      b.set('elves', { card: gemObj.card, under: [{ card: b.cards.elves, owner: A }] });
      b.uid.gem = b.uid.elves;
      b.snap({
        log: s('{gem} mutates on top of {elves}.', '{gem} muta sopra {elves}.'),
        text: s(
          'It is the same object as before (731): it has the characteristics of {gem} on top (4/4, reach, trample) plus the abilities of {elves} under it. This change is a copiable effect (L-1a).',
          'È lo stesso oggetto di prima (731): ha le caratteristiche di {gem} sopra (4/4, raggiungere, travolgere) più le abilità di {elves} sotto. Questa modifica è un effetto copiabile (L-1a).',
        ),
        rows: [r('L-1a', 'Merged: {gem} + abilities of {elves}', 'Fusione: {gem} + abilità di {elves}')],
        badges: { gem: '4/4' },
      });
      b.cast('clone', A).snap({
        log: s('A casts {clone}.', 'A lancia {clone}.'),
        text: s('As it enters, it will copy the mutated creature.', 'Entrando, copierà la creatura mutata.'),
        badges: { gem: '4/4' },
      });
      b.resolve('clone').snap({
        log: s('{clone} enters as a copy of the mutated creature.', '{clone} entra come copia della creatura mutata.'),
        text: s(
          'The characteristics of the merged creature are copiable: {clone} is a {gem} 4/4 with reach, trample and "{T}: Add {G}". It also has "whenever this creature mutates", but it does not trigger: {clone} has not mutated.',
          'Le caratteristiche della creatura mutata sono copiabili: {clone} è un {gem} 4/4 con raggiungere, travolgere e "{T}: Aggiungi {G}". Ha anche "ogniqualvolta questa creatura muta", ma non si innesca: {clone} non ha mutato.',
        ),
        rows: [r('L-1a', '{clone}: copy of {gem} + {elves}', '{clone}: copia di {gem} + {elves}')],
        badges: { gem: '4/4', clone: '4/4' },
        tags: { clone: '{gem} + {elves}' },
      });
    },
  },
  {
    id: 'face-down',
    num: '5',
    title: s('Face down, then turned face up (L-1b)', 'A faccia in giù, poi girata (L-1b)'),
    sub: s('It is always the same object', 'È sempre lo stesso oggetto'),
    cards: { angel: 'Exalted Angel', growth: 'Giant Growth' },
    build: (b) => {
      b.perm('angel', A, { flipped: true }).snap({
        log: s('Setup: {angel} face down.', 'Situazione: {angel} a faccia in giù.'),
        text: s('Face down it is a 2/2 creature with no name, no types, no abilities (708.2).', 'A faccia in giù è una creatura 2/2 senza nome, tipi o abilità (708.2).'),
        rows: [r('L-1b', 'Face down: 2/2, no name, no abilities', 'A faccia in giù: 2/2, senza nome né abilità')],
        badges: { angel: '2/2' },
      });
      b.cast('growth', A, ['angel']).snap({
        log: s('A casts {growth} targeting the face-down creature.', 'A lancia {growth} sulla creatura a faccia in giù.'),
        text: s('+3/+3 until end of turn, when it resolves.', '+3/+3 fino alla fine del turno, quando si risolve.'),
        badges: { angel: '2/2' },
      });
      b.resolve('growth').snap({
        log: s('{growth} resolves.', '{growth} si risolve.'),
        text: s('2/2 +3/+3 = 5/5.', '2/2 +3/+3 = 5/5.'),
        rows: [r('L-1b', 'Face down 2/2', 'A faccia in giù 2/2'), r('L-7c', '{growth} +3/+3', '{growth} +3/+3')],
        badges: { angel: '5/5' },
      });
      b.set('angel', { flipped: false }).snap({
        log: s('{angel} is turned face up.', '{angel} viene girata a faccia in su.'),
        text: s(
          'It is the same object (708.8): {growth} keeps applying. 4/5 +3/+3 = 7/8, with flying and lifelink.',
          'È lo stesso oggetto (708.8): {growth} continua ad applicarsi. 4/5 +3/+3 = 7/8, con volare e legame vitale.',
        ),
        rows: [r('L-6', 'Flying, lifelink', 'Volare, legame vitale'), r('L-7c', '{growth} +3/+3', '{growth} +3/+3')],
        badges: { angel: '7/8' },
      });
    },
  },
  {
    id: 'deadpool',
    num: '6',
    title: s('Deadpool, so many things in one card (L-3)', 'Deadpool, quante cose in una sola carta (L-3)'),
    sub: s('It does not target, it is not an ETB but it is an ETB', 'Non bersaglia, non è ETB ma è ETB'),
    cards: { dead: 'Deadpool, Trading Card', vis: 'Elvish Visionary', wall: 'Wall of Omens', shift: 'Cloudshift' },
    build: (b) => {
      const draw = s('When this creature enters, draw a card.', 'Quando questa creatura entra, pesca una carta.');
      b.perm('vis', B).perm('wall', B).snap({
        log: s('Setup: {vis} and {wall} of B.', 'Situazione: {vis} e {wall} di B.'),
        text: s(
          'Both have "When this creature enters, draw a card": an ETB (enters-the-battlefield) triggered ability.',
          'Entrambe hanno "Quando questa creatura entra, pesca una carta": un’abilità innescata ETB (quando entra nel campo di battaglia).',
        ),
        badges: { vis: '1/1', wall: '0/4' },
      });
      b.cast('dead', A).snap({
        log: s('A casts {dead}.', 'A lancia {dead}.'),
        text: s(
          '"As {dead} enters, you may exchange his text box and another creature\'s." It does not target: the creature is chosen as it enters, so there is no arrow and hexproof or shroud would not stop it (115.1).',
          '"Mentre {dead} entra, puoi scambiare il suo riquadro di testo con quello di un’altra creatura." Non bersaglia: la creatura si sceglie mentre entra, quindi non c’è nessuna freccia e anti-malocchio o velo non lo fermerebbero (115.1).',
        ),
        badges: { vis: '1/1', wall: '0/4' },
      });
      b.resolve('dead').trigger('t1', 'dead', A, draw).snap({
        log: s('{dead} enters: A chooses {vis}. The ETB triggers.', '{dead} entra: A sceglie {vis}. Si innesca l’ETB.'),
        text: s(
          'It is not an ETB but a replacement effect "as enters" (614.1c): {dead} enters already with the text box of {vis}. So the "When this creature enters" it now has triggers for {dead} (603.6a). Power and toughness are not in the text box: {dead} stays 5/3.',
          'Non è un ETB ma un effetto di sostituzione "entra come" (614.1c): {dead} entra già con il riquadro di testo di {vis}. Quindi il "Quando questa creatura entra" che ora ha si innesca per {dead} (603.6a). Forza e costituzione non sono nel riquadro di testo: {dead} resta 5/3.',
        ),
        rows: [r('L-3', '{dead} ↔ {vis}: text boxes exchanged', '{dead} ↔ {vis}: riquadri di testo scambiati')],
        badges: { dead: '5/3', vis: '1/1', wall: '0/4' },
        tags: { dead: s('Text: {vis}', 'Testo: {vis}'), vis: s('Text: {dead}', 'Testo: {dead}') },
      });
      b.resolve('t1').snap({
        log: s('The ability resolves: A draws a card.', 'L’abilità si risolve: A pesca una carta.'),
        text: s('{vis} entered earlier: its own ETB does not trigger again.', '{vis} era già entrata: il suo ETB non si innesca di nuovo.'),
        rows: [r('L-3', '{dead} ↔ {vis}: text boxes exchanged', '{dead} ↔ {vis}: riquadri di testo scambiati')],
        badges: { dead: '5/3', vis: '1/1', wall: '0/4' },
        tags: { dead: s('Text: {vis}', 'Testo: {vis}'), vis: s('Text: {dead}', 'Testo: {dead}') },
      });
      b.cast('shift', A, ['dead']).snap({
        log: s('A casts {shift} targeting {dead}.', 'A lancia {shift} su {dead}.'),
        text: s('{dead} will be exiled and return to the battlefield.', '{dead} verrà esiliato e tornerà sul campo di battaglia.'),
        badges: { dead: '5/3', vis: '1/1', wall: '0/4' },
        tags: { dead: s('Text: {vis}', 'Testo: {vis}'), vis: s('Text: {dead}', 'Testo: {dead}') },
      });
      b.resolve('shift').reenter('dead').trigger('t2', 'dead', A, draw).snap({
        log: s('{dead} returns: A chooses {wall}. The ETB triggers again.', '{dead} ritorna: A sceglie {wall}. Si innesca di nuovo l’ETB.'),
        text: s(
          '{dead} is a new object (400.7) with its own printed text, so "as enters" applies again: this time with {wall}, and its ETB triggers. {vis} keeps the text it received: that effect does not end when {dead} leaves.',
          '{dead} è un nuovo oggetto (400.7) con il suo testo stampato, quindi "entra come" si applica di nuovo: questa volta con {wall}, e il suo ETB si innesca. {vis} tiene il testo ricevuto: quell’effetto non finisce quando {dead} esce.',
        ),
        rows: [
          r('L-3', '{vis}: text of {dead} (first exchange)', '{vis}: testo di {dead} (primo scambio)'),
          r('L-3', '{dead} ↔ {wall}: text boxes exchanged', '{dead} ↔ {wall}: riquadri di testo scambiati'),
        ],
        badges: { dead: '5/3', vis: '1/1', wall: '0/4' },
        tags: { dead: s('Text: {wall}', 'Testo: {wall}'), vis: s('Text: {dead}', 'Testo: {dead}'), wall: s('Text: {dead}', 'Testo: {dead}') },
      });
      b.resolve('t2').snap({
        log: s('The ability resolves: A draws a card.', 'L’abilità si risolve: A pesca una carta.'),
        text: s(
          'With the text of {wall}, {dead} now also has defender.',
          'Con il testo di {wall}, ora {dead} ha anche difensore.',
        ),
        rows: [
          r('L-3', '{vis}: text of {dead}', '{vis}: testo di {dead}'),
          r('L-3', '{dead} ↔ {wall}', '{dead} ↔ {wall}'),
        ],
        badges: { dead: '5/3', vis: '1/1', wall: '0/4' },
        tags: { dead: s('Text: {wall}', 'Testo: {wall}'), vis: s('Text: {dead}', 'Testo: {dead}'), wall: s('Text: {dead}', 'Testo: {dead}') },
      });
    },
  },
  {
    id: 'dependency',
    num: '7a',
    title: s('Dependency: Blood Moon and Urborg (L-4, 613.8)', 'Dipendenza: Blood Moon e Urborg (L-4, 613.8)'),
    sub: s('Dependencies in short', 'Le dipendenze in breve'),
    cards: { moon: 'Blood Moon', urborg: 'Urborg, Tomb of Yawgmoth', island: 'Island' },
    build: (b) => {
      b.perm('urborg', A).perm('island', B).snap({
        log: s('Setup: {urborg} and {island}.', 'Situazione: {urborg} e {island}.'),
        text: s('{urborg}: every land is also a Swamp (L-4).', '{urborg}: ogni terra è anche una Palude (L-4).'),
        rows: [r('L-4', '{urborg}: all lands are Swamps too', '{urborg}: tutte le terre sono anche Paludi')],
        tags: { urborg: s('Swamp', 'Palude'), island: s('Swamp', 'Palude') },
      });
      b.cast('moon', B).snap({
        log: s('B casts {moon}.', 'B lancia {moon}.'),
        text: s('Nonbasic lands will be Mountains.', 'Le terre non base saranno Montagne.'),
        tags: { urborg: s('Swamp', 'Palude'), island: s('Swamp', 'Palude') },
      });
      b.resolve('moon').snap({
        log: s('{moon} resolves.', '{moon} si risolve.'),
        text: s(
          'Both effects are in L-4. {moon} turns {urborg} into a Mountain and removes its ability: the effect of {urborg} depends on {moon} (613.8), so {moon} goes first regardless of timestamps. {urborg} is a Mountain, no land is a Swamp.',
          'Entrambi gli effetti sono nel L-4. {moon} rende {urborg} una Montagna e gli toglie l’abilità: l’effetto di {urborg} dipende da {moon} (613.8), quindi {moon} si applica prima, a prescindere dal timestamp. {urborg} è una Montagna, nessuna terra è Palude.',
        ),
        rows: [
          r('L-4', '{moon}: nonbasic lands are Mountains (305.7)', '{moon}: le terre non base sono Montagne (305.7)'),
          r('L-4', '{urborg}: no longer has the ability', '{urborg}: non ha più l’abilità'),
        ],
        tags: { urborg: s('Mountain', 'Montagna') },
      });
    },
  },
  {
    id: 'dep-dryad',
    num: '7b',
    title: s('Dependency: Blood Moon, Urborg and Dryad (L-4, 613.8)', 'Dipendenza: Blood Moon, Urborg e la Driade (L-4, 613.8)'),
    sub: s('Dependency and timestamp together', 'Dipendenza e timestamp insieme'),
    cards: { urborg: 'Urborg, Tomb of Yawgmoth', dryad: 'Dryad of the Ilysian Grove', moon: 'Blood Moon', island: 'Island' },
    build: (b) => {
      const all = s('All basic types', 'Tutti i tipi base');
      b.perm('urborg', A).perm('dryad1', A).perm('island', B).snap({
        log: s('Setup: {urborg} and {dryad1} of A, {island} of B.', 'Situazione: {urborg} e {dryad1} di A, {island} di B.'),
        text: s(
          '{dryad1}: lands A controls are every basic land type. {urborg}: every land is also a Swamp. Both in L-4.',
          '{dryad1}: le terre di A sono di tutti i tipi base. {urborg}: ogni terra è anche una Palude. Entrambi nel L-4.',
        ),
        tags: { urborg: all, island: s('Swamp', 'Palude') },
      });
      b.cast('moon', B).snap({
        log: s('B casts {moon}.', 'B lancia {moon}.'),
        text: s('It will be the newest effect.', 'Sarà l’effetto più recente.'),
        tags: { urborg: all, island: s('Swamp', 'Palude') },
      });
      b.resolve('moon').snap({
        log: s('{moon} resolves.', '{moon} si risolve.'),
        text: s(
          '{urborg} depends on {moon} (613.8): {moon} applies before it, and {urborg} loses its ability. Between {dryad1} and {moon} there is no dependency: the timestamp decides. {dryad1} is older, so it applies first; then {moon} sets the subtype to Mountain and the other land types are lost (305.7). {urborg} is only a Mountain.',
          '{urborg} dipende da {moon} (613.8): {moon} si applica prima, e {urborg} perde l’abilità. Tra {dryad1} e {moon} non c’è dipendenza: decide il timestamp. {dryad1} è più vecchia, quindi si applica prima; poi {moon} imposta il sottotipo Montagna e gli altri tipi di terra si perdono (305.7). {urborg} è solo una Montagna.',
        ),
        rows: [
          r('L-4', '1. {dryad1}: all basic types (oldest)', '1. {dryad1}: tutti i tipi base (più vecchia)'),
          r('L-4', '2. {moon}: Mountain, no abilities', '2. {moon}: Montagna, senza abilità'),
          r('L-4', '3. {urborg}: no longer has the ability', '3. {urborg}: non ha più l’abilità'),
        ],
        tags: { urborg: s('Mountain', 'Montagna') },
      });
      b.cast('dryad2', A).snap({
        log: s('A casts a second {dryad2}.', 'A lancia una seconda {dryad2}.'),
        text: s('It will be newer than {moon}.', 'Sarà più recente di {moon}.'),
        tags: { urborg: s('Mountain', 'Montagna') },
      });
      b.resolve('dryad2').snap({
        log: s('The second {dryad2} resolves.', 'La seconda {dryad2} si risolve.'),
        text: s(
          'Now one {dryad2} is newer than {moon}: it applies after it. {urborg} is a Mountain and also every basic land type, so it is a Swamp too. But its own ability stays lost: {moon} removed it. {island} of B is not affected by {dryad2}.',
          'Ora una {dryad2} è più recente di {moon}: si applica dopo. {urborg} è una Montagna e anche di tutti i tipi base, quindi anche una Palude. Ma la sua abilità resta persa: l’ha tolta {moon}. {island} di B non è toccata da {dryad2}.',
        ),
        rows: [
          r('L-4', '1. first {dryad1}', '1. prima {dryad1}'),
          r('L-4', '2. {moon}: Mountain, no abilities', '2. {moon}: Montagna, senza abilità'),
          r('L-4', '3. second {dryad2}: all basic types', '3. seconda {dryad2}: tutti i tipi base'),
          r('L-4', '4. {urborg}: no ability', '4. {urborg}: nessuna abilità'),
        ],
        tags: { urborg: all },
      });
    },
  },
  {
    id: 'dep-lattice',
    num: '7c',
    title: s('Dependency: Mycosynth Lattice, March of the Machines and Humility (L-4, L-6, L-7b)', 'Dipendenza: Mycosynth Lattice, March of the Machines e Humility (L-4, L-6, L-7b)'),
    sub: s('When lands die', 'Quando le terre muoiono'),
    cards: { lattice: 'Mycosynth Lattice', march: 'March of the Machines', humility: 'Humility', forest: 'Forest' },
    build: (b) => {
      const art = s('Artifact', 'Artefatto');
      b.perm('lattice', A).perm('humility', A).perm('forest1', A).perm('forest2', B).snap({
        log: s('Setup: {lattice} and {humility} of A, a {forest1} each.', 'Situazione: {lattice} e {humility} di A, una {forest1} a testa.'),
        text: s(
          '{lattice}: all permanents are artifacts (L-4) and colorless (L-5). There are no creatures: {humility} does nothing yet.',
          '{lattice}: tutti i permanenti sono artefatti (L-4) e incolori (L-5). Non ci sono creature: {humility} per ora non fa niente.',
        ),
        tags: { lattice: art, humility: art, forest1: art, forest2: art },
      });
      b.cast('march', A).snap({
        log: s('A casts {march}.', 'A lancia {march}.'),
        text: s(
          'Each noncreature artifact will be an artifact creature with power and toughness equal to its mana value.',
          'Ogni artefatto non creatura sarà un artefatto creatura con forza e costituzione pari al suo valore di mana.',
        ),
        tags: { lattice: art, humility: art, forest1: art, forest2: art },
      });
      b.resolve('march').snap({
        log: s('{march} resolves (newest timestamp).', '{march} si risolve (timestamp più recente).'),
        text: s(
          'L-4: {march} depends on {lattice}, which changes what it applies to (613.8a): {lattice} first, then {march}. Everything is an artifact creature. L-6: {humility} removes the abilities of all of them, itself included, but the effects of {lattice} and {march} started in L-4 and continue (613.6). L-7b: no dependency, the timestamp decides: {humility} 1/1, then {march} sets the mana value.',
          'L-4: {march} dipende da {lattice}, che cambia a cosa si applica (613.8a): prima {lattice}, poi {march}. Tutto è un artefatto creatura. L-6: {humility} toglie le abilità a tutti, anche a sé stessa, ma gli effetti di {lattice} e {march} sono iniziati nel L-4 e continuano (613.6). L-7b: nessuna dipendenza, decide il timestamp: {humility} 1/1, poi {march} imposta il valore di mana.',
        ),
        rows: [
          r('L-4', '{lattice} → {march} (dependency)', '{lattice} → {march} (dipendenza)'),
          r('L-5', '{lattice}: colorless', '{lattice}: incolori'),
          r('L-6', '{humility}: no abilities', '{humility}: nessuna abilità'),
          r('L-7b', '{humility} 1/1 → {march} = mana value', '{humility} 1/1 → {march} = valore di mana'),
        ],
        badges: { lattice: '6/6', march: '4/4', humility: '4/4', forest1: '0/0', forest2: '0/0' },
      });
      b.bury('forest1').bury('forest2').snap({
        log: s('The two {forest1} are put into the graveyard.', 'Le due {forest1} vanno al cimitero.'),
        text: s(
          'Mana value 0: they are 0/0 creatures and die (704.5f). If {humility} had been the newest, everything would be 1/1 and the lands would survive.',
          'Valore di mana 0: sono creature 0/0 e muoiono (704.5f). Se {humility} fosse stata la più recente, tutto sarebbe 1/1 e le terre sopravviverebbero.',
        ),
        badges: { lattice: '6/6', march: '4/4', humility: '4/4' },
      });
    },
  },
  {
    id: 'bello-banner',
    num: '8',
    title: s('Bello: an artifact becomes a creature and boosts itself (L-4, L-6, L-7b, L-7c)', 'Bello: un artefatto diventa creatura e si potenzia da solo (L-4, L-6, L-7b, L-7c)'),
    sub: s('', ''),
    cards: { bello: 'Bello, Bard of the Brambles', banner: "Vanquisher's Banner" },
    build: (b) => {
      b.active(B).perm('bello', A).perm('banner', A).snap({
        log: s("B's turn: {bello} and {banner} (Elemental) of A.", 'Turno di B: {bello} e {banner} (Elementale) di A.'),
        text: s("It is not A's turn: {banner} is just an artifact.", 'Non è il turno di A: {banner} è solo un artefatto.'),
        tags: { banner: s('Elemental', 'Elementale') },
      });
      b.active(A).snap({
        log: s("A's turn.", 'Turno di A.'),
        text: s(
          '{banner} (artifact, mana value 5) is a 4/4 Elemental creature with indestructible and haste. Its own "creatures of the chosen type get +1/+1" now applies to itself: 5/5.',
          '{banner} (artefatto, valore di mana 5) è una creatura Elementale 4/4 con indistruttibile e rapidità. Il suo "le creature del tipo scelto prendono +1/+1" ora vale anche per sé: 5/5.',
        ),
        rows: [
          r('L-4', '{bello}: {banner} is an Elemental creature', '{bello}: {banner} è una creatura Elementale'),
          r('L-6', '{bello}: indestructible, haste, draw', '{bello}: indistruttibile, rapidità, pesca'),
          r('L-7b', '{bello}: 4/4', '{bello}: 4/4'),
          r('L-7c', '{banner}: +1/+1 (it is an Elemental creature)', '{banner}: +1/+1 (è una creatura Elementale)'),
        ],
        badges: { banner: '5/5' },
        tags: { banner: s('Elemental', 'Elementale') },
      });
    },
  },
  {
    id: 'opalescence',
    num: '9a',
    title: TITLE_9,
    sub: s('Opalescence and Humility', 'Opalescence e Humility'),
    cards: { opal: 'Opalescence', humility: 'Humility' },
    build: (b) => {
      b.perm('humility', A).snap({
        log: s('Setup: {humility} (first timestamp).', 'Situazione: {humility} (primo timestamp).'),
        text: s('All creatures lose all abilities and have base power and toughness 1/1.', 'Tutte le creature perdono le abilità e hanno forza e costituzione base 1/1.'),
      });
      b.cast('opal', A).snap({
        log: s('A casts {opal}.', 'A lancia {opal}.'),
        text: s('Each other non-Aura enchantment will be a creature with power and toughness equal to its mana value.', 'Ogni altro incantesimo non Aura sarà una creatura con forza e costituzione pari al suo valore di mana.'),
      });
      b.resolve('opal').snap({
        log: s('{opal} resolves (later timestamp).', '{opal} si risolve (timestamp più recente).'),
        text: s(
          '{humility} becomes a 4/4 creature (L-4) and loses its own ability (L-6), but its effect had already started and continues (613.6). In L-7b the most recent timestamp wins: {opal} sets 4/4 after {humility} sets 1/1. If {opal} had been there first, {humility} would be 1/1.',
          '{humility} diventa una creatura 4/4 (L-4) e perde la propria abilità (L-6), ma il suo effetto era già iniziato e continua (613.6). Nel L-7b vince il timestamp più recente: {opal} imposta 4/4 dopo che {humility} imposta 1/1. Se {opal} fosse arrivata prima, {humility} sarebbe 1/1.',
        ),
        rows: [
          r('L-4', '{opal}: {humility} is an Enchantment Creature', '{opal}: {humility} è un Incantesimo Creatura'),
          r('L-6', '{humility}: creatures lose abilities (itself too)', '{humility}: le creature perdono le abilità (anche lei)'),
          r('L-7b', '{humility} 1/1, then {opal} 4/4 (timestamp)', '{humility} 1/1, poi {opal} 4/4 (timestamp)'),
        ],
        badges: { humility: '4/4' },
      });
    },
  },
  {
    id: 'bello-humility',
    num: '9b',
    title: TITLE_9,
    sub: s('Bello, Bard of the Brambles: let’s understand it', 'Bello, Bard of the Brambles: capiamolo'),
    cards: { bello: 'Bello, Bard of the Brambles', banner: "Vanquisher's Banner", humility: 'Humility' },
    build: (b) => {
      b.active(B).perm('bello', A).perm('banner', A).snap({
        log: s("B's turn: {bello} and {banner} (Elemental) of A.", 'Turno di B: {bello} e {banner} (Elementale) di A.'),
        text: s("It is not A's turn: {banner} is just an artifact. {bello} is 3/3.", 'Non è il turno di A: {banner} è solo un artefatto. {bello} è 3/3.'),
        badges: { bello: '3/3' },
        tags: { banner: s('Elemental', 'Elementale') },
      });
      b.cast('humility', B).snap({
        log: s('B casts {humility}.', 'B lancia {humility}.'),
        text: s('It will have the most recent timestamp.', 'Avrà il timestamp più recente.'),
        badges: { bello: '3/3' },
        tags: { banner: s('Elemental', 'Elementale') },
      });
      b.resolve('humility').snap({
        log: s('{humility} resolves under the control of B.', '{humility} si risolve sotto il controllo di B.'),
        text: s(
          '{bello} loses its ability and is 1/1 (L-6, L-7b). {humility} is not affected by {bello}: B controls it, and {bello} only affects permanents A controls.',
          '{bello} perde la sua abilità ed è 1/1 (L-6, L-7b). {humility} non è toccata da {bello}: la controlla B, e {bello} riguarda solo i permanenti controllati da A.',
        ),
        rows: [r('L-6', '{humility}: {bello} loses all abilities', '{humility}: {bello} perde tutte le abilità'), r('L-7b', '{humility}: {bello} 1/1', '{humility}: {bello} 1/1')],
        badges: { bello: '1/1' },
        tags: { banner: s('Elemental', 'Elementale') },
      });
      b.active(A).snap({
        log: s("A's turn.", 'Turno di A.'),
        text: s(
          '{bello} has no abilities, yet {banner} becomes a creature: the effect of {bello} applies starting in L-4, where {bello} still has its ability, so it continues in the following layers (613.6). Then timestamps: {humility} is newer, so in L-6 it removes the abilities given by {bello} (and the +1/+1 of {banner}) and in L-7b its 1/1 overrides 4/4.',
          '{bello} non ha abilità, eppure {banner} diventa una creatura: l’effetto di {bello} inizia ad applicarsi nel L-4, dove {bello} ha ancora la sua abilità, quindi continua nei layer successivi (613.6). Poi il timestamp: {humility} è più recente, quindi nel L-6 toglie le abilità date da {bello} (e il +1/+1 di {banner}) e nel L-7b il suo 1/1 sovrascrive il 4/4.',
        ),
        rows: [
          r('L-4', '{bello}: {banner} is an Elemental creature (613.6)', '{bello}: {banner} è una creatura Elementale (613.6)'),
          r('L-6', '{bello} gives abilities, then {humility} removes them all', '{bello} dà le abilità, poi {humility} le toglie tutte'),
          r('L-7b', '{bello} 4/4, then {humility} 1/1', '{bello} 4/4, poi {humility} 1/1'),
        ],
        badges: { bello: '1/1', banner: '1/1' },
        tags: { banner: s('Elemental', 'Elementale') },
      });
    },
  },
];

/** Carica le carte di un esempio e ne costruisce i passi. */
export async function buildExample(
  def: ExampleDef,
  getCard: (name: string) => Promise<Card | null>,
  lang: Lang,
): Promise<{ steps: BuiltStep[]; cards: Record<string, Card> }> {
  const cards: Record<string, Card> = {};
  for (const [ref, name] of Object.entries(def.cards)) {
    const c = await getCard(name);
    if (!c) throw new Error(name);
    cards[ref] = c;
  }
  const b = new Builder(cards, lang);
  def.build(b);
  return { steps: b.steps, cards };
}
