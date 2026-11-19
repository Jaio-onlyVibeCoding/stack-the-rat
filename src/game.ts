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

/** Oggetto in pila (magia o abilità). targets = chiavi degli oggetti/giocatori bersagliati. */
export interface StackItem {
  uid: number;
  card: Card;
  controller: PlayerId;
  targets: string[];
}

/** Permanente sul campo di battaglia. */
export interface Permanent {
  uid: number;
  card: Card;
  controller: PlayerId;
}

/** Chiavi univoche per tutto ciò che può essere bersagliato (usate anche nel DOM: data-obj). */
export const objKey = {
  stack: (uid: number) => `stack:${uid}`,
  perm: (uid: number) => `perm:${uid}`,
  player: (id: PlayerId) => `player:${id}`,
};

let counter = 0;
export const newUid = () => ++counter;
