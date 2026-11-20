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
  notResolved: "{card} doesn't resolve: all its targets are illegal (CR 608.2b).",
  goesGraveyard: "{card} is put into its owner's graveyard.",
  choicesTitle: 'Choices for {card}',
  chooseFace: 'Which half or face is cast?',
  xValue: 'Value of X',
  modesTitle: 'Modes (up to {n})',
  mode: 'Mode',
  additionalCosts: 'Additional costs paid',
  alternativeCost: 'Alternative cost (only one, CR 118.9a)',
  otherChoices: 'Other choices',
  otherPlaceholder: 'e.g. chosen color, creature type, number…',
  noChoices: 'No modes, X or special costs found on this card. Write any other choice below.',
  save: 'Save',
  logChoices: '{card}: {choices}.',
  stackMenu: 'Choices',
  tap: 'Tap',
  untap: 'Untap',
  logTap: '{card} becomes tapped.',
  logUntap: '{card} becomes untapped.',
  prepare: 'Make it prepared',
  unprepare: 'Make it unprepared',
  prepared: 'Prepared',
  castPrepared: 'Cast the prepared spell',
  logPrepared: '{card} becomes prepared.',
  logUnprepared: '{card} is no longer prepared.',
  logCastPrepared: '{p} casts a copy of {spell} prepared by {card}, which is no longer prepared.',
  openScryfall: 'Open on Scryfall',
  copyTag: 'Copy',
  logCease: '{card} is a copy or an ability: it leaves the stack and ceases to exist (CR 704.5e).',
  logToHand: "{card} returns to its owner's hand (Buyback, CR 702.27a). The app does not track hands.",
  logAdventure: '{card} goes into exile on an adventure: its owner may later cast the creature from exile (CR 715.4).',
  logFlashbackExile: '{card} is exiled instead of going anywhere else (CR 702.34a).',
  help: 'Help',
  helpTitle: 'How to cast a spell or activate an ability',
  helpCast: 'Casting a spell (CR 601.2)',
  helpCastSteps:
    'Announce it: move the card from where it is (usually your hand) onto the stack. It is now a spell.|Make the choices: mode, alternative or additional costs (e.g. kicker), the value of X, which half of a split or adventure card.|Choose the targets.|Divide or distribute effects among targets (e.g. damage), if the spell says so.|The game checks the spell is legal (targets, restrictions). If not, everything is undone.|Determine the total cost: mana or alternative cost + additional costs + increases − reductions. From now on it is locked.|Activate mana abilities (e.g. tap lands for mana).|Pay the total cost, in any order.|The spell is cast: "when you cast" abilities trigger, then you receive priority (CR 117.3c).',
  helpAbility: 'Activating an ability (CR 602.2)',
  helpAbilitySteps:
    'Announce it: the ability goes on the stack, the source stays where it is.|Make the same choices and payments as a spell (601.2b–i): modes, X, targets, total cost, mana abilities, payment. {T} or sacrificing are part of the cost.|The ability is activated, then you receive priority.',
  helpTrigger:
    'Triggered abilities (CR 603.3) are put on the stack the next time a player would receive priority: first the active player\'s, then the others in turn order (APNAP). Targets and modes are chosen at that moment. Mana abilities never use the stack (CR 605).',
  helpPriority:
    'After that, the stack resolves only when all players pass priority in a row. Each new spell or ability resets the passes.',
  activated: 'Activated ability',
  triggered: 'Triggered ability',
  activate: 'Activate an ability',
  trigger: 'Triggered ability',
  activatedBy: 'Activated ability, controlled by',
  triggeredFor: 'Triggered ability, controlled by',
  chooseAbility: 'Which ability?',
  genericAbility: 'Ability without text',
  abilityHelp: 'Abilities exist on the stack independently of their source (CR 113.7a). Mana abilities do not use the stack (CR 605).',
  logActivate: '{p} activates an ability of {card}.',
  logTrigger: 'An ability of {card} triggers ({p}).',
  abilityResolved: 'The ability of {card} resolved and leaves the stack.',
  abilityFizzled: "The ability of {card} doesn't resolve: all its targets are illegal (CR 608.2b).",
  collapse: 'Collapse the battlefield of {p}',
  expand: 'Expand the battlefield of {p}',
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
  emptyPass: 'Tutti hanno passato con la pila vuota: la sottofase o la fase finisce.',
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
  notResolved: '{card} non si risolve: tutti i suoi bersagli sono illegali (CR 608.2b).',
  goesGraveyard: '{card} va nel cimitero del proprietario.',
  choicesTitle: 'Scelte per {card}',
  chooseFace: 'Quale metà o faccia lanci?',
  xValue: 'Valore di X',
  modesTitle: 'Modalità (fino a {n})',
  mode: 'Modo',
  additionalCosts: 'Costi aggiuntivi pagati',
  alternativeCost: 'Costo alternativo (uno solo, CR 118.9a)',
  otherChoices: 'Altre scelte',
  otherPlaceholder: 'es. colore scelto, tipo di creatura, numero…',
  noChoices: 'Nessuna modalità, X o costo speciale trovato su questa carta. Scrivi qui sotto eventuali altre scelte.',
  save: 'Salva',
  logChoices: '{card}: {choices}.',
  stackMenu: 'Scelte',
  tap: 'TAPpa',
  untap: 'STAPpa',
  logTap: '{card} viene TAPpata.',
  logUntap: '{card} viene STAPpata.',
  prepare: 'Rendi preparata',
  unprepare: 'Togli preparata',
  prepared: 'Preparata',
  castPrepared: 'Lancia la magia preparata',
  logPrepared: '{card} diventa preparata.',
  logUnprepared: '{card} non è più preparata.',
  logCastPrepared: '{p} lancia una copia di {spell} preparata da {card}, che non è più preparata.',
  openScryfall: 'Apri su Scryfall',
  copyTag: 'Copia',
  logCease: '{card} è una copia o un\'abilità: lascia la pila e cessa di esistere (CR 704.5e).',
  logToHand: '{card} torna in mano al proprietario (Buyback, CR 702.27a). L\'app non tiene traccia della mano.',
  logAdventure: "{card} va in esilio in avventura: il proprietario potrà lanciare la creatura dall'esilio (CR 715.4).",
  logFlashbackExile: '{card} viene esiliata invece di andare altrove (CR 702.34a).',
  help: 'Help',
  helpTitle: 'Come si lancia una magia o si attiva un\'abilità',
  helpCast: 'Lanciare una magia (CR 601.2)',
  helpCastSteps:
    'Annunciala: sposta la carta da dove si trova (di solito la mano) in pila. Ora è una magia.|Fai le scelte: modalità, costi alternativi o aggiuntivi (es. kicker), valore di X, quale metà di una carta divisa o avventura.|Scegli i bersagli.|Dividi o distribuisci gli effetti tra i bersagli (es. danni), se la magia lo chiede.|Il gioco controlla che la magia sia legale (bersagli, restrizioni). Se non lo è, si annulla tutto.|Calcola il costo totale: costo di mana o alternativo + costi aggiuntivi + aumenti − riduzioni. Da qui è bloccato.|Attiva le abilità di mana (es. TAPpa le terre per il mana).|Paga il costo totale, nell\'ordine che vuoi.|La magia è lanciata: si innescano le abilità "quando lanci", poi ricevi la priorità (CR 117.3c).',
  helpAbility: 'Attivare un\'abilità (CR 602.2)',
  helpAbilitySteps:
    'Annunciala: l\'abilità va in pila, la fonte resta dov\'è.|Fai le stesse scelte e gli stessi pagamenti di una magia (601.2b–i): modalità, X, bersagli, costo totale, abilità di mana, pagamento. {T} o sacrificare fanno parte del costo.|L\'abilità è attivata, poi ricevi la priorità.',
  helpTrigger:
    'Le abilità innescate (CR 603.3) vanno in pila la prossima volta che un giocatore riceverebbe la priorità: prima quelle del giocatore attivo, poi degli altri in ordine di turno (APNAP). Bersagli e modalità si scelgono in quel momento. Le abilità di mana non usano mai la pila (CR 605).',
  helpPriority:
    'Dopo, la pila si risolve solo quando tutti i giocatori passano la priorità di fila. Ogni nuova magia o abilità azzera i passaggi.',
  activated: 'Abilità attivata',
  triggered: 'Abilità innescata',
  activate: "Attiva un'abilità",
  trigger: 'Abilità innescata',
  activatedBy: 'Abilità attivata, controllata da',
  triggeredFor: 'Abilità innescata, controllata da',
  chooseAbility: 'Quale abilità?',
  genericAbility: 'Abilità senza testo',
  abilityHelp: 'Le abilità esistono in pila indipendentemente dalla loro fonte (CR 113.7a). Le abilità di mana non usano la pila (CR 605).',
  logActivate: "{p} attiva un'abilità di {card}.",
  logTrigger: "Si innesca un'abilità di {card} ({p}).",
  abilityResolved: "L'abilità di {card} si è risolta e lascia la pila.",
  abilityFizzled: "L'abilità di {card} non si risolve: tutti i suoi bersagli sono illegali (CR 608.2b).",
  collapse: 'Chiudi il campo di battaglia di {p}',
  expand: 'Apri il campo di battaglia di {p}',
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
