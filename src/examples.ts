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
  return s.replace(/\{(\w+)\}/g, (m, ref: string) => {
    const c = cards[ref] ?? cards[ref.replace(/\d+$/, '')];
    return c ? c.printedName : m;
  });
}
export const pick = (x: L | string, lang: Lang) => (typeof x === 'string' ? x : x[lang] ?? x.en);

const r = (l: string, en: string, it: string): LayerRow => ({ l, t: { en, it } });
const s = (en: string, it: string): L => ({ en, it });

export const EXAMPLES: ExampleDef[] = [
  {
    id: 'static-vs-spell',
    title: s('Static ability or spell effect?', 'Abilità statica o effetto di una magia?'),
    sub: s('Glorious Anthem · Inspired Charge · Grizzly Bears (one before, one after) · Disenchant', 'Glorious Anthem · Inspired Charge · Grizzly Bears (uno prima, uno dopo) · Disenchant'),
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
    id: 'set-modify',
    title: s('Setting and modifying power (L-7b, L-7c)', 'Impostare e modificare la forza (L-7b, L-7c)'),
    sub: s('Turn to Frog · Grizzly Bears with two +1/+1 counters · Giant Growth', 'Turn to Frog · Grizzly Bears con due segnalini +1/+1 · Giant Growth'),
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
    title: s('Switching power and toughness is always last (L-7d)', 'Invertire forza e costituzione è sempre l’ultimo passo (L-7d)'),
    sub: s('Wall of Stone · Giant Growth · Inside Out · Brute Strength', 'Wall of Stone · Giant Growth · Inside Out · Brute Strength'),
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
    title: s('Doubling after a switch: the bonus goes to toughness (L-7c, L-7d)', 'Raddoppiare dopo uno scambio: il bonus finisce nella costituzione (L-7c, L-7d)'),
    sub: s('Tifa Lockhart · 3 Forest · Inside Out', 'Tifa Lockhart · 3 Forest · Inside Out'),
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
    title: s('Copying: only copiable values (L-1a)', 'Copiare: solo i valori copiabili (L-1a)'),
    sub: s('Clone · Grizzly Bears with Giant Growth and a +1/+1 counter', 'Clone · Grizzly Bears con Giant Growth e un segnalino +1/+1'),
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
    id: 'face-down',
    title: s('Face down, then turned face up (L-1b)', 'A faccia in giù, poi girata (L-1b)'),
    sub: s('Exalted Angel (morph) · Giant Growth', 'Exalted Angel (metamorfosi) · Giant Growth'),
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
    id: 'control',
    title: s('Changing control and boosts (L-2, L-7c)', 'Cambio di controllo e potenziamenti (L-2, L-7c)'),
    sub: s("Threaten · Glorious Anthem · opponent's Grizzly Bears", "Threaten · Glorious Anthem · Grizzly Bears dell'avversario"),
    cards: { threaten: 'Threaten', anthem: 'Glorious Anthem', bear: 'Grizzly Bears' },
    build: (b) => {
      b.perm('anthem', A).perm('bear', B, { tapped: true }).snap({
        log: s('Setup: {anthem} of A, {bear} of B (tapped).', 'Situazione: {anthem} di A, {bear} di B (TAPpato).'),
        text: s('{anthem} only boosts the creatures A controls.', '{anthem} potenzia solo le creature controllate da A.'),
        badges: { bear: '2/2' },
      });
      b.cast('threaten', A, ['bear']).snap({
        log: s('A casts {threaten} targeting {bear}.', 'A lancia {threaten} su {bear}.'),
        text: s('Untap it, gain control of it and give it haste until end of turn.', 'La STAPpa, ne prende il controllo e le dà rapidità fino alla fine del turno.'),
        badges: { bear: '2/2' },
      });
      b.resolve('threaten').set('bear', { controller: A, tapped: false }).snap({
        log: s('{threaten} resolves: A gains control of {bear}.', '{threaten} si risolve: A prende il controllo di {bear}.'),
        text: s(
          'Control changes in L-2, before L-7c: now {anthem} boosts it too, 3/3. It has summoning sickness, because A has not controlled it continuously since the start of the turn (302.6), but haste lets it attack anyway (702.10).',
          'Il controllo cambia nel L-2, prima del L-7c: ora anche {anthem} lo potenzia, 3/3. Ha debolezza da evocazione, perché A non lo controlla ininterrottamente dall’inizio del turno (302.6), ma la rapidità gli permette di attaccare lo stesso (702.10).',
        ),
        rows: [r('L-2', 'Controller: A', 'Controllore: A'), r('L-6', 'Haste', 'Rapidità'), r('L-7c', '{anthem} +1/+1', '{anthem} +1/+1')],
        badges: { bear: '3/3' },
      });
    },
  },
  {
    id: 'deadpool',
    title: s('Exchanging text boxes: "as enters" is not an ETB (L-3)', 'Scambiare i riquadri di testo: "entra come" non è un ETB (L-3)'),
    sub: s('Deadpool, Trading Card · Elvish Visionary · Wall of Omens · Cloudshift', 'Deadpool, Trading Card · Elvish Visionary · Wall of Omens · Cloudshift'),
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
    title: s('Dependency: Blood Moon and Urborg (L-4, 613.8)', 'Dipendenza: Blood Moon e Urborg (L-4, 613.8)'),
    sub: s('Blood Moon · Urborg, Tomb of Yawgmoth · Island', 'Blood Moon · Urborg, Tomb of Yawgmoth · Island'),
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
    id: 'opalescence',
    title: s('Opalescence and Humility (L-4, L-6, L-7b)', 'Opalescence e Humility (L-4, L-6, L-7b)'),
    sub: s('Opalescence · Humility', 'Opalescence · Humility'),
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
    id: 'bello-banner',
    title: s('Bello: an artifact becomes a creature and boosts itself (L-4, L-6, L-7b, L-7c)', 'Bello: un artefatto diventa creatura e si potenzia da solo (L-4, L-6, L-7b, L-7c)'),
    sub: s("Bello, Bard of the Brambles · Vanquisher's Banner (chosen type: Elemental)", "Bello, Bard of the Brambles · Vanquisher's Banner (tipo scelto: Elementale)"),
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
    id: 'bello-humility',
    title: s('Bello and Humility: an effect that started does not stop (613.6)', 'Bello e Humility: un effetto già iniziato non si ferma (613.6)'),
    sub: s("Bello, Bard of the Brambles · Vanquisher's Banner · Humility of the opponent", "Bello, Bard of the Brambles · Vanquisher's Banner · Humility dell'avversario"),
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
