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
  /** etichette sulle carte: ref → testo (es. forza/costituzione) */
  badges?: Record<string, string | L>;
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
}

const A: PlayerId = 'A';
const B: PlayerId = 'B';

/** Costruisce gli stati di un esempio a partire da riferimenti simbolici alle carte. */
export class Builder {
  g: Game = { ...initialGame(), objs: [], stack: [], gone: {} };
  steps: BuiltStep[] = [];
  /** ref → uid attuale (cambia quando l'oggetto cambia zona) */
  uid: Record<string, number> = {};
  constructor(public cards: Record<string, Card>) {}

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
  trigger(ref: string, source: string, p: PlayerId, text: string) {
    this.push(ref, { card: this.card(source), owner: p, controller: p, targets: [], kind: 'triggered', text });
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
    const badges: Record<number, string | L> = {};
    for (const [ref, v] of Object.entries(info.badges ?? {})) if (this.uid[ref] !== undefined) badges[this.uid[ref]] = v;
    this.steps.push({ game: this.g, info, badges });
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
    sub: s('Glorious Anthem · Inspired Charge · Grizzly Bears (one before, one after)', 'Glorious Anthem · Inspired Charge · Grizzly Bears (uno prima, uno dopo)'),
    cards: { anthem: 'Glorious Anthem', charge: 'Inspired Charge', bear: 'Grizzly Bears' },
    build: (b) => {
      b.perm('anthem', A).perm('bear1', A).snap({
        log: s('Setup: {anthem} and {bear1}.', 'Situazione: {anthem} e {bear1}.'),
        text: s(
          '{anthem} has a static ability: your creatures get +1/+1 as long as it is on the battlefield (CR 604). The affected group is checked continuously (611.3a).',
          "{anthem} ha un'abilità statica: le tue creature prendono +1/+1 finché è sul campo (CR 604). Il gruppo colpito si controlla in ogni momento (611.3a).",
        ),
        rows: [r('7c', '{anthem}: +1/+1 (static ability)', '{anthem}: +1/+1 (abilità statica)')],
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
          r('7c', '{anthem}: +1/+1 (static, timestamp of the permanent, 613.7a)', '{anthem}: +1/+1 (statica, timestamp del permanente, 613.7a)'),
          r('7c', '{charge}: +2/+1 (resolved, timestamp of resolution, 613.7b)', '{charge}: +2/+1 (risolta, timestamp della risoluzione, 613.7b)'),
        ],
        badges: { bear1: '5/4' },
      });
      b.perm('bear2', A).snap({
        log: s('A second {bear2} enters.', 'Entra un secondo {bear2}.'),
        text: s(
          "The new {bear2} gets the {anthem} bonus (static ability), but not the {charge} bonus: it wasn't there when the spell resolved.",
          'Il nuovo {bear2} prende il bonus di {anthem} (abilità statica), ma non quello di {charge}: non c’era quando la magia si è risolta.',
        ),
        rows: [r('7c', 'Second {bear2}: only {anthem} +1/+1', 'Secondo {bear2}: solo {anthem} +1/+1')],
        badges: { bear1: '5/4', bear2: '3/3' },
      });
      b.bury('anthem').snap({
        log: s('{anthem} goes to the graveyard.', '{anthem} va al cimitero.'),
        text: s(
          'The static ability stops immediately. The effect of {charge} lasts until end of turn.',
          "L'abilità statica smette subito di funzionare. L'effetto di {charge} dura fino alla fine del turno.",
        ),
        rows: [r('7c', 'First {bear1}: {charge} +2/+1', 'Primo {bear1}: {charge} +2/+1')],
        badges: { bear1: '4/3', bear2: '2/2' },
      });
    },
  },
  {
    id: 'set-modify',
    title: s('Setting and modifying power (7b, 7c)', 'Impostare e modificare la forza (7b, 7c)'),
    sub: s('Turn to Frog · Grizzly Bears with two +1/+1 counters · Giant Growth', 'Turn to Frog · Grizzly Bears con due segnalini +1/+1 · Giant Growth'),
    cards: { frog: 'Turn to Frog', bear: 'Grizzly Bears', growth: 'Giant Growth' },
    build: (b) => {
      b.perm('bear', B, { counters: { '+1/+1': 2 } }).snap({
        log: s('Setup: {bear} of B with two +1/+1 counters.', 'Situazione: {bear} di B con due segnalini +1/+1.'),
        text: s('2/2 printed, counters +2/+2 (7c).', '2/2 stampato, segnalini +2/+2 (7c).'),
        rows: [r('7c', 'Counters +2/+2', 'Segnalini +2/+2')],
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
        text: s('+3/+3 until end of turn (7c).', '+3/+3 fino alla fine del turno (7c).'),
        rows: [r('7c', 'Counters +2/+2', 'Segnalini +2/+2'), r('7c', '{growth} +3/+3', '{growth} +3/+3')],
        badges: { bear: '7/7' },
      });
      b.resolve('frog').snap({
        log: s('{frog} resolves.', '{frog} si risolve.'),
        text: s(
          '{frog} resolved later, but "becomes 1/1" is applied in 7b, before all the modifications in 7c. {growth} is not cancelled: 1/1 +2/+2 +3/+3 = 6/6.',
          '{frog} si è risolta dopo, ma "diventa 1/1" si applica nel 7b, prima di tutte le modifiche del 7c. {growth} non viene cancellata: 1/1 +2/+2 +3/+3 = 6/6.',
        ),
        rows: [
          r('4', 'Frog (loses creature type Bear)', 'Rana (perde il tipo Orso)'),
          r('5', 'Blue', 'Blu'),
          r('6', 'Loses all abilities', 'Perde tutte le abilità'),
          r('7b', '{frog}: base 1/1', '{frog}: base 1/1'),
          r('7c', 'Counters +2/+2, {growth} +3/+3', 'Segnalini +2/+2, {growth} +3/+3'),
        ],
        badges: { bear: '6/6' },
      });
    },
  },
  {
    id: 'switch',
    title: s('Switching power and toughness is always last (7d)', 'Invertire forza e costituzione è sempre l’ultimo passo (7d)'),
    sub: s('Wall of Stone · Giant Growth ×2 · Inside Out', 'Wall of Stone · Giant Growth ×2 · Inside Out'),
    cards: { wall: 'Wall of Stone', growth: 'Giant Growth', inside: 'Inside Out' },
    build: (b) => {
      b.perm('wall', A).snap({
        log: s('Setup: {wall} (0/8).', 'Situazione: {wall} (0/8).'),
        text: s(
          'If {inside} resolved now, {wall} would be 8/0 and would die (704.5f). So {growth} first.',
          'Se {inside} si risolvesse adesso, {wall} sarebbe 8/0 e morirebbe (704.5f). Quindi prima {growth}.',
        ),
        badges: { wall: '0/8' },
      });
      b.cast('growth1', A, ['wall']).resolve('growth1').snap({
        log: s('{growth} resolves on {wall}.', '{growth} si risolve su {wall}.'),
        text: s('0/8 +3/+3 = 3/11 (7c).', '0/8 +3/+3 = 3/11 (7c).'),
        rows: [r('7c', '{growth} +3/+3', '{growth} +3/+3')],
        badges: { wall: '3/11' },
      });
      b.cast('inside', A, ['wall']).resolve('inside').snap({
        log: s('{inside} resolves on {wall}.', '{inside} si risolve su {wall}.'),
        text: s('The switch is applied after everything else (7d): 3/11 → 11/3.', 'Lo scambio si applica dopo tutto il resto (7d): 3/11 → 11/3.'),
        rows: [r('7c', '{growth} +3/+3 → 3/11', '{growth} +3/+3 → 3/11'), r('7d', '{inside}: switch → 11/3', '{inside}: scambio → 11/3')],
        badges: { wall: '11/3' },
      });
      b.cast('growth2', A, ['wall']).resolve('growth2').snap({
        log: s('A second {growth} resolves on {wall}.', 'Un secondo {growth} si risolve su {wall}.'),
        text: s(
          'It came after the switch, but 7c is still applied before 7d: 0/8 +6/+6 = 6/14, switched = 14/6. Not 14/6 + 3/3!',
          'È arrivata dopo lo scambio, ma il 7c si applica comunque prima del 7d: 0/8 +6/+6 = 6/14, invertito = 14/6. Non 14/6 + 3/3!',
        ),
        rows: [r('7c', '{growth} ×2: +6/+6 → 6/14', '{growth} ×2: +6/+6 → 6/14'), r('7d', '{inside}: switch → 14/6', '{inside}: scambio → 14/6')],
        badges: { wall: '14/6' },
      });
    },
  },
  {
    id: 'tifa',
    title: s('Doubling after a switch: the bonus goes to toughness (7c, 7d)', 'Raddoppiare dopo uno scambio: il bonus finisce nella costituzione (7c, 7d)'),
    sub: s('Tifa Lockhart · 3 Forest · Inside Out', 'Tifa Lockhart · 3 Forest · Inside Out'),
    cards: { tifa: 'Tifa Lockhart', forest: 'Forest', inside: 'Inside Out' },
    build: (b) => {
      const trig = 'Landfall — double power until end of turn';
      b.perm('tifa', A).snap({
        log: s('Setup: {tifa} (1/2).', 'Situazione: {tifa} (1/2).'),
        text: s(
          'Landfall: whenever a land you control enters, double its power until end of turn. Doubling = it gets +X/+0, where X is its power when the ability resolves.',
          'Approdo: ogni volta che entra una terra sotto il tuo controllo, raddoppia la sua forza fino alla fine del turno. Raddoppiare = prende +X/+0, dove X è la sua forza quando l’abilità si risolve.',
        ),
        badges: { tifa: '1/2' },
      });
      b.perm('forest1', A).trigger('t1', 'tifa', A, trig).snap({
        log: s('{forest1} enters: landfall triggers.', 'Entra {forest1}: si innesca l’approdo.'),
        text: s('The trigger is on the stack.', 'L’abilità innescata è in pila.'),
        badges: { tifa: '1/2' },
      });
      b.resolve('t1').snap({
        log: s('Landfall resolves: X = 1.', 'L’approdo si risolve: X = 1.'),
        text: s('+1/+0 (7c).', '+1/+0 (7c).'),
        rows: [r('7c', '+1/+0', '+1/+0')],
        badges: { tifa: '2/2' },
      });
      b.perm('forest2', A).trigger('t2', 'tifa', A, trig).resolve('t2').snap({
        log: s('{forest2} enters, landfall resolves: X = 2.', 'Entra {forest2}, l’approdo si risolve: X = 2.'),
        text: s('+2/+0 more: 4/2.', 'Altri +2/+0: 4/2.'),
        rows: [r('7c', '+1/+0, +2/+0', '+1/+0, +2/+0')],
        badges: { tifa: '4/2' },
      });
      b.cast('inside', A, ['tifa']).resolve('inside').snap({
        log: s('{inside} resolves on {tifa}.', '{inside} si risolve su {tifa}.'),
        text: s('Switch (7d): 4/2 → 2/4.', 'Scambio (7d): 4/2 → 2/4.'),
        rows: [r('7c', '+1/+0, +2/+0 → 4/2', '+1/+0, +2/+0 → 4/2'), r('7d', 'Switch → 2/4', 'Scambio → 2/4')],
        badges: { tifa: '2/4' },
      });
      b.perm('forest3', A).trigger('t3', 'tifa', A, trig).snap({
        log: s('{forest3} enters: landfall triggers.', 'Entra {forest3}: si innesca l’approdo.'),
        text: s('When it resolves, its power is 2: X = 2.', 'Quando si risolve, la sua forza è 2: X = 2.'),
        badges: { tifa: '2/4' },
      });
      b.resolve('t3').snap({
        log: s('Landfall resolves: +2/+0.', 'L’approdo si risolve: +2/+0.'),
        text: s(
          'The +2/+0 is added in 7c, before the switch: 1/2 +1 +2 +2 = 6/2, switched = 2/6. Power does not grow: the bonus ends up in toughness.',
          'Il +2/+0 si somma nel 7c, prima dello scambio: 1/2 +1 +2 +2 = 6/2, invertito = 2/6. La forza non cresce: il bonus finisce nella costituzione.',
        ),
        rows: [r('7c', '+1/+0, +2/+0, +2/+0 → 6/2', '+1/+0, +2/+0, +2/+0 → 6/2'), r('7d', 'Switch → 2/6', 'Scambio → 2/6')],
        badges: { tifa: '2/6' },
      });
    },
  },
  {
    id: 'clone',
    title: s('Copying: only copiable values (1a)', 'Copiare: solo i valori copiabili (1a)'),
    sub: s('Clone · Grizzly Bears with Giant Growth and a +1/+1 counter', 'Clone · Grizzly Bears con Giant Growth e un segnalino +1/+1'),
    cards: { clone: 'Clone', bear: 'Grizzly Bears', growth: 'Giant Growth' },
    build: (b) => {
      b.perm('bear', B, { counters: { '+1/+1': 1 } }).cast('growth', B, ['bear']).resolve('growth').snap({
        log: s('Setup: {bear} of B with a counter and {growth}.', 'Situazione: {bear} di B con un segnalino e {growth}.'),
        text: s('2/2 +1/+1 +3/+3 = 6/6.', '2/2 +1/+1 +3/+3 = 6/6.'),
        rows: [r('7c', 'Counter +1/+1, {growth} +3/+3', 'Segnalino +1/+1, {growth} +3/+3')],
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
        rows: [r('1a', '{clone} becomes {bear} 2/2', '{clone} diventa {bear} 2/2')],
        badges: { bear: '6/6', clone: '2/2' },
      });
    },
  },
  {
    id: 'face-down',
    title: s('Face down, then turned face up (1b)', 'A faccia in giù, poi girata (1b)'),
    sub: s('Exalted Angel (morph) · Giant Growth', 'Exalted Angel (metamorfosi) · Giant Growth'),
    cards: { angel: 'Exalted Angel', growth: 'Giant Growth' },
    build: (b) => {
      b.perm('angel', A, { flipped: true }).snap({
        log: s('Setup: {angel} face down.', 'Situazione: {angel} a faccia in giù.'),
        text: s('Face down it is a 2/2 creature with no name, no types, no abilities (708.2).', 'A faccia in giù è una creatura 2/2 senza nome, tipi o abilità (708.2).'),
        rows: [r('1b', 'Face down: 2/2, no name, no abilities', 'A faccia in giù: 2/2, senza nome né abilità')],
        badges: { angel: '2/2' },
      });
      b.cast('growth', A, ['angel']).resolve('growth').snap({
        log: s('{growth} resolves on the face-down creature.', '{growth} si risolve sulla creatura a faccia in giù.'),
        text: s('2/2 +3/+3 = 5/5.', '2/2 +3/+3 = 5/5.'),
        rows: [r('1b', 'Face down 2/2', 'A faccia in giù 2/2'), r('7c', '{growth} +3/+3', '{growth} +3/+3')],
        badges: { angel: '5/5' },
      });
      b.set('angel', { flipped: false }).snap({
        log: s('{angel} is turned face up.', '{angel} viene girata a faccia in su.'),
        text: s(
          'It is the same object (708.8): {growth} keeps applying. 4/5 +3/+3 = 7/8, with flying and lifelink.',
          'È lo stesso oggetto (708.8): {growth} continua ad applicarsi. 4/5 +3/+3 = 7/8, con volare e legame vitale.',
        ),
        rows: [r('6', 'Flying, lifelink', 'Volare, legame vitale'), r('7c', '{growth} +3/+3', '{growth} +3/+3')],
        badges: { angel: '7/8' },
      });
    },
  },
  {
    id: 'control',
    title: s('Changing control and boosts (2, 7c)', 'Cambio di controllo e potenziamenti (2, 7c)'),
    sub: s("Threaten · Glorious Anthem · opponent's Grizzly Bears", "Threaten · Glorious Anthem · Grizzly Bears dell'avversario"),
    cards: { threaten: 'Threaten', anthem: 'Glorious Anthem', bear: 'Grizzly Bears' },
    build: (b) => {
      b.perm('anthem', A).perm('bear', B).snap({
        log: s('Setup: {anthem} of A, {bear} of B.', 'Situazione: {anthem} di A, {bear} di B.'),
        text: s('{anthem} only boosts the creatures A controls.', '{anthem} potenzia solo le creature controllate da A.'),
        badges: { bear: '2/2' },
      });
      b.cast('threaten', A, ['bear']).resolve('threaten').set('bear', { controller: A }).snap({
        log: s('{threaten} resolves: A gains control of {bear}.', '{threaten} si risolve: A prende il controllo di {bear}.'),
        text: s(
          'Control changes in layer 2, before 7c: now {anthem} boosts it too. 3/3 with haste.',
          'Il controllo cambia nel layer 2, prima del 7c: ora anche {anthem} lo potenzia. 3/3 con rapidità.',
        ),
        rows: [r('2', 'Controller: A', 'Controllore: A'), r('6', 'Haste', 'Rapidità'), r('7c', '{anthem} +1/+1', '{anthem} +1/+1')],
        badges: { bear: '3/3' },
      });
    },
  },
  {
    id: 'text',
    title: s("Changing a card's text (3)", 'Cambiare il testo di una carta (3)'),
    sub: s('Artificial Evolution · Lord of Atlantis · Llanowar Elves', 'Artificial Evolution · Lord of Atlantis · Llanowar Elves'),
    cards: { evo: 'Artificial Evolution', lord: 'Lord of Atlantis', elves: 'Llanowar Elves' },
    build: (b) => {
      b.perm('lord', A).perm('elves', A).snap({
        log: s('Setup: {lord} and {elves}.', 'Situazione: {lord} e {elves}.'),
        text: s('{lord} boosts other Merfolk. {elves} is an Elf: no bonus.', '{lord} potenzia gli altri Tritoni. {elves} è un Elfo: nessun bonus.'),
        badges: { elves: '1/1' },
      });
      b.cast('evo', A, ['lord']).resolve('evo').snap({
        log: s('{evo} resolves on {lord}: Merfolk → Elf.', '{evo} si risolve su {lord}: Tritone → Elfo.'),
        text: s(
          'The text of {lord} now says "Elf" (layer 3). {elves} gets +1/+1 and islandwalk.',
          'Il testo di {lord} ora dice "Elfo" (layer 3). {elves} prende +1/+1 e passaterre-isola.',
        ),
        rows: [r('3', '{lord}: "Merfolk" → "Elf"', '{lord}: "Tritone" → "Elfo"'), r('6', '{elves}: islandwalk', '{elves}: passaterre-isola'), r('7c', '{elves}: +1/+1', '{elves}: +1/+1')],
        badges: { elves: '2/2' },
      });
    },
  },
  {
    id: 'dependency',
    title: s('Dependency: Blood Moon and Urborg (4, 613.8)', 'Dipendenza: Blood Moon e Urborg (4, 613.8)'),
    sub: s('Blood Moon · Urborg, Tomb of Yawgmoth · Island', 'Blood Moon · Urborg, Tomb of Yawgmoth · Island'),
    cards: { moon: 'Blood Moon', urborg: 'Urborg, Tomb of Yawgmoth', island: 'Island' },
    build: (b) => {
      b.perm('urborg', A).perm('island', B).snap({
        log: s('Setup: {urborg} and {island}.', 'Situazione: {urborg} e {island}.'),
        text: s('{urborg}: every land is also a Swamp (layer 4).', '{urborg}: ogni terra è anche una Palude (layer 4).'),
        rows: [r('4', '{urborg}: all lands are Swamps too', '{urborg}: tutte le terre sono anche Paludi')],
        badges: { urborg: s('+ Swamp', '+ Palude'), island: s('+ Swamp', '+ Palude') },
      });
      b.cast('moon', B).resolve('moon').snap({
        log: s('{moon} resolves.', '{moon} si risolve.'),
        text: s(
          'Both effects are in layer 4. {moon} turns {urborg} into a Mountain and removes its ability: the effect of {urborg} depends on {moon} (613.8), so {moon} goes first regardless of timestamps. {urborg} is a Mountain, no land is a Swamp.',
          'Entrambi gli effetti sono nel layer 4. {moon} rende {urborg} una Montagna e gli toglie l’abilità: l’effetto di {urborg} dipende da {moon} (613.8), quindi {moon} si applica prima, a prescindere dal timestamp. {urborg} è una Montagna, nessuna terra è Palude.',
        ),
        rows: [
          r('4', '{moon}: nonbasic lands are Mountains (305.7)', '{moon}: le terre non base sono Montagne (305.7)'),
          r('4', '{urborg}: no longer has the ability → nothing', '{urborg}: non ha più l’abilità → niente'),
        ],
        badges: { urborg: s('Mountain', 'Montagna'), island: s('Island', 'Isola') },
      });
    },
  },
  {
    id: 'opalescence',
    title: s('The classic: Opalescence and Humility (4, 6, 7b)', 'Il classico: Opalescence e Humility (4, 6, 7b)'),
    sub: s('Opalescence · Humility', 'Opalescence · Humility'),
    cards: { opal: 'Opalescence', humility: 'Humility' },
    build: (b) => {
      b.perm('humility', A).snap({
        log: s('Setup: {humility} (first timestamp).', 'Situazione: {humility} (primo timestamp).'),
        text: s('All creatures lose all abilities and are 1/1.', 'Tutte le creature perdono le abilità e sono 1/1.'),
      });
      b.cast('opal', A).resolve('opal').snap({
        log: s('{opal} resolves (later timestamp).', '{opal} si risolve (timestamp più recente).'),
        text: s(
          '{humility} becomes a 4/4 creature (layer 4) and loses its own ability (6), but its effect had already started and continues (613.6). In 7b the most recent timestamp wins: {opal} sets 4/4 after {humility} sets 1/1. If {opal} had been there first, {humility} would be 1/1.',
          '{humility} diventa una creatura 4/4 (layer 4) e perde la propria abilità (6), ma il suo effetto era già iniziato e continua (613.6). Nel 7b vince il timestamp più recente: {opal} imposta 4/4 dopo che {humility} imposta 1/1. Se {opal} fosse arrivata prima, {humility} sarebbe 1/1.',
        ),
        rows: [
          r('4', '{opal}: {humility} is an Enchantment Creature', '{opal}: {humility} è un Incantesimo Creatura'),
          r('6', '{humility}: creatures lose abilities (itself too)', '{humility}: le creature perdono le abilità (anche lei)'),
          r('7b', '{humility} 1/1, then {opal} 4/4 (timestamp)', '{humility} 1/1, poi {opal} 4/4 (timestamp)'),
        ],
        badges: { humility: '4/4' },
      });
    },
  },
  {
    id: 'bello-banner',
    title: s('Bello: an artifact becomes a creature and boosts itself (4, 6, 7b, 7c)', 'Bello: un artefatto diventa creatura e si potenzia da solo (4, 6, 7b, 7c)'),
    sub: s("Bello, Bard of the Brambles · Vanquisher's Banner (chosen type: Elemental)", "Bello, Bard of the Brambles · Vanquisher's Banner (tipo scelto: Elementale)"),
    cards: { bello: 'Bello, Bard of the Brambles', banner: "Vanquisher's Banner" },
    build: (b) => {
      b.active(B).perm('bello', A).perm('banner', A).snap({
        log: s("B's turn: {bello} and {banner} (Elemental) of A.", 'Turno di B: {bello} e {banner} (Elementale) di A.'),
        text: s("It is not A's turn: {banner} is just an artifact.", 'Non è il turno di A: {banner} è solo un artefatto.'),
        badges: { banner: s('Elemental', 'Elementale') },
      });
      b.active(A).snap({
        log: s("A's turn.", 'Turno di A.'),
        text: s(
          '{banner} (artifact, mana value 5) is a 4/4 Elemental creature with indestructible and haste. Its own "creatures of the chosen type get +1/+1" now applies to itself: 5/5.',
          '{banner} (artefatto, valore di mana 5) è una creatura Elementale 4/4 con indistruttibile e rapidità. Il suo "le creature del tipo scelto prendono +1/+1" ora vale anche per sé: 5/5.',
        ),
        rows: [
          r('4', '{bello}: {banner} is an Elemental creature', '{bello}: {banner} è una creatura Elementale'),
          r('6', '{bello}: indestructible, haste, draw', '{bello}: indistruttibile, rapidità, pesca'),
          r('7b', '{bello}: 4/4', '{bello}: 4/4'),
          r('7c', '{banner}: +1/+1 (it is an Elemental creature)', '{banner}: +1/+1 (è una creatura Elementale)'),
        ],
        badges: { banner: '5/5' },
      });
    },
  },
  {
    id: 'bello-humility',
    title: s('Bello and Humility: an effect that started does not stop (613.6)', 'Bello e Humility: un effetto già iniziato non si ferma (613.6)'),
    sub: s('Bello, Bard of the Brambles · Humility', 'Bello, Bard of the Brambles · Humility'),
    cards: { bello: 'Bello, Bard of the Brambles', humility: 'Humility' },
    build: (b) => {
      b.perm('bello', A).snap({
        log: s("A's turn: {bello} (first timestamp).", 'Turno di A: {bello} (primo timestamp).'),
        text: s('{bello} is 3/3.', '{bello} è 3/3.'),
        badges: { bello: '3/3' },
      });
      b.cast('humility', A).resolve('humility').snap({
        log: s('{humility} resolves (later timestamp).', '{humility} si risolve (timestamp più recente).'),
        text: s(
          '{humility} (mana value 4) is a 4/4 creature thanks to {bello} (layer 4). {humility} removes the abilities of {bello} too (6), but its effect had started in layer 4 and continues (613.6). Then timestamps: {humility} came later, so in 6 it removes the abilities {bello} gives, and in 7b its 1/1 overrides 4/4. If {humility} had been there first: 4/4 with indestructible and haste.',
          '{humility} (valore di mana 4) è una creatura 4/4 grazie a {bello} (layer 4). {humility} toglie le abilità anche a {bello} (6), ma il suo effetto era iniziato nel layer 4 e continua (613.6). Poi il timestamp: {humility} è arrivata dopo, quindi nel 6 toglie le abilità date da {bello} e nel 7b il suo 1/1 sovrascrive il 4/4. Se {humility} fosse stata in campo prima: 4/4 con indistruttibile e rapidità.',
        ),
        rows: [
          r('4', '{bello}: {humility} is an Elemental creature', '{bello}: {humility} è una creatura Elementale'),
          r('6', '{bello} gives abilities, then {humility} removes them all', '{bello} dà le abilità, poi {humility} le toglie tutte'),
          r('7b', '{bello} 4/4, then {humility} 1/1', '{bello} 4/4, poi {humility} 1/1'),
        ],
        badges: { bello: '1/1', humility: '1/1' },
      });
    },
  },
];

/** Carica le carte di un esempio e ne costruisce i passi. */
export async function buildExample(
  def: ExampleDef,
  getCard: (name: string) => Promise<Card | null>,
): Promise<{ steps: BuiltStep[]; cards: Record<string, Card> }> {
  const cards: Record<string, Card> = {};
  for (const [ref, name] of Object.entries(def.cards)) {
    const c = await getCard(name);
    if (!c) throw new Error(name);
    cards[ref] = c;
  }
  const b = new Builder(cards);
  def.build(b);
  return { steps: b.steps, cards };
}
