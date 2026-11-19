import { useEffect, useState } from 'preact/hooks';

// Lingue dell'interfaccia e delle carte: inglese (principale) e italiano.
// La ricerca invece accetta nomi di carte in qualsiasi lingua (vedi scryfall.ts).
export type Lang = 'en' | 'it';

export interface LangInfo {
  code: Lang;
  label: string;
  /** Codice lingua delle stampe su Scryfall */
  scryfall: string;
}

export const LANGS: LangInfo[] = [
  { code: 'en', label: 'English', scryfall: 'en' },
  { code: 'it', label: 'Italiano', scryfall: 'it' },
];

const en = {
  searchLabel: 'Card name',
  searchPlaceholder: 'Search a card, in any language…',
  loading: 'Loading…',
  error: 'Scryfall is not responding. Try again.',
  noResults: 'No cards found.',
  add: 'Add to stack',
  cancel: 'Cancel',
  stack: 'Stack',
  stackEmpty: 'The stack is empty.',
  top: 'Top',
  remove: 'Remove',
  language: 'Language',
  fallback: 'Not printed in Italian: showing English.',
  player: 'Player',
  players: 'Players',
  addPlayer: 'Add a player',
  removePlayer: 'Remove the last player',
  toStack: 'Cast / put on the stack for',
  toBattlefield: 'Put onto the battlefield of',
  battlefieldEmpty: 'No permanents.',
  target: 'Choose targets',
  clearTargets: 'Remove all arrows',
  turn: 'Turn',
  priority: 'Priority',
  pass: 'Pass',
  passHelp: 'When all players pass in a row, the top object resolves.',
  resolved: '{card} resolved and goes to the graveyard.',
  resolvedPermanent: '{card} resolved and enters the battlefield.',
  partial: '{card} resolved: illegal targets are not affected (CR 608.2b).',
  fizzled: "{card} doesn't resolve: all its targets are illegal (CR 608.2b). It goes to the graveyard.",
  emptyPass: 'Everyone passed with an empty stack: the step or phase ends.',
  graveyard: 'Graveyard',
  toGraveyard: 'Put into the graveyard',
  exile: 'Exile',
  exileEmpty: 'No exiled cards.',
  toExile: 'Exile',
  history: 'History',
  noHistory: 'No events yet.',
  back: 'Go back to the previous state',
  forward: 'Go forward to the next state',
  battlefieldOf: "{p}'s battlefield",
  graveyardOf: "{p}'s graveyard",
  exileZone: 'exile',
  stackZone: 'the stack',
  battlefield: 'Battlefield',
  moveTo: 'Move to',
  tokenCopy: 'Create a token copy',
  removeCard: 'Remove',
  menu: 'Card menu',
  close: 'Close',
  logMove: '{card} → {where}.',
  logToken: '{p} creates a token copy of {card}.',
  logTokenGone: '{card} is a token: it leaves the battlefield and ceases to exist (CR 704.5d).',
  logRemoveCard: '{card} removed from the game area.',
  logTarget: '{card} targets {target}.',
  logUntarget: '{card} no longer targets {target}.',
  logClearTargets: 'Arrows of {card} removed.',
  share: 'Share setup',
  shareTitle: 'Share this setup',
  shareHelp: 'Whoever opens this link sees the same table: players, cards, stack, arrows and priority.',
  copy: 'Copy',
  copied: 'Copied!',
  shareVia: 'Share…',
  shareFail: 'Could not create the link on this browser.',
  sharedLoading: 'Loading the shared setup…',
  sharedLoaded: 'Shared setup loaded.',
  sharedError: 'This shared link is not valid.',
  token: 'Token',
  hasPriority: 'Has priority',
  nobody: 'Nobody',
  resolvingStart: 'Everyone passed: {card} starts resolving. Nobody has priority.',
  resolvingBanner: 'Nobody has priority: {card} is resolving. Apply its effects, then confirm.',
  resolvingTag: 'Resolving',
  finish: 'Resolution done',
  logCast: '{p} casts {card}.',
  logBattlefield: '{card} enters the battlefield under {p}.',
  logPass: '{p} passes.',
  logGraveyard: "{card} is put into {p}'s graveyard.",
  logExile: '{card} ({p}) is exiled.',
  logAddPlayer: 'Player {p} joins.',
  logRemovePlayer: 'Player {p} leaves.',
  logTurn: "It's {p}'s turn.",
  logRemoved: '{card} removed from the stack.',
  targetingHint: 'Tap a target: a player, a permanent, a card in a graveyard or in exile, or an object lower in the stack. Tap an empty area to finish.',
  credits:
    'Card data and images from Scryfall. Magic: The Gathering © Wizards of the Coast. Unofficial fan content, not approved by Wizards.',
};

export type Key = keyof typeof en;
type Dict = Record<Key, string>;

const it: Dict = {
  searchLabel: 'Nome della carta',
  searchPlaceholder: 'Cerca una carta, in qualsiasi lingua…',
  loading: 'Caricamento…',
  error: 'Scryfall non risponde. Riprova.',
  noResults: 'Nessuna carta trovata.',
  add: 'Aggiungi alla pila',
  cancel: 'Annulla',
  stack: 'Pila',
  stackEmpty: 'La pila è vuota.',
  top: 'In cima',
  remove: 'Rimuovi',
  language: 'Lingua',
  fallback: 'Non stampata in italiano: mostro la versione inglese.',
  player: 'Giocatore',
  players: 'Giocatori',
  addPlayer: 'Aggiungi un giocatore',
  removePlayer: "Rimuovi l'ultimo giocatore",
  toStack: 'Lancia / metti in pila per',
  toBattlefield: 'Metti sul campo di battaglia di',
  battlefieldEmpty: 'Nessun permanente.',
  target: 'Scegli i bersagli',
  clearTargets: 'Cancella tutte le frecce',
  turn: 'Turno',
  priority: 'Priorità',
  pass: 'Passa',
  passHelp: "Quando tutti i giocatori passano di fila, l'oggetto in cima si risolve.",
  resolved: '{card} si è risolta e va al cimitero.',
  resolvedPermanent: '{card} si è risolta ed entra sul campo di battaglia.',
  partial: '{card} si è risolta: i bersagli illegali non vengono influenzati (CR 608.2b).',
  fizzled: '{card} non si risolve: tutti i suoi bersagli sono illegali (CR 608.2b). Va al cimitero.',
  emptyPass: 'Tutti hanno passato con la pila vuota: il passo o la fase finisce.',
  graveyard: 'Cimitero',
  toGraveyard: 'Metti nel cimitero',
  exile: 'Esilio',
  exileEmpty: 'Nessuna carta in esilio.',
  toExile: 'Esilia',
  history: 'Storico',
  noHistory: 'Ancora nessun evento.',
  back: 'Torna alla condizione precedente',
  forward: 'Vai alla condizione successiva',
  battlefieldOf: 'campo di battaglia di {p}',
  graveyardOf: 'cimitero di {p}',
  exileZone: 'esilio',
  stackZone: 'pila',
  battlefield: 'Campo di battaglia',
  moveTo: 'Sposta in',
  tokenCopy: 'Crea token copia',
  removeCard: 'Rimuovi',
  menu: 'Menu della carta',
  close: 'Chiudi',
  logMove: '{card} → {where}.',
  logToken: '{p} crea un token copia di {card}.',
  logTokenGone: '{card} è un token: lascia il campo di battaglia e cessa di esistere (CR 704.5d).',
  logRemoveCard: "{card} rimossa dall'area di gioco.",
  logTarget: '{card} bersaglia {target}.',
  logUntarget: '{card} non bersaglia più {target}.',
  logClearTargets: 'Frecce di {card} cancellate.',
  share: 'Condividi il setup',
  shareTitle: 'Condividi questo setup',
  shareHelp: 'Chi apre questo link vede lo stesso tavolo: giocatori, carte, pila, frecce e priorità.',
  copy: 'Copia',
  copied: 'Copiato!',
  shareVia: 'Condividi…',
  shareFail: 'Non riesco a creare il link su questo browser.',
  sharedLoading: 'Carico il setup condiviso…',
  sharedLoaded: 'Setup condiviso caricato.',
  sharedError: 'Questo link condiviso non è valido.',
  token: 'Token',
  hasPriority: 'Ha la priorità',
  nobody: 'Nessuno',
  resolvingStart: 'Tutti hanno passato: {card} inizia a risolversi. Nessuno ha priorità.',
  resolvingBanner: 'Nessuno ha priorità: {card} si sta risolvendo. Applica i suoi effetti, poi conferma.',
  resolvingTag: 'In risoluzione',
  finish: 'Risoluzione completata',
  logCast: '{p} lancia {card}.',
  logBattlefield: '{card} entra sul campo di battaglia di {p}.',
  logPass: '{p} passa.',
  logGraveyard: '{card} va nel cimitero di {p}.',
  logExile: '{card} ({p}) viene esiliata.',
  logAddPlayer: 'Entra il giocatore {p}.',
  logRemovePlayer: 'Esce il giocatore {p}.',
  logTurn: 'È il turno di {p}.',
  logRemoved: '{card} tolta dalla pila.',
  targetingHint: "Tocca un bersaglio: un giocatore, un permanente, una carta in un cimitero o in esilio, o un oggetto più in basso nella pila. Tocca uno spazio vuoto per finire.",
  credits:
    'Dati e immagini delle carte da Scryfall. Magic: The Gathering © Wizards of the Coast. Contenuto non ufficiale dei fan, non approvato da Wizards.',
};

const DICTS: Record<Lang, Dict> = { en, it };

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (isLang(saved)) return saved;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export const langInfo = (l: Lang): LangInfo => LANGS.find((x) => x.code === l)!;

document.documentElement.lang = current;

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem('lang', l);
  } catch {}
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Hook: restituisce la lingua attuale e la funzione di traduzione t(). */
export function useI18n() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return { lang: current, t: (k: Key) => DICTS[current][k] };
}
