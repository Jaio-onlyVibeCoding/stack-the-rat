import type { Choices } from './choices';
import type { Card } from './scryfall';

export type PlayerId = 'A' | 'B' | 'C' | 'D';
export const ALL_PLAYERS: PlayerId[] = ['A', 'B', 'C', 'D'];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const PLAYER_COLOR: Record<PlayerId, string> = {
  A: '#e0a43a',
  B: '#4f9cf0',
  C: '#3cc39a',
  D: '#e26dae',
};

/** Zone in cui una carta può stare fuori dalla pila. */
export type Zone = 'battlefield' | 'graveyard' | 'exile' | 'library' | 'hand';
/** 'libraryBottom' = in fondo al grimorio; 'library' = in cima */
export type Destination = Zone | 'stack' | 'libraryBottom';

/** Carta (o token) sul campo di battaglia, nel cimitero o in esilio. */
/** Layer e sottolayer degli effetti continui (CR 613.1, 613.4) */
export type LayerId = '1a' | '1b' | '2' | '3' | '4' | '5' | '6' | '7a' | '7b' | '7c' | '7d';
export const LAYER_IDS: LayerId[] = ['1a', '1b', '2', '3', '4', '5', '6', '7a', '7b', '7c', '7d'];

/** Effetto continuo inserito a mano. Il timestamp è l'ordine nell'elenco (CR 613.7). */
export interface Effect {
  id: number;
  layer: LayerId;
  text: string;
  /** static = abilità statica (604); spell = effetto di una magia o abilità che si risolve (611.2) */
  source: 'static' | 'spell';
  /** fino alla fine del turno: finisce nella sottofase di cancellazione (514.2) */
  eot?: boolean;
  /** L-7a/7b: imposta; L-7c: modifica */
  p?: number;
  t?: number;
  /** impostata a mano dal menu "Imposta F/C" (una sola per oggetto) */
  manual?: boolean;
}

export interface CardObj {
  uid: number;
  card: Card;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  token?: boolean;
  /** TAPpato (girato di lato) */
  tapped?: boolean;
  /** Preparato: può lanciare una copia della sua magia di preparazione */
  prepared?: boolean;
  /** Girata: bifronte → retro (trasformata); flip → capovolta; altre → a faccia in giù */
  flipped?: boolean;
  /** Aura / Equipaggiamento / Fortificazione: uid del permanente a cui è attaccata */
  attachedTo?: number;
  /** Mutare: carte sotto la carta in cima (il permanente fuso è uno solo, CR 721) */
  under?: { card: Card; owner: PlayerId }[];
  /** Segnalini: nome → quantità (CR 122) */
  counters?: Record<string, number>;
  /** Carta esiliata collegata a un permanente (es. Anello dell'Oblio): uid di quel permanente */
  linkedTo?: number;
  /** Effetti continui inseriti con la spunta Layers */
  effects?: Effect[];
}

/** Tipo di oggetto in pila: magia, abilità attivata (CR 602) o innescata (CR 603). */
export type StackKind = 'spell' | 'activated' | 'triggered';

/** Oggetto in pila. Per le abilità, card è la fonte. targets = chiavi degli oggetti/giocatori bersagliati. */
export interface StackItem {
  uid: number;
  card: Card;
  owner: PlayerId;
  controller: PlayerId;
  targets: string[];
  kind: StackKind;
  /** testo dell'abilità (solo per le abilità) */
  text?: string;
  /** scelte fatte lanciando o attivando: modalità, X, faccia, costi… */
  choices?: Choices;
  /** copia di una magia (es. magia preparata): lasciando la pila cessa di esistere (CR 704.5e) */
  copy?: boolean;
  /** abilità "le carte esiliate collegate tornano sul campo": uid delle carte in esilio */
  returns?: number[];
}

/** Tutto lo stato di gioco: è ciò che si salva nella cronologia e che si condivide. */
export interface Game {
  players: PlayerId[];
  /** giocatore attivo (di chi è il turno) */
  active: PlayerId;
  /** chi ha la priorità; null = nessuno (durante la risoluzione) */
  priority: PlayerId | null;
  /** giocatori che hanno passato di fila (CR 117.4) */
  passed: PlayerId[];
  stack: StackItem[];
  objs: CardObj[];
  /** oggetti che hanno cambiato zona: chiave vecchia → dove sono finiti (per le frecce illegali) */
  gone: Record<string, string>;
  /** uid dell'oggetto in risoluzione */
  resolving: number | null;
  /** sottofase/fase attuale (indice in 0..11, vedi STEP_COUNT), usata se "Fasi e sottofasi" è attivo */
  step: number;
}

/** 12 momenti del turno (CR 500): STAP, mantenimento, acquisizione, principale 1, 5 di combattimento, principale 2, finale, cancellazione. */
export const STEP_COUNT = 12;
export const STEP = { untap: 0, upkeep: 1, main1: 3, damage: 7, main2: 9, cleanup: 11 };

export const initialGame = (): Game => ({
  players: ['A', 'B'],
  active: 'A',
  priority: 'A',
  passed: [],
  stack: [],
  objs: [],
  gone: {},
  resolving: null,
  step: STEP.main1,
});

/** Chiavi univoche per tutto ciò che può essere bersagliato (usate anche nel DOM: data-obj). */
export const objKey = {
  stack: (uid: number) => `stack:${uid}`,
  /** permanente sul campo di battaglia */
  perm: (uid: number) => `perm:${uid}`,
  /** carta nel cimitero o in esilio */
  card: (uid: number) => `card:${uid}`,
  player: (id: PlayerId) => `player:${id}`,
  of: (o: CardObj) => (o.zone === 'battlefield' ? `perm:${o.uid}` : `card:${o.uid}`),
};

let counter = 0;
export const newUid = () => ++counter;
/** Dopo aver caricato un setup condiviso: i nuovi uid partono oltre quelli esistenti. */
export const bumpUid = (n: number) => {
  counter = Math.max(counter, n);
};

/** Un bersaglio è legale se esiste ancora nella stessa zona (le altre condizioni le valuta il giocatore). */
export function isLegal(g: Game, key: string): boolean {
  const [kind, id] = key.split(':');
  const n = Number(id);
  if (kind === 'player') return g.players.includes(id as PlayerId);
  if (kind === 'perm') return g.objs.some((o) => o.uid === n && o.zone === 'battlefield');
  if (kind === 'card') return g.objs.some((o) => o.uid === n && o.zone !== 'battlefield');
  if (kind === 'stack') return g.stack.some((x) => x.uid === n);
  return false;
}

export type Source = { kind: 'obj'; obj: CardObj } | { kind: 'stack'; item: StackItem };

/**
 * Sposta una carta in un'altra zona. Cambiando zona diventa un nuovo oggetto (CR 400.7):
 * i bersagli che la puntavano diventano illegali, e le loro frecce puntano alla nuova posizione.
 * Un token che lascia il campo di battaglia cessa di esistere (CR 111.7, 704.5d).
 */
export function relocate(
  g: Game,
  src: Source,
  dest: Destination,
  controllerOverride?: PlayerId,
): { game: Game; tokenGone: boolean } {
  const card = src.kind === 'obj' ? src.obj.card : src.item.card;
  const owner = src.kind === 'obj' ? src.obj.owner : src.item.owner;
  // Chi controllerà la carta nella nuova zona: dalla pila o dal campo resta il controllore, altrimenti il proprietario
  const controller =
    controllerOverride ??
    (src.kind === 'stack' ? src.item.controller : src.obj.zone === 'battlefield' ? src.obj.controller : owner);
  const oldKey = src.kind === 'stack' ? objKey.stack(src.item.uid) : objKey.of(src.obj);
  const isToken = src.kind === 'obj' && !!src.obj.token;

  let next: Game =
    src.kind === 'stack'
      ? { ...g, stack: g.stack.filter((x) => x.uid !== src.item.uid) }
      : { ...g, objs: g.objs.filter((o) => o.uid !== src.obj.uid) };

  const where =
    dest === 'graveyard'
      ? `gy:${owner}`
      : dest === 'exile'
        ? 'exile'
        : dest === 'library' || dest === 'libraryBottom'
          ? `lib:${owner}`
          : dest === 'hand'
            ? `hand:${owner}`
            : null;

  if (isToken && dest !== 'battlefield') {
    return { game: { ...next, gone: { ...next.gone, [oldKey]: where ?? 'exile' } }, tokenGone: true };
  }

  const uid = newUid();
  if (dest === 'stack') {
    next = { ...next, stack: [...next.stack, { uid, card, owner, controller, targets: [], kind: 'spell' }] };
  } else if (dest === 'libraryBottom') {
    // fondo del grimorio = primo della lista (la cima è l'ultimo)
    next = { ...next, objs: [{ uid, card, owner, controller: owner, zone: 'library' }, ...next.objs] };
  } else {
    const ctrl = dest === 'battlefield' ? controller : owner;
    next = { ...next, objs: [...next.objs, { uid, card, owner, controller: ctrl, zone: dest }] };
  }
  const newKey = dest === 'stack' ? objKey.stack(uid) : dest === 'battlefield' ? objKey.perm(uid) : where!;
  return { game: { ...next, gone: { ...next.gone, [oldKey]: newKey } }, tokenGone: false };
}

/** Dove va una magia quando lascia la pila. */
export type LeaveTo = Zone | 'cease';

/**
 * Destinazione di una magia che lascia la pila.
 * resolved = true se si è risolta, false se non si è risolta (bersagli illegali) o è stata rimossa.
 */
export function leaveDestination(it: StackItem, resolved: boolean, permanent: boolean): LeaveTo {
  if (it.kind !== 'spell' || it.copy) return 'cease'; // abilità e copie cessano di esistere
  const extras = it.choices?.extras ?? [];
  // Flashback, Jump-start: esiliata ogni volta che lascerebbe la pila (CR 702.34a, 702.133a)
  if (extras.includes('Flashback') || extras.includes('Jump-start')) return 'exile';
  if (!resolved) return 'graveyard';
  // Avventura lanciata come avventura: in esilio, poi si può lanciare la creatura (CR 715.4)
  if (it.card.layout === 'adventure' && it.choices?.face === 1) return 'exile';
  if (permanent) return 'battlefield';
  // Buyback: torna in mano al proprietario (CR 702.27a)
  if (extras.includes('Buyback')) return 'hand';
  return 'graveyard';
}
