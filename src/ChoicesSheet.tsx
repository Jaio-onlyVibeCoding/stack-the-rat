import { useState } from 'preact/hooks';
import {
  ALTERNATIVE_COSTS,
  canChooseFace,
  chosenFace,
  costKeywords,
  hasX,
  parseModes,
  type Choices,
} from './choices';
import type { StackItem } from './game';
import { useI18n } from './i18n';

/** Scheda delle scelte di un oggetto in pila (CR 601.2b–d): faccia, X, modalità, costi, altro. */
export function ChoicesSheet({
  item,
  onSave,
  onClose,
}: {
  item: StackItem;
  onSave: (ch: Choices) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [ch, setCh] = useState<Choices>(item.choices ?? {});
  const card = item.card;
  const isSpell = item.kind === 'spell';

  const faceSelectable = isSpell && !item.copy && canChooseFace(card);
  const face = isSpell ? chosenFace(card, ch, item.copy) : null;
  const showX = isSpell ? hasX(card, face) : !!item.text?.includes('X');
  const modes = isSpell ? parseModes(card, face) : null;
  const maxModes = modes ? (ch.extras?.includes('Entwine') ? modes.options.length : modes.max) : 0;
  const costs = isSpell && !item.copy ? costKeywords(card) : { additional: [], alternative: [] };
  const nothing = !faceSelectable && !showX && !modes && !costs.additional.length && !costs.alternative.length;

  function toggleMode(i: number) {
    const sel = ch.modes ?? [];
    if (sel.includes(i)) setCh({ ...ch, modes: sel.filter((m) => m !== i) });
    else if (maxModes === 1) setCh({ ...ch, modes: [i] });
    else if (sel.length < maxModes) setCh({ ...ch, modes: [...sel, i].sort((a, b) => a - b) });
  }
  function toggleExtra(k: string) {
    const ex = ch.extras ?? [];
    if (ex.includes(k)) return setCh({ ...ch, extras: ex.filter((e) => e !== k) });
    // un solo costo alternativo alla volta (CR 118.9a)
    const base = ALTERNATIVE_COSTS.includes(k) ? ex.filter((e) => !ALTERNATIVE_COSTS.includes(e)) : ex;
    setCh({ ...ch, extras: [...base, k] });
  }
  function save() {
    const out: Choices = {};
    if (faceSelectable && ch.face !== undefined) out.face = ch.face;
    if (showX && ch.x !== undefined) out.x = ch.x;
    if (modes && ch.modes?.length) out.modes = ch.modes.filter((m) => m < modes.options.length);
    if (ch.extras?.length) out.extras = ch.extras;
    if (ch.note?.trim()) out.note = ch.note.trim();
    onSave(out);
  }

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <section class="sheet choices-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('choicesTitle').replace('{card}', card.printedName)}</h2>

        {faceSelectable && (
          <fieldset>
            <legend>{t('chooseFace')}</legend>
            {card.faces.map((f, i) => (
              <label key={i} class="option">
                <input
                  type="radio"
                  name="face"
                  checked={(ch.face ?? 0) === i}
                  onChange={() => setCh({ ...ch, face: i, modes: [] })}
                />
                <span>
                  <b>{f.printedName}</b> <span class="cost">{f.manaCost}</span>
                  <small>{f.typeLine}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {showX && (
          <fieldset>
            <legend>{t('xValue')}</legend>
            <div class="stepper">
              <button type="button" onClick={() => setCh({ ...ch, x: Math.max(0, (ch.x ?? 0) - 1) })} aria-label="−1">
                −
              </button>
              <input
                type="number"
                min={0}
                value={ch.x ?? 0}
                onInput={(e) => setCh({ ...ch, x: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })}
              />
              <button type="button" onClick={() => setCh({ ...ch, x: (ch.x ?? 0) + 1 })} aria-label="+1">
                +
              </button>
            </div>
          </fieldset>
        )}

        {modes && (
          <fieldset>
            <legend>{t('modesTitle').replace('{n}', String(maxModes))}</legend>
            {modes.options.map((m, i) => (
              <label key={i} class="option">
                <input type="checkbox" checked={!!ch.modes?.includes(i)} onChange={() => toggleMode(i)} />
                <span>
                  <b>{i + 1}.</b> {m}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {costs.additional.length > 0 && (
          <fieldset>
            <legend>{t('additionalCosts')}</legend>
            <div class="toggles">
              {costs.additional.map((k) => (
                <button key={k} type="button" class={ch.extras?.includes(k) ? 'on' : ''} onClick={() => toggleExtra(k)}>
                  {k}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {costs.alternative.length > 0 && (
          <fieldset>
            <legend>{t('alternativeCost')}</legend>
            <div class="toggles">
              {costs.alternative.map((k) => (
                <button key={k} type="button" class={ch.extras?.includes(k) ? 'on' : ''} onClick={() => toggleExtra(k)}>
                  {k}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {nothing && <p class="status">{t('noChoices')}</p>}

        <fieldset>
          <legend>{t('otherChoices')}</legend>
          <input
            type="text"
            value={ch.note ?? ''}
            placeholder={t('otherPlaceholder')}
            onInput={(e) => setCh({ ...ch, note: (e.target as HTMLInputElement).value })}
          />
        </fieldset>

        <div class="actions">
          <button type="button" class="primary" onClick={save}>
            {t('save')}
          </button>
          <button type="button" class="secondary" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </section>
    </div>
  );
}
