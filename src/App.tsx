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
  relocate,
  type CardObj,
  type Destination,
  type Game,
  type PlayerId,
  type StackItem,
  type StackKind,
} from './game';
import { LANGS, langInfo, setLang, useI18n, type Key, type Lang } from './i18n';
import type { Card } from './scryfall';
import { decodeGame, encodeGame, sharedCodeFromUrl, shareUrl } from './share';

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

/** Una "condizione" della partita: lo stato e i messaggi che l'hanno prodotta. */
interface Snapshot {
  game: Game;
  messages: string[];
  time: string;
}

const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

const DESTINATIONS: Destination[] = ['battlefield', 'graveyard', 'exile', 'stack'];
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
  const [menu, setMenu] = useState<{ uid: number; x: number; y: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [share, setShare] = useState<{ url: string; copied: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  /** campi di battaglia chiusi */
  const [collapsed, setCollapsed] = useState<PlayerId[]>([]);
  /** scelta del testo di un'abilità prima di metterla in pila */
  const [abilityPick, setAbilityPick] = useState<{ card: Card; kind: StackKind; controller: PlayerId } | null>(null);
  const stackCol = useRef<HTMLElement>(null);

  // Apertura di un setup condiviso (#s=...)
  useEffect(() => {
    const code = sharedCodeFromUrl();
    if (!code) return;
    setNotice(t('sharedLoading'));
    decodeGame(code)
      .then((game) => {
        setTimeline([{ game, messages: [t('sharedLoaded')], time: now() }]);
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
    return t('stackZone');
  }
  const destName = (d: Destination) =>
    d === 'battlefield' ? t('battlefield') : d === 'graveyard' ? t('graveyard') : d === 'exile' ? t('exile') : t('stack');

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
  function cast(controller: PlayerId) {
    if (!preview || g.resolving !== null) return;
    // CR 117.3c: chi lancia una magia riceve di nuovo la priorità; i passaggi precedenti non contano più
    commit(
      {
        ...g,
        stack: [...g.stack, { uid: newUid(), card: preview, owner: controller, controller, targets: [], kind: 'spell' }],
        priority: controller,
        passed: [],
      },
      tr('logCast', { p: controller, card: preview.printedName }),
    );
    setPreview(null);
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
  }

  function putOnBattlefield(controller: PlayerId) {
    if (!preview) return;
    commit(
      { ...g, objs: [...g.objs, { uid: newUid(), card: preview, owner: controller, controller, zone: 'battlefield' }] },
      tr('logBattlefield', { p: controller, card: preview.printedName }),
    );
    setPreview(null);
  }
  function moveObj(o: CardObj, dest: Destination) {
    const { game, tokenGone } = relocate(g, { kind: 'obj', obj: o }, dest);
    let next = game;
    const holder = o.zone === 'battlefield' ? o.controller : o.owner;
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
      commit({ ...g, passed: [], priority: g.active }, passMsg, t('emptyPass'));
      return;
    }
    // CR 608.2b: i bersagli si ricontrollano all'inizio della risoluzione
    const name = top.card.printedName;
    const legal = top.targets.filter((k) => isLegal(g, k));
    if (top.targets.length > 0 && legal.length === 0) {
      if (top.kind !== 'spell') {
        // un'abilità che non si risolve lascia semplicemente la pila
        const rest = g.stack.filter((x) => x.uid !== top.uid);
        commit({ ...g, stack: rest, passed: [], priority: g.active }, passMsg, tr('abilityFizzled', { card: name }));
        return;
      }
      const { game } = relocate(g, { kind: 'stack', item: top }, 'graveyard');
      commit({ ...game, passed: [], priority: g.active }, passMsg, tr('fizzled', { card: name }));
      return;
    }
    const msgs = [passMsg, tr('resolvingStart', { card: name })];
    if (legal.length < top.targets.length) msgs.push(tr('partial', { card: name }));
    // Durante la risoluzione nessuno ha priorità
    commit({ ...g, passed: [], priority: null, resolving: top.uid }, ...msgs);
    setTargeting(null);
  }

  /** Fine della risoluzione: la carta va nella sua zona, poi priorità al giocatore attivo (CR 117.3b). */
  function finishResolution() {
    const it = resolvingItem;
    if (!it) return;
    if (it.kind !== 'spell') {
      // un'abilità risolta lascia la pila e cessa di esistere
      commit(
        { ...g, stack: g.stack.filter((x) => x.uid !== it.uid), resolving: null, priority: g.active, passed: [] },
        tr('abilityResolved', { card: it.card.printedName }),
      );
      return;
    }
    // CR 608.3: una magia permanente entra sul campo; CR 608.2n: istantaneo/stregoneria va al cimitero
    const dest = it.card.isPermanent ? 'battlefield' : 'graveyard';
    const { game } = relocate(g, { kind: 'stack', item: it }, dest);
    commit(
      { ...game, resolving: null, priority: g.active, passed: [] },
      tr(dest === 'battlefield' ? 'resolvedPermanent' : 'resolved', { card: it.card.printedName }),
    );
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
  }
  function onTargetButton(item: StackItem) {
    if (targeting === item.uid || item.targets.length > 0) {
      // Icona X: cancella tutte le frecce di questo oggetto
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
    if (!key.startsWith('card:')) return undefined;
    const o = g.objs.find((x) => x.uid === Number(key.slice(5)));
    if (!o) return undefined;
    return o.zone === 'graveyard' ? `gy:${o.owner}` : 'exile';
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
    onClick: () => onObjectTap(key),
  });

  // ---- Pannelli (esilio, cimiteri): non fanno parte dello storico ----
  const togglePanel = (id: string) => setPanels((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));

  function openMenu(uid: number, e: MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ uid, x: r.right, y: r.bottom });
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
    <div key={o.uid} {...objProps(objKey.of(o), cls)} style={{ '--pc': PLAYER_COLOR[o.owner] }}>
      {o.card.image ? <img src={o.card.image} alt={o.card.printedName} /> : <span class="no-img">{o.card.printedName}</span>}
      {o.token && <span class="token-tag">{t('token')}</span>}
      {cls === 'tile' && <span class="owner-tag">{o.owner}</span>}
      <button type="button" class="more" aria-label={`${t('menu')}: ${o.card.printedName}`} onClick={(e) => openMenu(o.uid, e)}>
        ⋯
      </button>
    </div>
  );

  // Storico: tutti i messaggi, il più recente in alto; quelli "futuri" (dopo pos) appaiono attenuati
  const entries = timeline.flatMap((s, i) => s.messages.map((text, j) => ({ i, j, text, time: s.time })));
  const currentMessage = timeline[pos].messages[timeline[pos].messages.length - 1] ?? '';
  // Una riga del tavolo si riduce quando tutti i suoi campi di battaglia sono chiusi
  const rows: PlayerId[][] = g.players.length === 2 ? [['A'], ['B']] : [['A', 'B'], ['C', 'D']];
  const sizes = rows
    .map((r) => {
      const present = r.filter((p) => g.players.includes(p));
      return present.length > 0 && present.every((p) => collapsed.includes(p)) ? 'auto' : 'minmax(0, 1fr)';
    })
  // se tutto è chiuso, l'ultima riga prende lo spazio restante (la pila resta alta)
  const rowSizes = sizes.every((x) => x === 'auto') ? [...sizes.slice(0, -1), 'minmax(0, 1fr)'].join(' ') : sizes.join(' ');
  const menuObj = menu ? g.objs.find((o) => o.uid === menu.uid) : undefined;

  return (
    <main class={`shell${targeting !== null ? ' targeting' : ''}`} onClick={onBackgroundTap}>
      <header class="top">
        <h1>Stack The Rat</h1>
        <div class="player-count" role="group" aria-label={t('players')}>
          <button type="button" class="share-btn" onClick={openShare} aria-label={t('share')} title={t('share')}>
            <Icon d={SHARE} size={18} />
          </button>
          <button type="button" onClick={removePlayer} disabled={g.players.length <= MIN_PLAYERS} aria-label={t('removePlayer')}>
            −
          </button>
          <span>{g.players.length}</span>
          <button type="button" onClick={addPlayer} disabled={g.players.length >= MAX_PLAYERS} aria-label={t('addPlayer')}>
            +
          </button>
        </div>
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
      </header>

      {notice && <p class="notice">{notice}</p>}

      <div class="search-row">
        {targeting !== null ? <p class="hint">{t('targetingHint')}</p> : <CardSearch onPick={setPreview} />}
        <button
          type="button"
          class={`exile-btn${panels.includes('exile') ? ' on' : ''}`}
          data-obj="exile"
          aria-pressed={panels.includes('exile')}
          aria-label={`${t('exile')}: ${exile.length}`}
          title={t('exile')}
          onClick={() => togglePanel('exile')}
        >
          <Portal />
          <span>{exile.length}</span>
        </button>
      </div>

      {panels.length > 0 && (
        <div class="panels">
          {panels.map((id) => {
            const isExile = id === 'exile';
            const owner = (isExile ? null : id.slice(3)) as PlayerId | null;
            const cards = isExile ? exile : graveyard(owner!);
            return (
              <section key={id} class="panel" style={{ '--pc': owner ? PLAYER_COLOR[owner] : '#9aa3b5' }}>
                <div class="panel-head">
                  {isExile ? <Portal size={16} /> : <span class="panel-dot" />}
                  <span class="panel-title">
                    {isExile ? t('exile') : `${t('graveyard')} · ${t('player')} ${owner}`} ({cards.length})
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

      <div class={`table ${g.players.length === 2 ? 'two' : 'multi'}`} style={{ gridTemplateRows: rowSizes }}>
        {g.players.map((id) => {
          const mine = g.objs.filter((o) => o.zone === 'battlefield' && o.controller === id);
          const gy = graveyard(id);
          const hasPrio = g.priority === id;
          const isCollapsed = collapsed.includes(id);
          return (
            <section
              key={id}
              class={`zone${hasPrio ? ' has-priority' : ''}${isCollapsed ? ' collapsed' : ''}`}
              style={{ gridArea: id, '--pc': PLAYER_COLOR[id] }}
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
                  {t('player')} {id}
                </button>
                <button
                  type="button"
                  class={`gy${panels.includes(`gy:${id}`) ? ' on' : ''}`}
                  data-obj={`gy:${id}`}
                  aria-pressed={panels.includes(`gy:${id}`)}
                  aria-label={`${tr('graveyardOf', { p: id })}: ${gy.length}`}
                  title={tr('graveyardOf', { p: id })}
                  onClick={() => togglePanel(`gy:${id}`)}
                >
                  {gy.length > 0 ? <img src={gy[gy.length - 1].card.image} alt="" /> : <span class="gy-empty" />}
                  <span class="gy-count">{gy.length}</span>
                </button>
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
              <div class="field">
                {mine.length === 0 && <p class="status">{t('battlefieldEmpty')}</p>}
                {mine.map((o) => renderTile(o, 'perm'))}
              </div>
              )}
            </section>
          );
        })}

        <section class="stack-col" ref={stackCol}>
          <div
            class={`priority${g.priority === null ? ' nobody' : ''}`}
            style={{ '--pc': g.priority ? PLAYER_COLOR[g.priority] : '' }}
          >
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
                  <span class="prio-who">
                    {t('priority')}: <b>{g.priority ?? t('nobody')}</b>
                  </span>
                  <button type="button" class="pass" onClick={pass}>
                    {t('pass')}
                  </button>
                </div>
                <div class="passes" title={t('passHelp')}>
                  {g.players.map((p) => (
                    <span key={p} class={g.passed.includes(p) ? 'passed' : ''} style={{ '--pc': PLAYER_COLOR[p] }}>
                      {p}
                      {g.passed.includes(p) ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <h2>{t('stack')}</h2>
          {g.stack.length === 0 ? (
            <p class="status">{t('stackEmpty')}</p>
          ) : (
            // La carta più vecchia sta in alto e dietro; l'ultima (in cima alla pila) è intera e illuminata
            <ol class="pile">
              {g.stack.map((it, i) => {
                const key = objKey.stack(it.uid);
                const isTop = i === g.stack.length - 1;
                const isSource = targeting === it.uid;
                const isResolving = g.resolving === it.uid;
                const showCross = isSource || it.targets.length > 0;
                return (
                  <li
                    key={it.uid}
                    {...objProps(
                      key,
                      `pile-card${isTop ? ' is-top' : ''}${isSource ? ' is-source' : ''}${isResolving ? ' is-resolving' : ''}`,
                    )}
                    data-anchor="strip"
                    style={{ zIndex: i + 1, '--pc': PLAYER_COLOR[it.controller] }}
                  >
                    {it.kind !== 'spell' ? (
                      <div class={`ability ${it.kind}`}>
                        <div class="ability-head">
                          <Icon d={it.kind === 'activated' ? ACTIVATE : TRIGGER} size={16} />
                          <span>{it.card.printedName}</span>
                        </div>
                        {it.card.art && <img class="ability-art" src={it.card.art} alt="" />}
                        <p class="ability-kind">{t(it.kind as Key)}</p>
                        <p class="ability-text">{it.text ?? '—'}</p>
                      </div>
                    ) : it.card.image ? (
                      <img src={it.card.image} alt={it.card.printedName} />
                    ) : (
                      <div class="no-image">{it.card.printedName}</div>
                    )}
                    <span class="ctrl">{it.controller}</span>
                    {isTop && <span class="badge">{isResolving ? t('resolvingTag') : t('top')}</span>}
                    <div class="card-tools">
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
            style={{
              left: `${Math.max(8, Math.min(menu.x - 220, window.innerWidth - 228))}px`,
              top: `${Math.max(8, Math.min(menu.y + 4, window.innerHeight - 300))}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p class="menu-title">
              {menuObj.card.printedName}
              {menuObj.token ? ` · ${t('token')}` : ''}
            </p>
            <p class="menu-label">{t('moveTo')}</p>
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
                → {destName(d)}
              </button>
            ))}
            <hr />
            <button
              type="button"
              role="menuitem"
              disabled={g.resolving !== null}
              onClick={() => {
                const c = menuObj.zone === 'battlefield' ? menuObj.controller : menuObj.owner;
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
          </div>
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
                    disabled={g.resolving !== null}
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
                    disabled={g.resolving !== null}
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
