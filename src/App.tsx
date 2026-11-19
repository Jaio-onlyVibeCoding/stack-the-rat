import { useEffect, useRef, useState } from 'preact/hooks';
import { Arrows, type Link } from './Arrows';
import { CardSearch } from './CardSearch';
import {
  ALL_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOR,
  newUid,
  objKey,
  type Permanent,
  type PlayerId,
  type StackItem,
} from './game';
import { LANGS, langInfo, setLang, useI18n, type Key, type Lang } from './i18n';
import type { Card } from './scryfall';

// ---------- Icone ----------
const Crosshair = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" class="icon">
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
  </svg>
);
const Cross = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" class="icon">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);
const Tomb = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="icon">
    <path d="M6 21V10a6 6 0 0 1 12 0v11zM4 21h16M12 9v6M9.5 11.5h5" />
  </svg>
);
const Portal = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="icon">
    <ellipse cx="12" cy="12" rx="5" ry="9" />
    <path d="M3 12h9M9 9l3 3-3 3" />
  </svg>
);
const UndoIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" class="icon">
    <path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" />
  </svg>
);
const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" class="icon">
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);

// ---------- Stato della partita ----------
interface Exiled {
  uid: number;
  card: Card;
  owner: PlayerId;
}

/** Tutto ciò che "Annulla" può riportare indietro. */
interface Game {
  players: PlayerId[];
  /** giocatore attivo (di chi è il turno) */
  active: PlayerId;
  /** chi ha la priorità; null = nessuno (durante la risoluzione) */
  priority: PlayerId | null;
  /** giocatori che hanno passato di fila (CR 117.4) */
  passed: PlayerId[];
  stack: StackItem[];
  perms: Permanent[];
  graveyards: Record<PlayerId, Card[]>;
  exile: Exiled[];
  /** oggetti che hanno cambiato zona: chiave vecchia → dove sono finiti (gy:X o exile) */
  gone: Record<string, string>;
  /** oggetto in risoluzione */
  resolving: number | null;
}

const initialGame = (): Game => ({
  players: ['A', 'B'],
  active: 'A',
  priority: 'A',
  passed: [],
  stack: [],
  perms: [],
  graveyards: { A: [], B: [], C: [], D: [] },
  exile: [],
  gone: {},
  resolving: null,
});

interface LogEntry {
  id: number;
  text: string;
  time: string;
}

/** Un bersaglio è legale se esiste ancora (le altre condizioni le valuta il giocatore). */
function isLegal(g: Game, key: string): boolean {
  const [kind, id] = key.split(':');
  if (kind === 'player') return g.players.includes(id as PlayerId);
  if (kind === 'perm') return g.perms.some((p) => p.uid === Number(id));
  if (kind === 'stack') return g.stack.some((x) => x.uid === Number(id));
  return false;
}

/** Una carta che cambia zona diventa un nuovo oggetto (CR 400.7): i bersagli che la puntavano diventano illegali. */
function moveTo(g: Game, card: Card, owner: PlayerId, oldKey: string | null, zone: 'gy' | 'exile'): Game {
  const gone = oldKey ? { ...g.gone, [oldKey]: zone === 'gy' ? `gy:${owner}` : 'exile' } : g.gone;
  if (zone === 'gy') return { ...g, gone, graveyards: { ...g.graveyards, [owner]: [...g.graveyards[owner], card] } };
  return { ...g, gone, exile: [...g.exile, { uid: newUid(), card, owner }] };
}

const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

export function App() {
  const { t, lang } = useI18n();
  const [game, setGame] = useState<Game>(initialGame);
  const [past, setPast] = useState<Game[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [preview, setPreview] = useState<Card | null>(null);
  /** uid dell'oggetto in pila che sta scegliendo i bersagli (null = nessuno) */
  const [targeting, setTargeting] = useState<number | null>(null);
  const [exileOpen, setExileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const stackCol = useRef<HTMLElement>(null);

  const g = game;
  const tr = (k: Key, vars: Record<string, string> = {}) => fill(t(k), vars);

  // Quando entra un nuovo oggetto in pila, scorri fino alla cima della pila (in basso)
  useEffect(() => {
    const el = stackCol.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [g.stack.length]);

  // Breve evidenziazione della barra storico a ogni nuovo messaggio
  useEffect(() => {
    if (!log.length) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(id);
  }, [log.length]);

  function addLog(...texts: string[]) {
    const time = new Date().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    setLog((l) => [...l, ...texts.map((text) => ({ id: newUid(), text, time }))]);
  }

  /** Applica una nuova versione della partita, ricordando la precedente per "Annulla". */
  function commit(next: Game, ...messages: string[]) {
    setPast((p) => [...p.slice(-99), g]);
    setGame(next);
    if (messages.length) addLog(...messages);
  }

  function undo() {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setGame(prev);
    setTargeting(null);
    addLog(t('undone'));
  }

  const isFallback = preview && lang !== 'en' && preview.lang !== langInfo(lang).scryfall;
  const sourceIndex = g.stack.findIndex((s) => s.uid === targeting);
  const resolvingItem = g.stack.find((s) => s.uid === g.resolving) ?? null;
  const nextPlayer = (p: PlayerId) => g.players[(g.players.indexOf(p) + 1) % g.players.length];

  // ---- Giocatori ----
  function addPlayer() {
    if (g.players.length >= MAX_PLAYERS) return;
    const p = ALL_PLAYERS[g.players.length];
    commit({ ...g, players: [...g.players, p], passed: [] }, tr('logAddPlayer', { p }));
  }
  function removePlayer() {
    if (g.players.length <= MIN_PLAYERS) return;
    const gone = g.players[g.players.length - 1];
    const keepFirst = g.active === gone || g.priority === gone;
    commit(
      {
        ...g,
        players: g.players.slice(0, -1),
        perms: g.perms.filter((x) => x.controller !== gone),
        stack: g.stack.filter((x) => x.controller !== gone),
        passed: [],
        active: keepFirst ? 'A' : g.active,
        priority: g.resolving !== null ? null : keepFirst ? 'A' : g.priority,
      },
      tr('logRemovePlayer', { p: gone }),
    );
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
        stack: [...g.stack, { uid: newUid(), card: preview, controller, targets: [] }],
        priority: controller,
        passed: [],
      },
      tr('logCast', { p: controller, card: preview.printedName }),
    );
    setPreview(null);
  }
  function putOnBattlefield(controller: PlayerId) {
    if (!preview) return;
    commit(
      { ...g, perms: [...g.perms, { uid: newUid(), card: preview, controller }] },
      tr('logBattlefield', { p: controller, card: preview.printedName }),
    );
    setPreview(null);
  }
  function permanentTo(p: Permanent, zone: 'gy' | 'exile') {
    const base = { ...g, perms: g.perms.filter((x) => x.uid !== p.uid) };
    commit(
      moveTo(base, p.card, p.controller, objKey.perm(p.uid), zone),
      tr(zone === 'gy' ? 'logGraveyard' : 'logExile', { p: p.controller, card: p.card.printedName }),
    );
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
      const base = { ...g, stack: g.stack.slice(0, -1), passed: [], priority: g.active };
      commit(moveTo(base, top.card, top.controller, objKey.stack(top.uid), 'gy'), passMsg, tr('fizzled', { card: name }));
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
    const base: Game = {
      ...g,
      stack: g.stack.filter((x) => x.uid !== it.uid),
      resolving: null,
      priority: g.active,
      passed: [],
    };
    const name = it.card.printedName;
    if (it.card.isPermanent) {
      // CR 608.3: una magia permanente entra sul campo del suo controllore
      commit(
        { ...base, perms: [...base.perms, { uid: newUid(), card: it.card, controller: it.controller }] },
        tr('resolvedPermanent', { card: name }),
      );
    } else {
      // CR 608.2n: istantaneo o stregoneria va nel cimitero
      commit(moveTo(base, it.card, it.controller, objKey.stack(it.uid), 'gy'), tr('resolved', { card: name }));
    }
  }

  // ---- Bersagli ----
  /** Una magia/abilità può bersagliare giocatori, permanenti e oggetti già in pila sotto di lei (CR 115.5). */
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
    commit({
      ...g,
      stack: g.stack.map((it) =>
        it.uid !== targeting
          ? it
          : { ...it, targets: it.targets.includes(key) ? it.targets.filter((k) => k !== key) : [...it.targets, key] },
      ),
    });
  }
  function onTargetButton(item: StackItem) {
    if (targeting === item.uid || item.targets.length > 0) {
      // Icona X: cancella tutte le frecce di questo oggetto
      if (item.targets.length) {
        commit({ ...g, stack: g.stack.map((it) => (it.uid === item.uid ? { ...it, targets: [] } : it)) });
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

  const links: Link[] = g.stack.flatMap((it) =>
    it.targets.map((to) => {
      const illegal = !isLegal(g, to);
      return {
        from: objKey.stack(it.uid),
        to,
        fallback: g.gone[to],
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

  const lastMessage = log[log.length - 1];

  return (
    <main class={`shell${targeting !== null ? ' targeting' : ''}`} onClick={onBackgroundTap}>
      <header class="top">
        <h1>Stack The Rat</h1>
        <div class="player-count" role="group" aria-label={t('players')}>
          <button type="button" onClick={removePlayer} disabled={g.players.length <= MIN_PLAYERS} aria-label={t('removePlayer')}>
            −
          </button>
          <span>
            {g.players.length} {t('players').toLowerCase()}
          </span>
          <button type="button" onClick={addPlayer} disabled={g.players.length >= MAX_PLAYERS} aria-label={t('addPlayer')}>
            +
          </button>
        </div>
        <label class="lang">
          <span class="sr-only">{t('language')}</span>
          <select value={lang} onChange={(e) => setLang((e.target as HTMLSelectElement).value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {targeting !== null ? <p class="hint">{t('targetingHint')}</p> : <CardSearch onPick={setPreview} />}

      {/* ---- Esilio: zona comune, ogni carta col colore del proprietario ---- */}
      <section class={`bar exile-bar${exileOpen ? ' open' : ''}`}>
        <button type="button" class="bar-head" data-obj="exile" aria-expanded={exileOpen} onClick={() => setExileOpen(!exileOpen)}>
          <Portal />
          <span class="bar-title">
            {t('exile')} · {g.exile.length}
          </span>
          <span class="dots">
            {g.exile.slice(-12).map((e) => (
              <i key={e.uid} style={{ background: PLAYER_COLOR[e.owner] }} />
            ))}
          </span>
          <Chevron up={exileOpen} />
        </button>
        {exileOpen && (
          <div class="exile-list">
            {g.exile.length === 0 && <p class="status">{t('exileEmpty')}</p>}
            {g.exile.map((e) => (
              <figure key={e.uid} class="exiled" style={{ '--pc': PLAYER_COLOR[e.owner] }}>
                {e.card.image ? <img src={e.card.image} alt={e.card.printedName} /> : <span>{e.card.printedName}</span>}
                <figcaption>{e.owner}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <div class={`table ${g.players.length === 2 ? 'two' : 'multi'}`}>
        {g.players.map((id) => {
          const mine = g.perms.filter((p) => p.controller === id);
          const hasPrio = g.priority === id;
          return (
            <section
              key={id}
              class={`zone${hasPrio ? ' has-priority' : ''}`}
              style={{ gridArea: id, '--pc': PLAYER_COLOR[id] }}
            >
              <div class="zone-head">
                <button type="button" {...objProps(objKey.player(id), 'player-tag')}>
                  {t('player')} {id}
                </button>
                <div
                  class="gy"
                  data-obj={`gy:${id}`}
                  title={t('graveyard')}
                  aria-label={`${t('graveyard')}: ${g.graveyards[id].length}`}
                >
                  {g.graveyards[id].length > 0 ? (
                    <img src={g.graveyards[id][g.graveyards[id].length - 1].image} alt="" />
                  ) : (
                    <span class="gy-empty" />
                  )}
                  <span class="gy-count">{g.graveyards[id].length}</span>
                </div>
              </div>
              {hasPrio && (
                <div class="prio-strip">
                  <span class="prio-arrow" aria-hidden="true">
                    ▶
                  </span>
                  {t('hasPriority')}
                </div>
              )}
              <div class="field">
                {mine.length === 0 && <p class="status">{t('battlefieldEmpty')}</p>}
                {mine.map((p) => (
                  <div key={p.uid} {...objProps(objKey.perm(p.uid), 'perm')}>
                    {p.card.image ? <img src={p.card.image} alt={p.card.printedName} /> : <span>{p.card.printedName}</span>}
                    <div class="perm-tools">
                      <button
                        type="button"
                        title={t('toGraveyard')}
                        aria-label={`${t('toGraveyard')}: ${p.card.printedName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          permanentTo(p, 'gy');
                        }}
                      >
                        <Tomb />
                      </button>
                      <button
                        type="button"
                        title={t('toExile')}
                        aria-label={`${t('toExile')}: ${p.card.printedName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          permanentTo(p, 'exile');
                        }}
                      >
                        <Portal />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <section class="stack-col" ref={stackCol}>
          <div class={`priority${g.priority === null ? ' nobody' : ''}`} style={{ '--pc': g.priority ? PLAYER_COLOR[g.priority] : '' }}>
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
                    {it.card.image ? (
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
                          {showCross ? <Cross /> : <Crosshair />}
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

      {/* ---- Storico + Annulla ---- */}
      <section class={`bar history-bar${historyOpen ? ' open' : ''}${flash ? ' flash' : ''}`}>
        {historyOpen && (
          <ol class="log">
            {log.length === 0 && <li class="status">{t('noHistory')}</li>}
            {[...log].reverse().map((e) => (
              <li key={e.id}>
                <time>{e.time}</time> {e.text}
              </li>
            ))}
          </ol>
        )}
        <div class="bar-row">
          <button type="button" class="undo" onClick={undo} disabled={past.length === 0} aria-label={t('undo')} title={t('undo')}>
            <UndoIcon />
          </button>
          <button type="button" class="bar-head" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
            <span class="bar-title">
              {t('history')} · {log.length}
            </span>
            <span class="last">{lastMessage?.text ?? ''}</span>
            <Chevron up={!historyOpen} />
          </button>
        </div>
      </section>

      <Arrows links={links} />

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
                  <button
                    key={p}
                    type="button"
                    class="chip outline"
                    style={{ '--pc': PLAYER_COLOR[p] }}
                    onClick={() => putOnBattlefield(p)}
                  >
                    {p}
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
    </main>
  );
}
