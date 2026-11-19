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
import { LANGS, langInfo, setLang, useI18n, type Lang } from './i18n';
import type { Card } from './scryfall';

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

export function App() {
  const { t, lang } = useI18n();
  const [players, setPlayers] = useState<PlayerId[]>(['A', 'B']);
  const [preview, setPreview] = useState<Card | null>(null);
  const [stack, setStack] = useState<StackItem[]>([]);
  const [perms, setPerms] = useState<Permanent[]>([]);
  /** uid dell'oggetto in pila che sta scegliendo i bersagli (null = nessuno) */
  const [targeting, setTargeting] = useState<number | null>(null);
  /** Giocatore attivo (di chi è il turno) e chi ha la priorità */
  const [active, setActive] = useState<PlayerId>('A');
  const [priority, setPriority] = useState<PlayerId>('A');
  /** Giocatori che hanno passato di fila, senza azioni in mezzo (CR 117.4) */
  const [passed, setPassed] = useState<PlayerId[]>([]);
  const [graveyards, setGraveyards] = useState<Record<PlayerId, Card[]>>({ A: [], B: [], C: [], D: [] });
  /** Oggetti finiti al cimitero: chiave vecchia → cimitero del proprietario (per le frecce illegali) */
  const [gone, setGone] = useState<Record<string, PlayerId>>({});
  const [toast, setToast] = useState<string | null>(null);
  const stackCol = useRef<HTMLElement>(null);

  // Quando entra un nuovo oggetto in pila, scorri fino alla cima della pila (in basso)
  useEffect(() => {
    const el = stackCol.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [stack.length]);

  // Il messaggio sparisce da solo dopo qualche secondo
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const isFallback = preview && lang !== 'en' && preview.lang !== langInfo(lang).scryfall;
  const sourceIndex = stack.findIndex((s) => s.uid === targeting);

  // ---- Giocatori ----
  function addPlayer() {
    if (players.length < MAX_PLAYERS) setPlayers(ALL_PLAYERS.slice(0, players.length + 1));
  }
  function removePlayer() {
    if (players.length <= MIN_PLAYERS) return;
    const gone = players[players.length - 1];
    setPlayers(players.slice(0, -1));
    setPerms((p) => p.filter((x) => x.controller !== gone));
    setStack((s) => s.filter((x) => x.controller !== gone));
    setTargeting(null);
    if (active === gone || priority === gone) {
      setActive('A');
      setPriority('A');
    }
    setPassed([]);
  }

  // ---- Cimitero ----
  /** Una carta che cambia zona diventa un nuovo oggetto (CR 400.7): i bersagli che la puntavano diventano illegali. */
  function toGraveyard(card: Card, owner: PlayerId, oldKey?: string) {
    setGraveyards((g) => ({ ...g, [owner]: [...g[owner], card] }));
    if (oldKey) setGone((m) => ({ ...m, [oldKey]: owner }));
  }

  /** Un bersaglio è legale se esiste ancora (controllo semplice: le altre condizioni le valuta il giocatore). */
  function isLegal(key: string): boolean {
    const [kind, id] = key.split(':');
    if (kind === 'player') return players.includes(id as PlayerId);
    if (kind === 'perm') return perms.some((p) => p.uid === Number(id));
    if (kind === 'stack') return stack.some((x) => x.uid === Number(id));
    return false;
  }

  // ---- Priorità e risoluzione ----
  const nextPlayer = (p: PlayerId) => players[(players.indexOf(p) + 1) % players.length];

  function resolveTop() {
    const top = stack[stack.length - 1];
    if (!top) return;
    const key = objKey.stack(top.uid);
    const name = top.card.printedName;
    const legal = top.targets.filter(isLegal);
    setStack((s) => s.slice(0, -1));
    if (targeting === top.uid) setTargeting(null);

    if (top.targets.length > 0 && legal.length === 0) {
      // CR 608.2b: tutti i bersagli illegali → non si risolve, va al cimitero
      toGraveyard(top.card, top.controller, key);
      setToast(t('fizzled').replace('{card}', name));
    } else if (top.card.isPermanent) {
      // CR 608.3: una magia permanente entra sul campo del suo controllore
      setPerms((p) => [...p, { uid: newUid(), card: top.card, controller: top.controller }]);
      setToast(t('resolvedPermanent').replace('{card}', name));
    } else {
      // CR 608.2n: istantaneo o stregoneria va nel cimitero del proprietario
      toGraveyard(top.card, top.controller, key);
      setToast(t(legal.length < top.targets.length ? 'partial' : 'resolved').replace('{card}', name));
    }
  }

  /** CR 117.3d / 117.4: chi ha la priorità passa; se tutti passano di fila, risolve la cima della pila. */
  function pass() {
    const nowPassed = [...passed, priority];
    if (nowPassed.length >= players.length) {
      if (stack.length > 0) resolveTop();
      else setToast(t('emptyPass'));
      // CR 117.3b: dopo la risoluzione la priorità va al giocatore attivo
      setPassed([]);
      setPriority(active);
    } else {
      setPassed(nowPassed);
      setPriority(nextPlayer(priority));
    }
  }

  function changeActive(p: PlayerId) {
    setActive(p);
    setPriority(p);
    setPassed([]);
  }

  // ---- Carte ----
  function putOnStack(controller: PlayerId) {
    if (!preview) return;
    setStack((s) => [...s, { uid: newUid(), card: preview, controller, targets: [] }]);
    setPreview(null);
    // CR 117.3c: chi lancia una magia riceve di nuovo la priorità; i passaggi precedenti non contano più
    setPriority(controller);
    setPassed([]);
  }
  function putOnBattlefield(controller: PlayerId) {
    if (!preview) return;
    setPerms((p) => [...p, { uid: newUid(), card: preview, controller }]);
    setPreview(null);
  }
  function removeFromStack(uid: number) {
    setStack((s) => s.filter((x) => x.uid !== uid));
    if (targeting === uid) setTargeting(null);
  }

  // ---- Bersagli ----
  /** Una magia/abilità può bersagliare giocatori, permanenti e oggetti già in pila sotto di lei (CR 115.5). */
  function canTarget(key: string): boolean {
    if (targeting === null) return false;
    if (key.startsWith('stack:')) {
      const i = stack.findIndex((s) => objKey.stack(s.uid) === key);
      return i >= 0 && i < sourceIndex;
    }
    return true;
  }
  function onObjectTap(key: string) {
    if (!canTarget(key)) return;
    setStack((s) =>
      s.map((it) =>
        it.uid !== targeting
          ? it
          : {
              ...it,
              targets: it.targets.includes(key) ? it.targets.filter((k) => k !== key) : [...it.targets, key],
            },
      ),
    );
  }
  function onTargetButton(item: StackItem) {
    if (targeting === item.uid || item.targets.length > 0) {
      // Icona X: cancella tutte le frecce di questo oggetto
      setStack((s) => s.map((it) => (it.uid === item.uid ? { ...it, targets: [] } : it)));
      setTargeting(null);
    } else {
      setTargeting(item.uid);
    }
  }
  // Tocco su uno spazio vuoto: fine della scelta dei bersagli
  function onBackgroundTap(e: MouseEvent) {
    if (targeting === null) return;
    if (!(e.target as Element).closest('[data-obj], .tgt')) setTargeting(null);
  }

  const links: Link[] = stack.flatMap((it) =>
    it.targets.map((to) => {
      const illegal = !isLegal(to);
      return {
        from: objKey.stack(it.uid),
        to,
        fallback: gone[to] ? `gy:${gone[to]}` : undefined,
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

  return (
    <main class={`shell${targeting !== null ? ' targeting' : ''}`} onClick={onBackgroundTap}>
      <header class="top">
        <h1>Stack The Rat</h1>
        <div class="player-count" role="group" aria-label={t('players')}>
          <button type="button" onClick={removePlayer} disabled={players.length <= MIN_PLAYERS} aria-label={t('removePlayer')}>
            −
          </button>
          <span>
            {players.length} {t('players').toLowerCase()}
          </span>
          <button type="button" onClick={addPlayer} disabled={players.length >= MAX_PLAYERS} aria-label={t('addPlayer')}>
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

      <div class={`table ${players.length === 2 ? 'two' : 'multi'}`}>
        {players.map((id) => (
          <section key={id} class="zone" style={{ gridArea: id, '--pc': PLAYER_COLOR[id] }}>
            <div class="zone-head">
              <button type="button" {...objProps(objKey.player(id), 'player-tag')}>
                {t('player')} {id}
                {priority === id && <span class="prio-mark" title={t('priority')} />}
              </button>
              <div class="gy" data-obj={`gy:${id}`} title={t('graveyard')}>
                {graveyards[id].length > 0 && (
                  <img src={graveyards[id][graveyards[id].length - 1].image} alt="" />
                )}
                <span>
                  {t('graveyard')} {graveyards[id].length}
                </span>
              </div>
            </div>
            <div class="field">
              {perms.filter((p) => p.controller === id).length === 0 && <p class="status">{t('battlefieldEmpty')}</p>}
              {perms
                .filter((p) => p.controller === id)
                .map((p) => (
                  <div key={p.uid} {...objProps(objKey.perm(p.uid), 'perm')}>
                    {p.card.image ? <img src={p.card.image} alt={p.card.printedName} /> : <span>{p.card.printedName}</span>}
                    <button
                      type="button"
                      class="remove-sm"
                      aria-label={`${t('toGraveyard')}: ${p.card.printedName}`}
                      title={t('toGraveyard')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPerms((all) => all.filter((x) => x.uid !== p.uid));
                        toGraveyard(p.card, p.controller, objKey.perm(p.uid));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          </section>
        ))}

        <section class="stack-col" ref={stackCol}>
          <div class="priority" style={{ '--pc': PLAYER_COLOR[priority] }}>
            <label class="turn">
              {t('turn')}
              <select value={active} onChange={(e) => changeActive((e.target as HTMLSelectElement).value as PlayerId)}>
                {players.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div class="prio-row">
              <span class="prio-who">
                {t('priority')}: <b>{priority}</b>
              </span>
              <button type="button" class="pass" onClick={pass}>
                {t('pass')}
              </button>
            </div>
            <div class="passes" title={t('passHelp')}>
              {players.map((p) => (
                <span key={p} class={passed.includes(p) ? 'passed' : ''} style={{ '--pc': PLAYER_COLOR[p] }}>
                  {p}
                  {passed.includes(p) ? ' ✓' : ''}
                </span>
              ))}
            </div>
          </div>
          <h2>{t('stack')}</h2>
          {stack.length === 0 ? (
            <p class="status">{t('stackEmpty')}</p>
          ) : (
            // La carta più vecchia sta in alto e dietro; l'ultima (in cima alla pila) è intera e illuminata
            <ol class="pile">
              {stack.map((it, i) => {
                const key = objKey.stack(it.uid);
                const isTop = i === stack.length - 1;
                const isSource = targeting === it.uid;
                const showCross = isSource || it.targets.length > 0;
                return (
                  <li
                    key={it.uid}
                    {...objProps(key, `pile-card${isTop ? ' is-top' : ''}${isSource ? ' is-source' : ''}`)}
                    data-anchor="strip"
                    style={{ zIndex: i + 1, '--pc': PLAYER_COLOR[it.controller] }}
                  >
                    {it.card.image ? (
                      <img src={it.card.image} alt={it.card.printedName} />
                    ) : (
                      <div class="no-image">{it.card.printedName}</div>
                    )}
                    <span class="ctrl">{it.controller}</span>
                    {isTop && <span class="badge">{t('top')}</span>}
                    <div class="card-tools">
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
                      <button
                        type="button"
                        class="remove"
                        aria-label={`${t('remove')} ${it.card.printedName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromStack(it.uid);
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

      <Arrows links={links} />

      {toast && (
        <div class="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {preview && (
        <div class="sheet-backdrop" onClick={() => setPreview(null)}>
          <section class="sheet" onClick={(e) => e.stopPropagation()}>
            {preview.image && <img src={preview.image} alt={preview.printedName} />}
            <div class="sheet-body">
              {isFallback && <p class="status">{t('fallback')}</p>}
              <p class="label">{t('toStack')}</p>
              <div class="chips">
                {players.map((p) => (
                  <button key={p} type="button" class="chip" style={{ '--pc': PLAYER_COLOR[p] }} onClick={() => putOnStack(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <p class="label">{t('toBattlefield')}</p>
              <div class="chips">
                {players.map((p) => (
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
