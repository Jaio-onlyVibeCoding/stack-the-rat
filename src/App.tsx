import { useEffect, useRef, useState } from 'preact/hooks';
import { Arrows, type Link } from './Arrows';
import { CardSearch } from './CardSearch';
import {
  ALL_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOR,
  initialGame,
  isLegal,
  newUid,
  objKey,
  leaveDestination,
  relocate,
  STEP,
  STEP_COUNT,
  type CardObj,
  type Destination,
  type Game,
  type PlayerId,
  type StackItem,
  type StackKind,
} from './game';
import { LANGS, detect, langInfo, setLang, useI18n, type Key, type Lang } from './i18n';
import { getCard, type Card } from './scryfall';
import { decodeGame, encodeGame, sharedCodeFromUrl, shareUrl } from './share';
import { ChoicesSheet } from './ChoicesSheet';
import { canChooseFace, chosenFace, costKeywords, hasX, parseModes, summarize, type Choices } from './choices';
import { Help } from './Help';
import { StepPicker } from './StepPicker';
import { CardViewer } from './CardViewer';
import { useDrag, type DragItem } from './dnd';

// ---------- Icone ----------
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" class="icon">
    <path d={d} />
  </svg>
);
const Crosshair = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" class="icon">
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
  </svg>
);
const Portal = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" class="icon">
    <ellipse cx="12" cy="12" rx="5" ry="9" />
    <path d="M3 12h9M9 9l3 3-3 3" />
  </svg>
);
const CROSS = 'M5 5l14 14M19 5L5 19';
const BACK = 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3';
const FORWARD = 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3';
const SHARE = 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6';
const chevron = (up: boolean) => (up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6');
/** Icone delle abilità: fulmine = innescata, freccia di attivazione = attivata */
const TRIGGER = 'M13 2L4 14h7l-1 8 9-12h-7z';
const ACTIVATE = 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4';
const TAP = 'M7 4h7a2 2 0 0 1 2 2v3M17 20H10a2 2 0 0 1-2-2v-3M13 9l3 3 3-3M11 15l-3-3-3 3';
const MOVE = 'M5 12h14M13 6l6 6-6 6';
const SPARK = 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6';
const EXTERNAL = 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5';
const DOTS = 'M5 12h.01M12 12h.01M19 12h.01';
const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const WARN = 'M12 3l10 18H2zM12 10v5M12 18h.01';
const FULL = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
const EXIT_FULL = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';
const WIDEN = 'M8 7l-5 5 5 5M16 7l5 5-5 5';
const NARROW = 'M4 7l5 5-5 5M20 7l-5 5 5 5';
const SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4';
const KEBAB = 'M12 5h.01M12 12h.01M12 19h.01';
const GEAR = 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4';
const LIBRARY = 'M8 3h10a1 1 0 0 1 1 1v13M6 6h10a1 1 0 0 1 1 1v13H5V7a1 1 0 0 1 1-1z';
const HAND =
  'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12M14 12V5.5a1.5 1.5 0 0 1 3 0V13M17 13V9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a6 6 0 0 1-5.2-3L4.2 15a1.5 1.5 0 0 1 2.6-1.5L8 15.5';
const TOMBSTONE = 'M6 21V10a6 6 0 0 1 12 0v11zM4 21h16M12 9v6M9.5 11.5h5';
const RESET = 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5';
const CONTROL = 'M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12';

/** Una "condizione" della partita: lo stato e i messaggi che l'hanno prodotta. */
interface Snapshot {
  game: Game;
  messages: string[];
  time: string;
}

const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

/** Raggruppamento delle 12 sottofasi nelle 5 fasi del turno (CR 500.1). */
const STEP_GROUPS = [[0, 1, 2], [3], [4, 5, 6, 7, 8], [9], [10, 11]];
const DESTINATIONS: Destination[] = ['battlefield', 'hand', 'library', 'libraryBottom', 'graveyard', 'exile', 'stack'];
const HISTORY_LIMIT = 200;

export function App() {
  const { t, lang } = useI18n();
  const now = () => new Date().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const tr = (k: Key, vars: Record<string, string> = {}) => fill(t(k), vars);

  // Cronologia delle condizioni: ci si muove avanti e indietro con pos
  const [timeline, setTimeline] = useState<Snapshot[]>(() => [{ game: initialGame(), messages: [], time: now() }]);
  const [pos, setPos] = useState(0);
  const g = timeline[pos].game;

  // Stato dell'interfaccia (non fa parte della cronologia)
  const [preview, setPreview] = useState<Card | null>(null);
  const [targeting, setTargeting] = useState<number | null>(null);
  const [panels, setPanels] = useState<string[]>([]); // 'exile' | 'gy:A' ... nell'ordine di apertura
  const [menu, setMenu] = useState<{ uid: number; x: number; y: number; top: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [share, setShare] = useState<{ url: string; copied: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  /** campi di battaglia chiusi */
  const [collapsed, setCollapsed] = useState<PlayerId[]>([]);
  /** scelta del testo di un'abilità prima di metterla in pila */
  const [abilityPick, setAbilityPick] = useState<{ card: Card; kind: StackKind; controller: PlayerId } | null>(null);
  /** oggetto in pila di cui si stanno modificando le scelte */
  const [choicesFor, setChoicesFor] = useState<number | null>(null);
  /** sottomenu "Sposta in" aperto */
  const [moveOpen, setMoveOpen] = useState(false);
  const [help, setHelp] = useState(() => {
    try {
      return localStorage.getItem('help') === '1';
    } catch {
      return false;
    }
  });
  function toggleHelp(on: boolean) {
    setHelp(on);
    try {
      localStorage.setItem('help', on ? '1' : '0');
    } catch {}
  }
  const stackCol = useRef<HTMLElement>(null);
  /** carta aperta in grande con i chiarimenti */
  const [viewer, setViewer] = useState<Card | null>(null);
  /** telefono: schermo stretto (verticale) o basso (orizzontale) → interfaccia compatta */
  const NARROW_QUERY = '(max-width: 699px), (max-height: 500px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW_QUERY);
    const f = () => setNarrow(m.matches);
    m.addEventListener('change', f);
    window.addEventListener('resize', f); // alcuni browser non segnalano il cambio della media query
    return () => {
      m.removeEventListener('change', f);
      window.removeEventListener('resize', f);
    };
  }, []);
  /** telefono: ricerca aperta, menu ⋮ aperto, opzioni del pannello priorità aperte */
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [prioOpts, setPrioOpts] = useState(false);
  /** zoom del campo di battaglia di ogni giocatore (pizzico con due dita / pulsanti −+) */
  const [zoom, setZoom] = useState<Partial<Record<PlayerId, number>>>({});
  const zoomOf = (p: PlayerId) => zoom[p] ?? 1;
  const setZoomOf = (p: PlayerId, z: number) =>
    setZoom((all) => ({ ...all, [p]: Math.round(Math.min(2.5, Math.max(0.5, z)) * 100) / 100 }));
  const pinch = useRef<{ id: PlayerId; d0: number; z0: number } | null>(null);
  const touchDist = (e: TouchEvent) =>
    Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  // Pizzico con due dita sul campo di battaglia (ascoltatori nativi: funzionano su ogni browser)
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const start = (e: TouchEvent) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-zoom]');
      if (el && e.touches.length === 2) {
        const id = el.dataset.zoom as PlayerId;
        pinch.current = { id, d0: touchDist(e), z0: zoomRef.current[id] ?? 1 };
      }
    };
    const move = (e: TouchEvent) => {
      const p = pinch.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      setZoomOf(p.id, (p.z0 * touchDist(e)) / p.d0);
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, []);
  /** colonna della pila larga il doppio */
  const [wideStack, setWideStack] = useState(false);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const f = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {}
  }
  /** solo chi ha la priorità può lanciare, attivare, mettere in pila */
  /** carte di esempio (placeholder) mostrate finché non si aggiunge una carta; tornano solo con il reset */
  const [showExamples, setShowExamples] = useState(true);
  const [examples, setExamples] = useState<{ perms: Card[]; spell?: Card }>({ perms: [] });
  useEffect(() => {
    const l = langInfo(lang).scryfall;
    Promise.all([getCard('Thrumming Stone', l), getCard("Vanquisher's Banner", l), getCard('Rat Colony', l)])
      .then(([stone, banner, spell]) =>
        setExamples({ perms: [stone, banner].filter((c): c is Card => !!c), spell: spell ?? undefined }),
      )
      .catch(() => {});
  }, [lang]);
  /** oggetto in pila da copiare: si chiede se tenere gli stessi bersagli */
  const [copyAsk, setCopyAsk] = useState<StackItem | null>(null);
  /** gestione di fasi e sottofasi nel passaggio di priorità */
  const [phases, setPhases] = useState(() => {
    try {
      return localStorage.getItem('phases') === '1';
    } catch {
      return false;
    }
  });
  function togglePhases(on: boolean) {
    setPhases(on);
    try {
      localStorage.setItem('phases', on ? '1' : '0');
    } catch {}
  }
  /** con "Fasi, priorità e velocità" attivo, solo chi ha la priorità può lanciare/attivare/mettere in pila */
  const strict = phases;
  const stepName = (i: number) => t('stepNames').split('|')[i] ?? '';
  /** c'è una creatura con attacco improvviso o doppio attacco sul campo? (CR 510.4) */
  const anyFirstStrike = () =>
    g.objs.some((o) => o.zone === 'battlefield' && (o.card.keywords.includes('First strike') || o.card.keywords.includes('Double strike')));
  const phaseName = (i: number) => t('phaseNames').split('|')[i] ?? '';

  function resetApp() {
    if (!window.confirm(t('resetConfirm'))) return;
    setTimeline([{ game: initialGame(), messages: [t('logReset')], time: now() }]);
    setPos(0);
    setTargeting(null);
    setPanels([]);
    setCollapsed([]);
    setMenu(null);
    setChoicesFor(null);
    setPreview(null);
    setShowExamples(true);
    setViewer(null);
    setHistoryOpen(false);
    setWideStack(false);
    setZoom({});
    setCopyAsk(null);
    // anche le impostazioni tornano a quelle iniziali
    try {
      ['help', 'phases', 'lang'].forEach((k) => localStorage.removeItem(k));
    } catch {}
    setHelp(false);
    setPhases(false);
    setLang(detect());
  }

  const { drag, start: startDrag, justDropped } = useDrag((item, target) => performDrop(item, target));

  // Apertura di un setup condiviso (#s=...)
  useEffect(() => {
    const code = sharedCodeFromUrl();
    if (!code) return;
    setNotice(t('sharedLoading'));
    decodeGame(code)
      .then((game) => {
        setTimeline([{ game, messages: [t('sharedLoaded')], time: now() }]);
        setShowExamples(false);
        setPos(0);
        setNotice(null);
      })
      .catch(() => {
        setNotice(t('sharedError'));
        setTimeout(() => setNotice(null), 5000);
      })
      .finally(() => history.replaceState(null, '', location.pathname));
  }, []);

  // Quando entra un nuovo oggetto in pila, scorri fino alla cima della pila (in basso)
  useEffect(() => {
    const el = stackCol.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [g.stack.length]);

  // Breve evidenziazione della barra storico quando cambia la condizione
  useEffect(() => {
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1000);
    return () => clearTimeout(id);
  }, [pos, timeline.length]);

  /** Nuova condizione: cancella le condizioni "future" e aggiunge questa in fondo. */
  function commit(next: Game, ...messages: string[]) {
    const tl = [...timeline.slice(0, pos + 1), { game: next, messages, time: now() }].slice(-HISTORY_LIMIT);
    setTimeline(tl);
    setPos(tl.length - 1);
  }
  function goTo(i: number) {
    if (i < 0 || i >= timeline.length) return;
    setPos(i);
    setTargeting(null);
    setMenu(null);
  }

  const isFallback = preview && lang !== 'en' && preview.lang !== langInfo(lang).scryfall;
  const sourceIndex = g.stack.findIndex((s) => s.uid === targeting);
  const resolvingItem = g.stack.find((s) => s.uid === g.resolving) ?? null;
  const nextPlayer = (p: PlayerId) => g.players[(g.players.indexOf(p) + 1) % g.players.length];
  const graveyard = (p: PlayerId) => g.objs.filter((o) => o.zone === 'graveyard' && o.owner === p);
  const library = (p: PlayerId) => g.objs.filter((o) => o.zone === 'library' && o.owner === p);
  const hand = (p: PlayerId) => g.objs.filter((o) => o.zone === 'hand' && o.owner === p);
  const exile = g.objs.filter((o) => o.zone === 'exile');

  function labelOf(key: string): string {
    const [kind, id] = key.split(':');
    if (kind === 'player') return `${t('player')} ${id}`;
    const n = Number(id);
    if (kind === 'stack') return g.stack.find((x) => x.uid === n)?.card.printedName ?? '?';
    return g.objs.find((o) => o.uid === n)?.card.printedName ?? '?';
  }
  function whereLabel(dest: Destination, p: PlayerId): string {
    if (dest === 'battlefield') return tr('battlefieldOf', { p });
    if (dest === 'graveyard') return tr('graveyardOf', { p });
    if (dest === 'exile') return t('exileZone');
    if (dest === 'hand') return tr('handOf', { p });
    if (dest === 'library') return tr('libraryTopOf', { p });
    if (dest === 'libraryBottom') return tr('libraryBottomOf', { p });
    return t('stackZone');
  }
  /** Con "Solo chi ha priorità" attivo, solo quel giocatore può lanciare/attivare/mettere in pila. */
  const mayAct = (p: PlayerId) => !strict || g.priority === p;
  function guard(p: PlayerId): boolean {
    if (mayAct(p)) return true;
    setNotice(tr('notAllowed', { p: g.priority ?? t('nobody') }));
    setTimeout(() => setNotice(null), 3500);
    return false;
  }
  const destName = (d: Destination) =>
    ({
      battlefield: t('battlefield'),
      graveyard: t('graveyard'),
      exile: t('exile'),
      stack: t('stack'),
      hand: t('hand'),
      library: t('libraryTop'),
      libraryBottom: t('libraryBottom'),
    })[d];

  // ---- Giocatori ----
  function addPlayer() {
    if (g.players.length >= MAX_PLAYERS) return;
    const p = ALL_PLAYERS[g.players.length];
    commit({ ...g, players: [...g.players, p], passed: [] }, tr('logAddPlayer', { p }));
  }
  function removePlayer() {
    if (g.players.length <= MIN_PLAYERS) return;
    const gone = g.players[g.players.length - 1];
    const reset = g.active === gone || g.priority === gone;
    commit(
      {
        ...g,
        players: g.players.slice(0, -1),
        objs: g.objs.filter((o) => o.controller !== gone && o.owner !== gone),
        stack: g.stack.filter((x) => x.controller !== gone),
        passed: [],
        active: reset ? 'A' : g.active,
        priority: g.resolving !== null ? null : reset ? 'A' : g.priority,
      },
      tr('logRemovePlayer', { p: gone }),
    );
    setPanels((ps) => ps.filter((x) => x !== `gy:${gone}`));
    setTargeting(null);
  }
  function changeActive(p: PlayerId) {
    if (g.resolving !== null) return;
    commit({ ...g, active: p, priority: p, passed: [] }, tr('logTurn', { p }));
  }

  // ---- Carte ----
  /** La carta richiede scelte al momento del lancio? (CR 601.2b) */
  const needsChoices = (c: Card) =>
    canChooseFace(c) || hasX(c, null) || !!parseModes(c, null) || costKeywords(c).additional.length > 0 || costKeywords(c).alternative.length > 0;

  /**
   * Velocità stregoneria (CR 307.1, 301.1…): stregonerie e permanenti senza lampo solo nella propria
   * fase principale, a pila vuota, con la priorità. Controllata solo con "Solo chi ha priorità" + "Fasi".
   */
  function sorcerySpeedOk(card: Card, p: PlayerId): boolean {
    if (!phases) return true;
    const slow = /\b(Sorcery|Creature|Artifact|Enchantment|Planeswalker|Battle)\b/.test(card.oracleType) && !card.keywords.includes('Flash');
    if (!slow) return true;
    const ok = p === g.active && (g.step === STEP.main1 || g.step === STEP.main2) && g.stack.length === 0;
    if (!ok) {
      setNotice(tr('sorcerySpeed', { card: card.printedName }));
      setTimeout(() => setNotice(null), 5000);
    }
    return ok;
  }

  function cast(controller: PlayerId) {
    if (!preview || g.resolving !== null || !guard(controller) || !sorcerySpeedOk(preview, controller)) return;
    const uid = newUid();
    // CR 117.3c: chi lancia una magia riceve di nuovo la priorità; i passaggi precedenti non contano più
    commit(
      {
        ...g,
        stack: [...g.stack, { uid, card: preview, owner: controller, controller, targets: [], kind: 'spell' }],
        priority: controller,
        passed: [],
      },
      tr('logCast', { p: controller, card: preview.printedName }),
    );
    setShowExamples(false);
    // CR 601.2b: modalità, X, costi e metà si scelgono subito dopo l'annuncio
    if (needsChoices(preview)) setChoicesFor(uid);
    setPreview(null);
  }

  /** Nome mostrato di un oggetto in pila: la faccia lanciata, se scelta. */
  const itemName = (it: StackItem) =>
    (it.kind === 'spell' ? chosenFace(it.card, it.choices, it.copy)?.printedName : null) ?? it.card.printedName;

  function saveChoices(uid: number, ch: Choices) {
    const it = g.stack.find((x) => x.uid === uid);
    setChoicesFor(null);
    if (!it) return;
    const next: StackItem = { ...it, choices: Object.keys(ch).length ? ch : undefined };
    const sum = summarize(it.card, ch, { mode: t('mode') }).join(' · ');
    commit(
      { ...g, stack: g.stack.map((x) => (x.uid === uid ? next : x)) },
      tr('logChoices', { card: itemName(next), choices: sum || '—' }),
    );
  }

  /**
   * Una magia o abilità lascia la pila: dove va dipende da come è stata lanciata
   * (copia, flashback, avventura, buyback, permanente…). resolved = si è risolta.
   */
  function leaveStack(base: Game, it: StackItem, resolved: boolean): { game: Game; msgs: string[] } {
    const card = itemName(it);
    const face = it.kind === 'spell' ? chosenFace(it.card, it.choices, it.copy) : null;
    const permanent = face ? face.isPermanent : it.card.isPermanent;
    const dest = leaveDestination(it, resolved, permanent);
    const msgs: string[] = resolved ? [] : [tr('notResolved', { card })];
    if (dest === 'cease') {
      const game = { ...base, stack: base.stack.filter((x) => x.uid !== it.uid) };
      if (it.kind !== 'spell') msgs.push(resolved ? tr('abilityResolved', { card }) : tr('logCease', { card }));
      else msgs.push(tr('logCease', { card }));
      return { game, msgs };
    }
    // bifronte modale lanciata col retro: sul campo mostra il retro
    const item =
      dest === 'battlefield' && it.card.layout === 'modal_dfc' && face?.image
        ? { ...it, card: { ...it.card, image: face.image, printedName: face.printedName } }
        : it;
    const { game } = relocate(base, { kind: 'stack', item }, dest);
    if (dest === 'battlefield') msgs.push(tr('resolvedPermanent', { card }));
    else if (dest === 'hand') msgs.push(tr('logToHand', { card }));
    else if (dest === 'graveyard') msgs.push(resolved ? tr('resolved', { card }) : tr('goesGraveyard', { card }));
    else if (dest === 'exile')
      msgs.push(resolved && it.card.layout === 'adventure' && it.choices?.face === 1 ? tr('logAdventure', { card }) : tr('logFlashbackExile', { card }));
    else msgs.push(tr('logMove', { card, where: whereLabel(dest, it.owner) }));
    return { game, msgs };
  }

  // ---- Permanenti: TAPpare, preparare ----
  function setObj(o: CardObj, patch: Partial<CardObj>, msg: string) {
    commit({ ...g, objs: g.objs.map((x) => (x.uid === o.uid ? { ...x, ...patch } : x)) }, msg);
  }
  /** Magia preparata: si lancia una copia della magia di preparazione; la creatura smette di essere preparata. */
  function castPrepared(o: CardObj) {
    if (g.resolving !== null || !o.card.faces[1] || !guard(o.controller)) return;
    const item: StackItem = {
      uid: newUid(),
      card: o.card,
      owner: o.controller,
      controller: o.controller,
      targets: [],
      kind: 'spell',
      copy: true,
    };
    commit(
      {
        ...g,
        objs: g.objs.map((x) => (x.uid === o.uid ? { ...x, prepared: false } : x)),
        stack: [...g.stack, item],
        priority: o.controller,
        passed: [],
      },
      tr('logCastPrepared', { p: o.controller, spell: o.card.faces[1].printedName, card: o.card.faces[0].printedName }),
    );
    if (hasX(o.card, o.card.faces[1]) || parseModes(o.card, o.card.faces[1])) setChoicesFor(item.uid);
  }
  /**
   * Mette in pila un'abilità. Attivata (CR 602): chi la attiva riceve la priorità (117.3c).
   * Innescata (CR 603.3): va in pila quando un giocatore riceverebbe la priorità; la priorità non cambia.
   */
  function addAbility(text: string) {
    if (!abilityPick) return;
    const { card, kind, controller } = abilityPick;
    const item: StackItem = { uid: newUid(), card, owner: controller, controller, targets: [], kind, text: text || undefined };
    const priority = kind === 'activated' ? controller : g.priority;
    commit(
      { ...g, stack: [...g.stack, item], priority, passed: [] },
      tr(kind === 'activated' ? 'logActivate' : 'logTrigger', { p: controller, card: card.printedName }),
    );
    setAbilityPick(null);
    setPreview(null);
    setShowExamples(false);
  }

  function putOnBattlefield(controller: PlayerId) {
    if (!preview) return;
    commit(
      { ...g, objs: [...g.objs, { uid: newUid(), card: preview, owner: controller, controller, zone: 'battlefield' }] },
      tr('logBattlefield', { p: controller, card: preview.printedName }),
    );
    setPreview(null);
    setShowExamples(false);
  }
  function moveObj(o: CardObj, dest: Destination, controller?: PlayerId) {
    const holder = controller ?? (o.zone === 'battlefield' ? o.controller : o.owner);
    if (dest === 'stack' && !guard(holder)) return;
    const { game, tokenGone } = relocate(g, { kind: 'obj', obj: o }, dest, controller);
    let next = game;
    // Mettere una carta in pila dà la priorità a chi la controlla (salvo durante una risoluzione)
    if (dest === 'stack' && !tokenGone && g.resolving === null) next = { ...next, priority: holder, passed: [] };
    const card = o.card.printedName;
    const msgs = [tr('logMove', { card, where: whereLabel(dest, dest === 'battlefield' ? holder : o.owner) })];
    if (tokenGone) msgs.push(tr('logTokenGone', { card }));
    commit(next, ...msgs);
  }
  function tokenCopy(o: CardObj) {
    const controller = o.zone === 'battlefield' ? o.controller : o.owner;
    commit(
      {
        ...g,
        objs: [...g.objs, { uid: newUid(), card: o.card, owner: controller, controller, zone: 'battlefield', token: true }],
      },
      tr('logToken', { p: controller, card: o.card.printedName }),
    );
  }
  function removeObj(o: CardObj) {
    commit({ ...g, objs: g.objs.filter((x) => x.uid !== o.uid) }, tr('logRemoveCard', { card: o.card.printedName }));
  }
  /** Cambiare controllo non crea un nuovo oggetto: le frecce restano valide. */
  function giveControl(target: { obj?: CardObj; item?: StackItem }, p: PlayerId) {
    if (target.obj) {
      const o = target.obj;
      commit(
        { ...g, objs: g.objs.map((x) => (x.uid === o.uid ? { ...x, controller: p } : x)) },
        tr('logControl', { p, card: o.card.printedName }),
      );
    } else if (target.item) {
      const it = target.item;
      commit(
        { ...g, stack: g.stack.map((x) => (x.uid === it.uid ? { ...x, controller: p } : x)) },
        tr('logControl', { p, card: itemName(it) }),
      );
    }
  }

  /** Copia di un oggetto in pila: stesse scelte e bersagli (CR 707.10). Va in cima alla pila. */
  function copyItem(it: StackItem, keepTargets: boolean) {
    const copy: StackItem = { ...it, uid: newUid(), copy: true, targets: keepTargets ? [...it.targets] : [] };
    commit(
      { ...g, stack: [...g.stack, copy], passed: [] },
      tr('logCopy', { p: it.controller, card: itemName(it) }),
    );
    // nuovi bersagli: si entra subito in modalità bersaglio per la copia
    if (!keepTargets) setTargeting(copy.uid);
  }
  /** Duplica: come se l'oggetto venisse aggiunto di nuovo dalla barra di ricerca. */
  function duplicateItem(it: StackItem) {
    if (g.resolving !== null && it.kind !== 'triggered') return;
    if (it.kind !== 'triggered' && !guard(it.controller)) return;
    const dup: StackItem = { uid: newUid(), card: it.card, owner: it.owner, controller: it.controller, targets: [], kind: it.kind, text: it.text };
    const priority = it.kind === 'triggered' ? g.priority : it.controller;
    commit({ ...g, stack: [...g.stack, dup], priority, passed: [] }, tr('logDuplicate', { p: it.controller, card: it.card.printedName }));
    if (it.kind === 'spell' && needsChoices(it.card)) setChoicesFor(dup.uid);
  }

  /** Riordino della pila: modifica del setup, non un'azione di gioco. */
  function reorderStack(it: StackItem, index: number) {
    const from = g.stack.findIndex((x) => x.uid === it.uid);
    const to = Math.max(0, Math.min(index, g.stack.length - 1));
    if (from < 0 || from === to) return;
    const stack = [...g.stack];
    stack.splice(from, 1);
    stack.splice(to, 0, it);
    commit({ ...g, stack }, tr('logReorder', { card: itemName(it), n: String(to + 1) }));
  }

  /** Un oggetto in pila trascinato in un'altra zona. Abilità e copie cessano di esistere. */
  function stackTo(it: StackItem, dest: Exclude<Destination, 'stack'>, controller?: PlayerId) {
    const wasResolving = g.resolving === it.uid;
    const after = (game: Game): Game =>
      wasResolving ? { ...game, resolving: null, priority: g.active, passed: [] } : game;
    if (it.kind !== 'spell' || it.copy) {
      commit(after({ ...g, stack: g.stack.filter((x) => x.uid !== it.uid) }), tr('logCease', { card: itemName(it) }));
      return;
    }
    const { game } = relocate(g, { kind: 'stack', item: it }, dest, controller);
    commit(after(game), tr('logMove', { card: itemName(it), where: whereLabel(dest, controller ?? it.owner) }));
  }

  /** Rilascio di una carta trascinata su una destinazione (data-drop). */
  function performDrop(item: DragItem, target: string) {
    const [kind, arg] = target.split(':');
    if (item.kind === 'obj') {
      const o = g.objs.find((x) => x.uid === item.uid);
      if (!o) return;
      if (kind === 'bf') {
        const p = arg as PlayerId;
        if (o.zone !== 'battlefield') moveObj(o, 'battlefield', p);
        else if (o.controller !== p) giveControl({ obj: o }, p);
      } else if (kind === 'gy' && o.zone !== 'graveyard') moveObj(o, 'graveyard');
      else if (kind === 'lib' && o.zone !== 'library') moveObj(o, 'library');
      else if (kind === 'hand' && o.zone !== 'hand') moveObj(o, 'hand');
      else if (kind === 'exile' && o.zone !== 'exile') moveObj(o, 'exile');
      else if (kind === 'stack' || kind === 'stackpos') moveObj(o, 'stack');
    } else {
      const it = g.stack.find((x) => x.uid === item.uid);
      if (!it) return;
      if (kind === 'stackpos') reorderStack(it, Number(arg));
      else if (kind === 'stack') reorderStack(it, g.stack.length - 1);
      else if (kind === 'bf') stackTo(it, 'battlefield', arg as PlayerId);
      else if (kind === 'gy') stackTo(it, 'graveyard');
      else if (kind === 'lib') stackTo(it, 'library');
      else if (kind === 'hand') stackTo(it, 'hand');
      else if (kind === 'exile') stackTo(it, 'exile');
    }
  }

  function removeFromStack(it: StackItem) {
    const wasResolving = g.resolving === it.uid;
    commit(
      {
        ...g,
        stack: g.stack.filter((x) => x.uid !== it.uid),
        resolving: wasResolving ? null : g.resolving,
        priority: wasResolving ? g.active : g.priority,
      },
      tr('logRemoved', { card: it.card.printedName }),
    );
    if (targeting === it.uid) setTargeting(null);
  }

  // ---- Priorità e risoluzione ----
  /** CR 117.3d / 117.4: chi ha la priorità passa; se tutti passano di fila, la cima della pila inizia a risolversi. */
  function pass() {
    if (g.priority === null) return;
    const who = g.priority;
    const passMsg = tr('logPass', { p: who });
    const nowPassed = [...g.passed, who];

    if (nowPassed.length < g.players.length) {
      commit({ ...g, passed: nowPassed, priority: nextPlayer(who) }, passMsg);
      return;
    }
    const top = g.stack[g.stack.length - 1];
    if (!top) {
      if (!phases) {
        commit({ ...g, passed: [], priority: g.active }, passMsg, t('emptyPass'));
        return;
      }
      const { game, msgs } = advanceStep(g);
      commit(game, passMsg, ...msgs);
      return;
    }
    // CR 608.2b: i bersagli si ricontrollano all'inizio della risoluzione
    const name = itemName(top);
    const legal = top.targets.filter((k) => isLegal(g, k));
    if (top.targets.length > 0 && legal.length === 0) {
      const { game, msgs } = leaveStack(g, top, false);
      commit({ ...game, passed: [], priority: g.active }, passMsg, ...msgs);
      return;
    }
    const msgs = [passMsg, tr('resolvingStart', { card: name })];
    if (legal.length < top.targets.length) msgs.push(tr('partial', { card: name }));
    // Durante la risoluzione nessuno ha priorità
    commit({ ...g, passed: [], priority: null, resolving: top.uid }, ...msgs);
    setTargeting(null);
  }

  /**
   * Pila vuota e tutti passano: si va alla sottofase/fase successiva (CR 500.2).
   * STAP e cancellazione: di norma nessuno riceve priorità; nella STAP il giocatore attivo STAPpa i suoi permanenti (502.3).
   */
  function advanceStep(base: Game): { game: Game; msgs: string[] } {
    let step = base.step + 1;
    let active = base.active;
    let objs = base.objs;
    const msgs: string[] = [];
    if (step === STEP.cleanup) {
      msgs.push(t('logCleanup'));
      step++;
    }
    if (step >= STEP_COUNT) {
      active = nextPlayer(active);
      step = STEP.untap;
      msgs.push(tr('logTurn', { p: active }));
    }
    if (step === STEP.untap) {
      objs = objs.map((o) => (o.zone === 'battlefield' && o.controller === active ? { ...o, tapped: false } : o));
      msgs.push(tr('logUntapStep', { p: active }));
      step = STEP.upkeep;
    }
    msgs.push(tr('logStep', { step: stepName(step), p: active }));
    return { game: { ...base, objs, step, active, priority: active, passed: [] }, msgs };
  }
  function setStep(step: number) {
    commit({ ...g, step, priority: g.active, passed: [] }, tr('logStepSet', { step: stepName(step) }));
  }

  /** Fine della risoluzione: la carta va nella sua zona, poi priorità al giocatore attivo (CR 117.3b). */
  function finishResolution() {
    const it = resolvingItem;
    if (!it) return;
    // CR 608.3: permanente → campo; CR 608.2n: istantaneo/stregoneria → cimitero; abilità e copie cessano di esistere
    const { game, msgs } = leaveStack(g, it, true);
    commit({ ...game, resolving: null, priority: g.active, passed: [] }, ...msgs);
  }

  // ---- Bersagli ----
  /** Una magia/abilità può bersagliare giocatori, carte e oggetti già in pila sotto di lei (CR 115.5). */
  function canTarget(key: string): boolean {
    if (targeting === null) return false;
    if (key.startsWith('stack:')) {
      const i = g.stack.findIndex((s) => objKey.stack(s.uid) === key);
      return i >= 0 && i < sourceIndex;
    }
    return true;
  }
  function onObjectTap(key: string) {
    if (!canTarget(key)) return;
    const src = g.stack.find((x) => x.uid === targeting);
    if (!src) return;
    const had = src.targets.includes(key);
    commit(
      {
        ...g,
        stack: g.stack.map((it) =>
          it.uid !== src.uid ? it : { ...it, targets: had ? it.targets.filter((k) => k !== key) : [...it.targets, key] },
        ),
      },
      tr(had ? 'logUntarget' : 'logTarget', { card: src.card.printedName, target: labelOf(key) }),
    );
    // bersaglio scelto: la modalità bersaglio si chiude da sola
    setTargeting(null);
  }
  /** Mirino → modalità bersaglio (icona X). In modalità bersaglio, la X cancella tutte le frecce dell'oggetto. */
  function onTargetButton(item: StackItem) {
    if (targeting === item.uid) {
      if (item.targets.length) {
        commit(
          { ...g, stack: g.stack.map((it) => (it.uid === item.uid ? { ...it, targets: [] } : it)) },
          tr('logClearTargets', { card: item.card.printedName }),
        );
      }
      setTargeting(null);
    } else {
      setTargeting(item.uid);
    }
  }
  function onBackgroundTap(e: MouseEvent) {
    if (targeting === null) return;
    if (!(e.target as Element).closest('[data-obj], .tgt')) setTargeting(null);
  }

  /** Dove agganciare una freccia se la carta bersaglio non è visibile (pannello chiuso). */
  function zoneAnchor(key: string): string | undefined {
    if (key.startsWith('perm:')) {
      // permanente in un campo di battaglia chiuso: la freccia punta al nome del giocatore
      const o = g.objs.find((x) => x.uid === Number(key.slice(5)));
      return o && collapsed.includes(o.controller) ? objKey.player(o.controller) : undefined;
    }
    if (!key.startsWith('card:')) return undefined;
    const o = g.objs.find((x) => x.uid === Number(key.slice(5)));
    if (!o) return undefined;
    return o.zone === 'graveyard'
      ? `gy:${o.owner}`
      : o.zone === 'library'
        ? `lib:${o.owner}`
        : o.zone === 'hand'
          ? `hand:${o.owner}`
          : 'exile';
  }

  const links: Link[] = g.stack.flatMap((it) =>
    it.targets.map((to) => {
      const illegal = !isLegal(g, to);
      return {
        from: objKey.stack(it.uid),
        to,
        fallback: g.gone[to] ?? zoneAnchor(to),
        color: illegal ? '#e06c5a' : PLAYER_COLOR[it.controller],
        illegal,
      };
    }),
  );

  const objProps = (key: string, extraClass: string) => ({
    'data-obj': key,
    class: `${extraClass}${canTarget(key) ? ' can-target' : ''}`,
    onClick: () => {
      if (!justDropped.current) onObjectTap(key);
    },
  });

  // ---- Pannelli (esilio, cimiteri): non fanno parte dello storico ----
  const togglePanel = (id: string) => setPanels((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));

  function openMenu(uid: number, e: MouseEvent) {
    e.stopPropagation();
    setMoveOpen(false);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // y = sotto il pulsante; top = sopra il pulsante (usato se la carta è nella metà bassa dello schermo)
    setMenu({ uid, x: r.right, y: r.bottom, top: r.top });
  }

  // ---- Condivisione ----
  async function openShare() {
    try {
      setShare({ url: shareUrl(await encodeGame(g)), copied: false });
    } catch {
      setShare({ url: '', copied: false });
    }
  }
  async function copyShare() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setShare({ ...share, copied: true });
    } catch {
      (document.getElementById('share-url') as HTMLInputElement | null)?.select();
    }
  }
  async function nativeShare() {
    if (!share?.url) return;
    try {
      await navigator.share({ title: 'Stack The Rat', url: share.url });
    } catch {}
  }

  /** Carta sul campo, nel cimitero o in esilio, con il menu ⋯ */
  const renderTile = (o: CardObj, cls: string) => (
    <div
      key={o.uid}
      {...objProps(objKey.of(o), `${cls}${o.tapped && o.zone === 'battlefield' ? ' tapped' : ''}`)}
      style={{ '--pc': PLAYER_COLOR[o.owner] }}
      onPointerDown={(e) => startDrag(e, { kind: 'obj', uid: o.uid, img: o.card.image })}
    >
      {o.card.image ? (
        <img src={o.card.image} alt={o.card.printedName} draggable={false} />
      ) : (
        <span class="no-img">{o.card.printedName}</span>
      )}
      <button type="button" class="eye" aria-label={`${t('viewCard')}: ${o.card.printedName}`} onClick={(e) => { e.stopPropagation(); setViewer(o.card); }}>
        <Icon d={EYE} size={14} />
      </button>
      {o.token && <span class="token-tag">{t('token')}</span>}
      {o.prepared && o.zone === 'battlefield' && <span class="prep-tag">{t('prepared')}</span>}
      {cls === 'tile' && <span class="owner-tag">{o.owner}</span>}
      <button type="button" class="more" aria-label={`${t('menu')}: ${o.card.printedName}`} onClick={(e) => openMenu(o.uid, e)}>
        ⋯
      </button>
    </div>
  );

  // Storico: tutti i messaggi, il più recente in alto; quelli "futuri" (dopo pos) appaiono attenuati
  const entries = timeline.flatMap((s, i) => s.messages.map((text, j) => ({ i, j, text, time: s.time })));
  const currentMessage = timeline[pos].messages[timeline[pos].messages.length - 1] ?? '';
  /** Pulsante di una zona del giocatore (grimorio, mano, cimitero): icona + numero; apre il pannello. */
  const zoneButton = (id: PlayerId, kind: 'lib' | 'hand' | 'gy', icon: string, count: number, label: string) => {
    const key = `${kind}:${id}`;
    return (
      <button
        type="button"
        class={`zone-btn${panels.includes(key) ? ' on' : ''}${drag?.over === key ? ' drop-over' : ''}`}
        data-obj={key}
        data-drop={key}
        aria-pressed={panels.includes(key)}
        aria-label={`${label}: ${count}`}
        title={label}
        onClick={() => togglePanel(key)}
      >
        <Icon d={icon} size={15} />
        <span>{count}</span>
      </button>
    );
  };

  /** Zona di un giocatore: intestazione (chiudi, nome, cimitero), priorità, campo di battaglia. */
  const renderZone = (id: PlayerId) => {
          const mine = g.objs.filter((o) => o.zone === 'battlefield' && o.controller === id);
          const gy = graveyard(id);
          const hasPrio = g.priority === id;
          const isCollapsed = collapsed.includes(id);
          return (
            <section
              key={id}
              class={`zone${hasPrio ? ' has-priority' : ''}${isCollapsed ? ' collapsed' : ''}${drag?.over === `bf:${id}` ? ' drop-over' : ''}`}
              data-drop={`bf:${id}`}
              style={{ '--pc': PLAYER_COLOR[id] }}
            >
              <div class="zone-head">
                <button
                  type="button"
                  class="collapse"
                  aria-expanded={!isCollapsed}
                  aria-label={tr(isCollapsed ? 'expand' : 'collapse', { p: id })}
                  onClick={() => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
                >
                  <Icon d={chevron(!isCollapsed)} size={16} />
                </button>
                <button type="button" {...objProps(objKey.player(id), 'player-tag')}>
                  {narrow ? id : `${t('player')} ${id}`}
                </button>
                {!narrow && !isCollapsed && (
                  <div class="zoom-btns">
                    <button type="button" aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => setZoomOf(id, zoomOf(id) - 0.2)}>
                      −
                    </button>
                    <button type="button" aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => setZoomOf(id, zoomOf(id) + 0.2)}>
                      +
                    </button>
                  </div>
                )}
                {zoneButton(id, 'lib', LIBRARY, library(id).length, tr('libraryOf', { p: id }))}
                {zoneButton(id, 'hand', HAND, hand(id).length, tr('handOf', { p: id }))}
                {zoneButton(id, 'gy', TOMBSTONE, gy.length, tr('graveyardOf', { p: id }))}
              </div>
              {hasPrio && (
                <div class="prio-strip">
                  <span class="prio-arrow" aria-hidden="true">
                    ▶
                  </span>
                  {t('hasPriority')}
                </div>
              )}
              {!isCollapsed && (
              <div
                class="field"
                style={{ '--zoom': zoomOf(id) }}
                data-zoom={id}
              >
                {mine.length === 0 && !(showExamples && id === 'A' && examples.perms.length) && (
                  <p class="status">{t('battlefieldEmpty')}</p>
                )}
                {showExamples &&
                  id === 'A' &&
                  examples.perms.map((c) => (
                    <div key={c.scryfallId} class="perm example">
                      <img src={c.image} alt={c.printedName} draggable={false} />
                      <span class="example-tag">{t('example')}</span>
                      <button type="button" class="eye" aria-label={`${t('viewCard')}: ${c.printedName}`} onClick={() => setViewer(c)}>
                        <Icon d={EYE} size={14} />
                      </button>
                    </div>
                  ))}
                {mine.map((o) => renderTile(o, 'perm'))}
              </div>
              )}
            </section>
          );
  };

  // Posizioni: 2 giocatori A sopra, B sotto; 3: A alto-sx, B alto-dx, C basso-sx; 4: A alto-sx, B alto-dx, C basso-dx, D basso-sx
  const columns: PlayerId[][] =
    g.players.length === 2
      ? [['A', 'B'], []]
      : g.players.length === 3
        ? [['A', 'C'], ['B']]
        : [['A', 'D'], ['B', 'C']];
  /** Pulsante dell'esilio: accanto alla ricerca (monitor) o nell'intestazione (telefono) */
  const exileButton = (
    <button
      type="button"
      class={`exile-btn${panels.includes('exile') ? ' on' : ''}${drag?.over === 'exile' ? ' drop-over' : ''}`}
      data-obj="exile"
      data-drop="exile"
      aria-pressed={panels.includes('exile')}
      aria-label={`${t('exile')}: ${exile.length}`}
      title={t('exile')}
      onClick={() => togglePanel('exile')}
    >
      <Portal />
      <span>{exile.length}</span>
    </button>
  );

  const menuObj = menu ? g.objs.find((o) => o.uid === menu.uid) : undefined;

  return (
    <main class={`shell${targeting !== null ? ' targeting' : ''}`} onClick={onBackgroundTap}>
      <header class="top">
        <h1>Stack The Rat</h1>
        {narrow && (
          <>
            <button
              type="button"
              class={`icon-btn${searchOpen ? ' on' : ''}`}
              aria-pressed={searchOpen}
              aria-label={t('searchLabel')}
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Icon d={SEARCH} size={18} />
            </button>
            {exileButton}
          </>
        )}
        <div class="player-count" role="group" aria-label={t('players')}>
          {!narrow && (
            <>
              {document.fullscreenEnabled && (
                <button
                  type="button"
                  class="share-btn"
                  onClick={toggleFullscreen}
                  aria-pressed={isFull}
                  aria-label={t('fullscreen')}
                  title={t('fullscreen')}
                >
                  <Icon d={isFull ? EXIT_FULL : FULL} size={18} />
                </button>
              )}
              <button type="button" class="share-btn" onClick={resetApp} aria-label={t('reset')} title={t('reset')}>
                <Icon d={RESET} size={18} />
              </button>
              <button type="button" class="share-btn" onClick={openShare} aria-label={t('share')} title={t('share')}>
                <Icon d={SHARE} size={18} />
              </button>
            </>
          )}
          <button type="button" onClick={removePlayer} disabled={g.players.length <= MIN_PLAYERS} aria-label={t('removePlayer')}>
            −
          </button>
          <span>{g.players.length}</span>
          <button type="button" onClick={addPlayer} disabled={g.players.length >= MAX_PLAYERS} aria-label={t('addPlayer')}>
            +
          </button>
        </div>
        {narrow ? (
          <button
            type="button"
            class={`icon-btn${moreOpen ? ' on' : ''}`}
            aria-expanded={moreOpen}
            aria-label={t('moreMenu')}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <Icon d={KEBAB} size={18} />
          </button>
        ) : (
          <label class="lang">
            <span class="sr-only">{t('language')}</span>
            <select value={lang} onChange={(e) => setLang((e.target as HTMLSelectElement).value as Lang)}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {narrow && moreOpen && (
        <div class="menu-backdrop" onClick={() => setMoreOpen(false)}>
          <div class="menu more-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            {document.fullscreenEnabled && (
              <button type="button" role="menuitem" onClick={() => { toggleFullscreen(); setMoreOpen(false); }}>
                <Icon d={isFull ? EXIT_FULL : FULL} size={16} /> {t('fullscreen')}
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); openShare(); }}>
              <Icon d={SHARE} size={16} /> {t('share')}
            </button>
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); resetApp(); }}>
              <Icon d={RESET} size={16} /> {t('reset')}
            </button>
            <hr />
            <p class="menu-label">{t('language')}</p>
            <div class="menu-chips lang-chips">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={lang === l.code}
                  class={lang === l.code ? 'on' : ''}
                  onClick={() => { setLang(l.code); setMoreOpen(false); }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div class="notice" role="status">
          <span>{notice}</span>
          <button type="button" class="notice-close" aria-label={t('close')} onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      {(!narrow || searchOpen || targeting !== null) && (
        <div class="search-row">
          {targeting !== null ? (
            <p class="hint">{t('targetingHint')}</p>
          ) : (
            <CardSearch
              autoFocus={narrow}
              onPick={(c) => {
                setPreview(c);
                setSearchOpen(false);
              }}
            />
          )}
          {narrow ? (
            targeting === null && (
              <button type="button" class="icon-btn" aria-label={t('close')} onClick={() => setSearchOpen(false)}>
                <Icon d={CROSS} size={16} />
              </button>
            )
          ) : (
            exileButton
          )}
        </div>
      )}

      {panels.length > 0 && (
        <div class="panels">
          {panels.map((id) => {
            const isExile = id === 'exile';
            const [kind, who] = id.split(':');
            const owner = (isExile ? null : who) as PlayerId | null;
            // grimorio: la prima carta mostrata è quella in cima
            const cards = isExile
              ? exile
              : kind === 'lib'
                ? [...library(owner!)].reverse()
                : kind === 'hand'
                  ? hand(owner!)
                  : graveyard(owner!);
            const zoneLabel = kind === 'lib' ? t('library') : kind === 'hand' ? t('hand') : t('graveyard');
            const zoneIcon = kind === 'lib' ? LIBRARY : kind === 'hand' ? HAND : TOMBSTONE;
            return (
              <section
                key={id}
                class={`panel${drag?.over === id ? ' drop-over' : ''}`}
                data-drop={id}
                style={{ '--pc': owner ? PLAYER_COLOR[owner] : '#9aa3b5' }}
              >
                <div class="panel-head">
                  {isExile ? <Portal size={16} /> : <Icon d={zoneIcon} size={16} />}
                  <span class="panel-title">
                    {isExile ? t('exile') : `${zoneLabel} · ${t('player')} ${owner}`} ({cards.length})
                    {kind === 'lib' && cards.length > 1 && <small> · {t('topFirst')}</small>}
                  </span>
                  <button type="button" class="panel-close" aria-label={t('close')} onClick={() => togglePanel(id)}>
                    <Icon d={CROSS} size={16} />
                  </button>
                </div>
                <div class="panel-list">
                  {cards.length === 0 ? <p class="status">—</p> : cards.map((o) => renderTile(o, 'tile'))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div class={`table ${g.players.length === 2 ? 'two' : 'multi'}`}>
        {columns[0].length > 0 && <div class="col">{columns[0].map(renderZone)}</div>}

        <section class={`stack-col${wideStack ? ' wide' : ''}${drag?.over === 'stack' ? ' drop-over' : ''}`} ref={stackCol} data-drop="stack">
          <div
            class={`priority${g.priority === null ? ' nobody' : ''}${narrow ? ' compact' : ''}`}
            style={{ '--pc': g.priority ? PLAYER_COLOR[g.priority] : '' }}
          >
            {(!narrow || prioOpts) && (
              <div class="prio-opts">
            <div class="turn-row">
            <label class="turn">
              {t('turn')}
              <select
                value={g.active}
                disabled={g.resolving !== null}
                onChange={(e) => changeActive((e.target as HTMLSelectElement).value as PlayerId)}
              >
                {g.players.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label class="help-toggle">
              <input type="checkbox" checked={help} onChange={(e) => toggleHelp((e.target as HTMLInputElement).checked)} />
              {t('help')}
            </label>
            </div>
            <label class="help-toggle" title={t('phasesHelp')}>
              <input type="checkbox" checked={phases} onChange={(e) => togglePhases((e.target as HTMLInputElement).checked)} />
              {t('phases')}
            </label>
              </div>
            )}
            {phases && (
              <div class="step-row">
                <StepPicker
                  step={g.step}
                  groups={STEP_GROUPS}
                  stepName={stepName}
                  phaseName={phaseName}
                  disabled={g.resolving !== null}
                  warnStep={anyFirstStrike() ? STEP.damage : null}
                  onPick={setStep}
                  shortName={narrow ? (i) => t('stepShort').split('|')[i] ?? '' : undefined}
                />
                {anyFirstStrike() && (
                  <button
                    type="button"
                    class="warn"
                    title={t('firstStrikeWarn')}
                    aria-label={t('firstStrikeWarn')}
                    onClick={() => setNotice(t('firstStrikeWarn'))}
                  >
                    <Icon d={WARN} size={14} /> 510.4
                  </button>
                )}
              </div>
            )}
            {resolvingItem ? (
              <>
                <p class="resolving-msg">{tr('resolvingBanner', { card: resolvingItem.card.printedName })}</p>
                <button type="button" class="finish" onClick={finishResolution}>
                  ✓ {t('finish')}
                </button>
              </>
            ) : (
              <>
                <div class="prio-row">
                  {!narrow && (
                    <span class="prio-who">
                      {t('priority')}: <b>{g.priority ?? t('nobody')}</b>
                    </span>
                  )}
                  {false && (
                    <span class="passes inline" title={t('passHelp')}>
                      {g.players.map((p) => (
                        <span key={p} class={g.passed.includes(p) ? 'passed' : ''} style={{ '--pc': PLAYER_COLOR[p] }}>
                          {p}
                          {g.passed.includes(p) ? '✓' : ''}
                        </span>
                      ))}
                    </span>
                  )}
                  <button
                    type="button"
                    class="pass"
                    onClick={pass}
                    aria-label={`${t('pass')} (${t('player')} ${g.priority ?? ''})`}
                  >
                    {t('pass')}
                  </button>
                  {narrow && (
                    <button
                      type="button"
                      class={`icon-btn small${prioOpts ? ' on' : ''}`}
                      aria-expanded={prioOpts}
                      aria-label={t('options')}
                      onClick={() => setPrioOpts(!prioOpts)}
                    >
                      <Icon d={GEAR} size={16} />
                    </button>
                  )}
                </div>
                {!narrow && <div class="passes" title={t('passHelp')}>
                  {g.players.map((p) => (
                    <span key={p} class={g.passed.includes(p) ? 'passed' : ''} style={{ '--pc': PLAYER_COLOR[p] }}>
                      {p}
                      {g.passed.includes(p) ? ' ✓' : ''}
                    </span>
                  ))}
                </div>}
              </>
            )}
          </div>

          <div class="pile-head">
            <h2>{t('stack')}</h2>
            <button
              type="button"
              class="widen"
              aria-pressed={wideStack}
              aria-label={wideStack ? t('narrowStack') : t('widenStack')}
              title={wideStack ? t('narrowStack') : t('widenStack')}
              onClick={() => setWideStack(!wideStack)}
            >
              <Icon d={wideStack ? NARROW : WIDEN} size={16} />
            </button>
          </div>
          {g.stack.length === 0 ? (
            <>
              <p class="status">{t('stackEmpty')}</p>
              {showExamples && examples.spell?.image && (
                <ol class="pile">
                  <li class="pile-card is-top example" style={{ '--pc': PLAYER_COLOR.A }}>
                    <img src={examples.spell.image} alt={examples.spell.printedName} draggable={false} />
                    <span class="ctrl">A</span>
                    <span class="example-tag">{t('example')}</span>
                    <button
                      type="button"
                      class="eye"
                      aria-label={`${t('viewCard')}: ${examples.spell.printedName}`}
                      onClick={() => setViewer(examples.spell!)}
                    >
                      <Icon d={EYE} size={16} />
                    </button>
                  </li>
                </ol>
              )}
            </>
          ) : (
            // La carta più vecchia sta in alto e dietro; l'ultima (in cima alla pila) è intera e illuminata
            <ol class="pile">
              {g.stack.map((it, i) => {
                const key = objKey.stack(it.uid);
                const isTop = i === g.stack.length - 1;
                const isSource = targeting === it.uid;
                const isResolving = g.resolving === it.uid;
                const showCross = isSource;
                return (
                  <li
                    key={it.uid}
                    {...objProps(
                      key,
                      `pile-card${isTop ? ' is-top' : ''}${isSource ? ' is-source' : ''}${isResolving ? ' is-resolving' : ''}`,
                    )}
                    data-anchor="strip"
                    data-drop={`stackpos:${i}`}
                    style={{ zIndex: i + 1, '--pc': PLAYER_COLOR[it.controller] }}
                    onPointerDown={(e) => startDrag(e, { kind: 'stack', uid: it.uid, img: it.card.image })}
                  >
                    {it.kind !== 'spell' ? (
                      <div class={`ability ${it.kind}`}>
                        <div class="ability-head">
                          <Icon d={it.kind === 'activated' ? ACTIVATE : TRIGGER} size={16} />
                          <span>{it.card.printedName}</span>
                        </div>
                        {it.card.art && <img class="ability-art" src={it.card.art} alt="" />}
                        <p class="ability-source">{it.card.printedName}</p>
                        <p class="ability-kind">{t(it.kind as Key)}</p>
                        <p class="ability-text">{it.text ?? '—'}</p>
                      </div>
                    ) : (chosenFace(it.card, it.choices, it.copy)?.image ?? it.card.image) ? (
                      <img src={chosenFace(it.card, it.choices, it.copy)?.image ?? it.card.image} alt={itemName(it)} draggable={false} />
                    ) : (
                      <div class="no-image">{it.card.printedName}</div>
                    )}
                    <span class="ctrl">{it.controller}</span>
                    {isTop && (
                    <button
                      type="button"
                      class="eye"
                      aria-label={`${t('viewCard')}: ${itemName(it)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewer(it.card);
                      }}
                    >
                      <Icon d={EYE} size={16} />
                    </button>
                    )}
                    {(it.copy || it.choices) && (
                      <div class="choice-chips">
                        {it.copy && <span class="chip-copy">{t('copyTag')}</span>}
                        {/* nome della magia preparata: solo per le copie di carte "prepara" (le altre lo hanno già nelle scelte) */}
                        {it.copy && it.card.layout === 'prepare' && it.card.faces[1] && (
                          <span>{it.card.faces[1].printedName}</span>
                        )}
                        {summarize(it.card, it.choices, { mode: t('mode') }).map((c, k) => (
                          <span key={k}>{c}</span>
                        ))}
                      </div>
                    )}
                    {isTop && <span class="badge">{isResolving ? t('resolvingTag') : t('top')}</span>}
                    <div class="card-tools">
                      {!isTop && (
                        <button
                          type="button"
                          class="eye-tool"
                          aria-label={`${t('viewCard')}: ${itemName(it)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewer(it.card);
                          }}
                        >
                          <Icon d={EYE} size={18} />
                        </button>
                      )}
                      <button
                        type="button"
                        class="more-stack"
                        aria-label={`${t('stackMenu')}: ${itemName(it)}`}
                        title={t('stackMenu')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setChoicesFor(it.uid);
                        }}
                      >
                        <Icon d={DOTS} />
                      </button>
                      {!isResolving && (
                        <button
                          type="button"
                          class={`tgt${showCross ? ' on' : ''}`}
                          aria-label={showCross ? t('clearTargets') : t('target')}
                          aria-pressed={isSource}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTargetButton(it);
                          }}
                        >
                          {showCross ? <Icon d={CROSS} /> : <Crosshair />}
                        </button>
                      )}
                      <button
                        type="button"
                        class="remove"
                        aria-label={`${t('remove')} ${it.card.printedName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromStack(it);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <footer class="credits">{t('credits')}</footer>
        </section>

        {columns[1].length > 0 && <div class="col">{columns[1].map(renderZone)}</div>}
      </div>

      {/* ---- Storico: indietro / avanti tra le condizioni ---- */}
      <section class={`bar history-bar${historyOpen ? ' open' : ''}${flash ? ' flash' : ''}`}>
        {historyOpen && (
          <ol class="log">
            {entries.length === 0 && <li class="status">{t('noHistory')}</li>}
            {[...entries].reverse().map((e) => (
              <li key={`${e.i}-${e.j}`} class={e.i > pos ? 'future' : e.i === pos ? 'current' : ''}>
                <button type="button" onClick={() => goTo(e.i)}>
                  <time>{e.time}</time> {e.text}
                </button>
              </li>
            ))}
          </ol>
        )}
        <div class="bar-row">
          <button type="button" class="step" onClick={() => goTo(pos - 1)} disabled={pos === 0} aria-label={t('back')} title={t('back')}>
            <Icon d={BACK} />
          </button>
          <button
            type="button"
            class="step"
            onClick={() => goTo(pos + 1)}
            disabled={pos >= timeline.length - 1}
            aria-label={t('forward')}
            title={t('forward')}
          >
            <Icon d={FORWARD} />
          </button>
          <button type="button" class="bar-head" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
            <span class="bar-title">
              {t('history')} {pos}/{timeline.length - 1}
            </span>
            <span class="last">{currentMessage}</span>
            <Icon d={chevron(!historyOpen)} size={18} />
          </button>
        </div>
      </section>

      <Arrows links={links} />

      {/* ---- Menu della carta ---- */}
      {menu && menuObj && (
        <div class="menu-backdrop" onClick={() => setMenu(null)}>
          <div
            class="menu"
            role="menu"
            style={
              // carta nella metà bassa: il menu si apre verso l'alto; in ogni caso non esce dallo schermo e scorre
              menu.y > window.innerHeight / 2
                ? {
                    left: `${Math.max(8, Math.min(menu.x - 220, window.innerWidth - 228))}px`,
                    bottom: `${Math.max(8, window.innerHeight - menu.top + 4)}px`,
                    maxHeight: `${Math.max(160, menu.top - 12)}px`,
                  }
                : {
                    left: `${Math.max(8, Math.min(menu.x - 220, window.innerWidth - 228))}px`,
                    top: `${menu.y + 4}px`,
                    maxHeight: `${Math.max(160, window.innerHeight - menu.y - 12)}px`,
                  }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <p class="menu-title">
              {menuObj.card.printedName}
              {menuObj.token ? ` · ${t('token')}` : ''}
            </p>
            {menuObj.zone === 'battlefield' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setObj(menuObj, { tapped: !menuObj.tapped }, tr(menuObj.tapped ? 'logUntap' : 'logTap', { card: menuObj.card.printedName }));
                  setMenu(null);
                }}
              >
                <Icon d={TAP} size={16} /> {menuObj.tapped ? t('untap') : t('tap')}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              aria-expanded={moveOpen}
              class="submenu-toggle"
              onClick={() => setMoveOpen(!moveOpen)}
            >
              <Icon d={MOVE} size={16} /> {t('moveTo')}
              <span class="chev">{moveOpen ? '▾' : '▸'}</span>
            </button>
            {moveOpen && (
              <div class="submenu" role="group">
                {DESTINATIONS.filter((d) => d !== menuObj.zone).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      moveObj(menuObj, d);
                      setMenu(null);
                    }}
                  >
                    {destName(d)}
                  </button>
                ))}
              </div>
            )}
            {menuObj.zone === 'battlefield' && g.players.length > 1 && (
              <div class="menu-control">
                <span>
                  <Icon d={CONTROL} size={16} /> {t('giveControl')}
                </span>
                <div class="menu-chips">
                  {g.players
                    .filter((p) => p !== menuObj.controller)
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="menuitem"
                        style={{ '--pc': PLAYER_COLOR[p] }}
                        onClick={() => {
                          giveControl({ obj: menuObj }, p);
                          setMenu(null);
                        }}
                      >
                        {p}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {menuObj.zone === 'battlefield' && menuObj.card.layout === 'prepare' && (
              <>
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  disabled={!menuObj.prepared || g.resolving !== null}
                  onClick={() => {
                    castPrepared(menuObj);
                    setMenu(null);
                  }}
                >
                  <Icon d={SPARK} size={16} /> {t('castPrepared')}
                  {menuObj.card.faces[1] ? `: ${menuObj.card.faces[1].printedName}` : ''}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setObj(
                      menuObj,
                      { prepared: !menuObj.prepared },
                      tr(menuObj.prepared ? 'logUnprepared' : 'logPrepared', { card: menuObj.card.printedName }),
                    );
                    setMenu(null);
                  }}
                >
                  {menuObj.prepared ? t('unprepare') : t('prepare')}
                </button>
              </>
            )}
            <hr />
            <button
              type="button"
              role="menuitem"
              disabled={g.resolving !== null}
              onClick={() => {
                const c = menuObj.zone === 'battlefield' ? menuObj.controller : menuObj.owner;
                if (!guard(c)) return setMenu(null);
                setAbilityPick({ card: menuObj.card, kind: 'activated', controller: c });
                setMenu(null);
              }}
            >
              <Icon d={ACTIVATE} size={16} /> {t('activate')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const c = menuObj.zone === 'battlefield' ? menuObj.controller : menuObj.owner;
                setAbilityPick({ card: menuObj.card, kind: 'triggered', controller: c });
                setMenu(null);
              }}
            >
              <Icon d={TRIGGER} size={16} /> {t('trigger')}
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                tokenCopy(menuObj);
                setMenu(null);
              }}
            >
              {t('tokenCopy')}
            </button>
            <button
              type="button"
              role="menuitem"
              class="danger"
              onClick={() => {
                removeObj(menuObj);
                setMenu(null);
              }}
            >
              {t('removeCard')}
            </button>
            <hr />
            <a class="menu-link" role="menuitem" href={menuObj.card.scryfallUri} target="_blank" rel="noopener noreferrer">
              <Icon d={EXTERNAL} size={16} /> {t('openScryfall')}
            </a>
          </div>
        </div>
      )}

      {choicesFor !== null && g.stack.some((x) => x.uid === choicesFor) && (
        <ChoicesSheet
          key={choicesFor}
          item={g.stack.find((x) => x.uid === choicesFor)!}
          onSave={(ch) => saveChoices(choicesFor, ch)}
          players={g.players}
          onCopy={() => {
            const it = g.stack.find((x) => x.uid === choicesFor);
            setChoicesFor(null);
            if (it) {
              if (it.targets.length) setCopyAsk(it);
              else copyItem(it, true);
            }
          }}
          onDuplicate={() => {
            const it = g.stack.find((x) => x.uid === choicesFor);
            setChoicesFor(null);
            if (it) duplicateItem(it);
          }}
          onMove={(dir) => {
            const idx = g.stack.findIndex((x) => x.uid === choicesFor);
            setChoicesFor(null);
            if (idx >= 0) reorderStack(g.stack[idx], idx + dir);
          }}
          index={g.stack.findIndex((x) => x.uid === choicesFor)}
          size={g.stack.length}
          onControl={(p) => giveControl({ item: g.stack.find((x) => x.uid === choicesFor) }, p)}
          onClose={() => setChoicesFor(null)}
        />
      )}

      {copyAsk && (
        <div class="sheet-backdrop" onClick={() => setCopyAsk(null)}>
          <section class="sheet choices-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{tr('copyAskTitle', { card: itemName(copyAsk) })}</h2>
            <p class="status">{t('copyAskText')}</p>
            <div class="actions">
              <button
                type="button"
                class="primary"
                onClick={() => {
                  copyItem(copyAsk, true);
                  setCopyAsk(null);
                }}
              >
                {t('copySame')}
              </button>
              <button
                type="button"
                class="secondary"
                onClick={() => {
                  copyItem(copyAsk, false);
                  setCopyAsk(null);
                }}
              >
                {t('copyNew')}
              </button>
              <button type="button" class="secondary" onClick={() => setCopyAsk(null)}>
                {t('cancel')}
              </button>
            </div>
          </section>
        </div>
      )}

      {help && <Help onClose={() => toggleHelp(false)} />}

      {viewer && <CardViewer card={viewer} onClose={() => setViewer(null)} />}

      {/* Carta trascinata: segue il dito */}
      {drag && (
        <div class="drag-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">
          {drag.item.img ? <img src={drag.item.img} alt="" /> : <span />}
        </div>
      )}

      {/* ---- Condivisione del setup ---- */}
      {share && (
        <div class="sheet-backdrop" onClick={() => setShare(null)}>
          <section class="sheet share-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{t('shareTitle')}</h2>
            {share.url ? (
              <>
                <p class="status">{t('shareHelp')}</p>
                <input id="share-url" readOnly value={share.url} onFocus={(e) => (e.target as HTMLInputElement).select()} />
                <div class="actions">
                  <button type="button" class="primary" onClick={copyShare}>
                    {share.copied ? t('copied') : t('copy')}
                  </button>
                  {'share' in navigator && (
                    <button type="button" class="secondary" onClick={nativeShare}>
                      {t('shareVia')}
                    </button>
                  )}
                  <button type="button" class="secondary" onClick={() => setShare(null)}>
                    {t('close')}
                  </button>
                </div>
              </>
            ) : (
              <p class="status error">{t('shareFail')}</p>
            )}
          </section>
        </div>
      )}

      {/* ---- Scheda carta (dopo la ricerca) ---- */}
      {preview && (
        <div class="sheet-backdrop" onClick={() => setPreview(null)}>
          <section class="sheet" onClick={(e) => e.stopPropagation()}>
            {preview.image && <img src={preview.image} alt={preview.printedName} />}
            <div class="sheet-body">
              {isFallback && <p class="status">{t('fallback')}</p>}
              <p class="label">{t('toStack')}</p>
              <div class="chips">
                {g.players.map((p) => (
                  <button
                    key={p}
                    type="button"
                    class="chip"
                    style={{ '--pc': PLAYER_COLOR[p] }}
                    disabled={g.resolving !== null || !mayAct(p)}
                    onClick={() => cast(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p class="label">{t('toBattlefield')}</p>
              <div class="chips">
                {g.players.map((p) => (
                  <button key={p} type="button" class="chip outline" style={{ '--pc': PLAYER_COLOR[p] }} onClick={() => putOnBattlefield(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <p class="label">{t('activatedBy')}</p>
              <div class="chips">
                {g.players.map((p) => (
                  <button
                    key={p}
                    type="button"
                    class="chip outline small"
                    style={{ '--pc': PLAYER_COLOR[p] }}
                    disabled={g.resolving !== null || !mayAct(p)}
                    onClick={() => setAbilityPick({ card: preview, kind: 'activated', controller: p })}
                  >
                    <Icon d={ACTIVATE} size={14} /> {p}
                  </button>
                ))}
              </div>
              <p class="label">{t('triggeredFor')}</p>
              <div class="chips">
                {g.players.map((p) => (
                  <button
                    key={p}
                    type="button"
                    class="chip outline small"
                    style={{ '--pc': PLAYER_COLOR[p] }}
                    onClick={() => setAbilityPick({ card: preview, kind: 'triggered', controller: p })}
                  >
                    <Icon d={TRIGGER} size={14} /> {p}
                  </button>
                ))}
              </div>
              <button type="button" class="secondary" onClick={() => setPreview(null)}>
                {t('cancel')}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ---- Scelta dell'abilità ---- */}
      {abilityPick && (
        <div class="sheet-backdrop" onClick={() => setAbilityPick(null)}>
          <section class="sheet ability-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>
              <Icon d={abilityPick.kind === 'activated' ? ACTIVATE : TRIGGER} size={18} />{' '}
              {t(abilityPick.kind as Key)} · {abilityPick.card.printedName} ({abilityPick.controller})
            </h2>
            <p class="label">{t('chooseAbility')}</p>
            <div class="ability-options">
              {abilityPick.card.text
                .split('\n')
                .filter((line) => line.trim())
                .map((line, i) => (
                  <button key={i} type="button" onClick={() => addAbility(line)}>
                    {line}
                  </button>
                ))}
              <button type="button" class="generic" onClick={() => addAbility('')}>
                {t('genericAbility')}
              </button>
            </div>
            <p class="status">{t('abilityHelp')}</p>
          </section>
        </div>
      )}
    </main>
  );
}
