import { useState } from 'preact/hooks';
import { LAYER_IDS, newUid, type CardObj, type Effect, type LayerId } from './game';
import { useI18n, type Key } from './i18n';
import { computeLayers, signed } from './layers';

/** Effetti continui di un permanente (spunta Layers): elenco in ordine di timestamp, tabella ordinata per layer. */
export function EffectsSheet({
  obj,
  onChange,
  onClose,
  clip,
  onCopy,
}: {
  obj: CardObj;
  /** nuovo elenco degli effetti + messaggio per lo storico */
  onChange: (effects: Effect[], msg: string) => void;
  onClose: () => void;
  /** effetto copiato (si può incollare su qualunque carta) */
  clip: Effect | null;
  onCopy: (e: Effect) => void;
}) {
  const { t } = useI18n();
  const tr = (k: Key, v: Record<string, string>) => t(k).replace(/\{(\w+)\}/g, (m, x: string) => v[x] ?? m);
  const effects = obj.effects ?? [];
  const [layer, setLayer] = useState<LayerId>('7c');
  const [text, setText] = useState('');
  const [source, setSource] = useState<'static' | 'spell'>('spell');
  const [eot, setEot] = useState(true);
  const [p, setP] = useState('');
  const [tg, setTg] = useState('');
  // L-7c: segno di forza e costituzione (+ di default)
  const [pNeg, setPNeg] = useState(false);
  const [tNeg, setTNeg] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const card = obj.card.printedName;
  const res = computeLayers(obj);

  const numeric = layer === '7a' || layer === '7b' || layer === '7c';
  const value = (e: Effect) =>
    e.layer === '7c'
      ? `${signed(e.p ?? 0)}/${signed(e.t ?? 0)}`
      : e.layer === '7a' || e.layer === '7b'
        ? `${e.p ?? '—'}/${e.t ?? '—'}`
        : '';
  const label = (e: Effect) => [e.text, value(e)].filter(Boolean).join(' ');

  function add(ev: Event) {
    ev.preventDefault();
    const n = (s: string, neg = false) => {
      if (s.trim() === '' || Number.isNaN(Number(s))) return undefined;
      const v = Math.abs(Number(s));
      return layer === '7c' && neg ? -v : layer === '7c' ? v : Number(s);
    };
    const e: Effect = {
      id: newUid(),
      layer,
      text: text.trim() || t(`layerName${layer}` as Key),
      source,
      eot: eot || undefined,
      ...(numeric ? { p: n(p, pNeg) ?? (layer === '7c' ? 0 : undefined), t: n(tg, tNeg) ?? (layer === '7c' ? 0 : undefined) } : {}),
    };
    onChange([...effects, e], tr('logEffectAdd', { card, l: `L-${layer}`, e: label(e) }));
    setText('');
    setP('');
    setTg('');
    setPNeg(false);
    setTNeg(false);
  }
  function paste() {
    if (!clip) return;
    const e: Effect = { ...clip, id: newUid() };
    onChange([...effects, e], tr('logEffectAdd', { card, l: `L-${e.layer}`, e: label(e) }));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= effects.length) return;
    const next = [...effects];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next, tr('logEffectMove', { card, e: label(effects[i]) }));
  }
  function remove(i: number) {
    onChange(
      effects.filter((_, k) => k !== i),
      tr('logEffectRemove', { card, e: label(effects[i]) }),
    );
  }

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <section class="sheet choices-sheet effects-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{tr('effectsTitle', { card })}</h2>

        {/* Risultato: righe ordinate per layer, poi timestamp */}
        <table class="ex-layers">
          <tbody>
            {res.lines.length === 0 && (
              <tr>
                <td colSpan={3} class="muted">
                  {t('effectsNone')}
                </td>
              </tr>
            )}
            {res.lines.map((l, k) => (
              <tr key={k}>
                <th scope="row">L-{l.layer}</th>
                <td>
                  {l.auto === 'faceDown'
                    ? t('effectsFaceDown')
                    : l.auto === 'counters'
                      ? `${t('effectsCounters')} ${signed(l.counters![0])}/${signed(l.counters![1])}`
                      : label(l.effect!)}
                  {l.effect && (
                    <small>
                      {' '}
                      · {t(l.effect.source === 'static' ? 'effectStatic' : 'effectSpell')}
                      {l.effect.eot ? ` · ${t('effectEot')}` : ''}
                    </small>
                  )}
                </td>
                <td class="pt">{l.pt ? `${l.pt[0]}/${l.pt[1]}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {res.pt && (
          <p class="effects-result">
            {t('effectsResult')} <b>{`${res.pt[0]}/${res.pt[1]}`}</b>
          </p>
        )}
        {res.star && <p class="muted small">{t('effectsStar')}</p>}

        {/* Elenco in ordine di timestamp */}
        {effects.length > 0 && (
          <fieldset>
            <legend>{t('effectsTimestamp')}</legend>
            <ol class="effects-list">
              {effects.map((e, i) => (
                <li key={e.id}>
                  <span class="eff-l">L-{e.layer}</span>
                  <span class="eff-text">{label(e)}</span>
                  <button type="button" aria-label={t('moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" aria-label={t('moveDown')} disabled={i === effects.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    class={copied === e.id ? 'on' : ''}
                    aria-label={t('effectCopy')}
                    title={t('effectCopy')}
                    onClick={() => {
                      onCopy(e);
                      setCopied(e.id);
                    }}
                  >
                    ⧉
                  </button>
                  <button type="button" class="del" aria-label={t('remove')} onClick={() => remove(i)}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <p class="muted small">{t('effectsDepHint')}</p>
          </fieldset>
        )}

        {/* Nuovo effetto */}
        <form class="effects-form" onSubmit={add}>
          <fieldset>
            <legend>{t('effectsAdd')}</legend>
            <label class="eff-row">
              <span>{t('effectsLayer')}</span>
              <select value={layer} onChange={(e) => setLayer((e.target as HTMLSelectElement).value as LayerId)}>
                {LAYER_IDS.map((l) => (
                  <option key={l} value={l}>
                    L-{l} · {t(`layerName${l}` as Key)}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              value={text}
              placeholder={t('effectsTextPh')}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
            />
            {numeric && (
              <div class="eff-pt">
                {(
                  [
                    [p, setP, pNeg, setPNeg, layer === '7c' ? 'effectsPlusP' : 'effectsSetP'],
                    [tg, setTg, tNeg, setTNeg, layer === '7c' ? 'effectsPlusT' : 'effectsSetT'],
                  ] as const
                ).map(([val, setVal, neg, setNeg, lbl]) => (
                  <label key={lbl}>
                    {t(lbl)}
                    <span class="eff-num">
                      {layer === '7c' && (
                        <button type="button" class="sign" aria-label={neg ? '−' : '+'} onClick={() => setNeg(!neg)}>
                          {neg ? '−' : '+'}
                        </button>
                      )}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={layer === '7c' ? 0 : undefined}
                        value={val}
                        onInput={(e) => setVal((e.target as HTMLInputElement).value)}
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div class="eff-toggles">
              {(['spell', 'static'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  class={`toggle${source === s ? ' on' : ''}`}
                  aria-pressed={source === s}
                  onClick={() => {
                    setSource(s);
                    setEot(s === 'spell');
                  }}
                >
                  {t(s === 'static' ? 'effectStatic' : 'effectSpell')}
                </button>
              ))}
              <label class="help-toggle">
                <input type="checkbox" checked={eot} onChange={(e) => setEot((e.target as HTMLInputElement).checked)} />
                {t('effectEot')}
              </label>
            </div>
            <button type="submit" class="primary">
              {t('effectsAddBtn')}
            </button>
            {clip && (
              <button type="button" class="secondary paste" onClick={paste}>
                ⧉ {t('effectPaste')}: L-{clip.layer} {label(clip)}
              </button>
            )}
          </fieldset>
        </form>
        <button type="button" class="close-btn" onClick={onClose}>
          {t('close')}
        </button>
      </section>
    </div>
  );
}
