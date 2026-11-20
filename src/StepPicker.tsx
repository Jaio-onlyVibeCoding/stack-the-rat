import { useState } from 'preact/hooks';

/**
 * Scelta della sottofase: elenco con le fasi in grassetto e le sottofasi rientrate.
 * Le fasi principali non hanno sottofasi: sono voci in grassetto selezionabili.
 */
export function StepPicker({
  step,
  groups,
  stepName,
  phaseName,
  disabled,
  warnStep,
  onPick,
  shortName,
}: {
  step: number;
  groups: number[][];
  stepName: (i: number) => string;
  phaseName: (i: number) => string;
  disabled: boolean;
  /** sottofase da segnalare con ⚠ (es. danno da combattimento con attacco improvviso) */
  warnStep: number | null;
  onPick: (i: number) => void;
  /** se presente, nome breve da mostrare sul pulsante (telefono) */
  shortName?: (i: number) => string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const single = groups.some((g) => g.length === 1 && g[0] === step);

  function toggle(e: MouseEvent) {
    if (pos) return setPos(null);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const width = Math.max(240, r.width);
    const below = window.innerHeight - r.bottom - 12;
    // se sotto c'è poco spazio (telefono in orizzontale) il menu usa tutta l'altezza dello schermo
    const top = below >= 240 ? r.bottom + 4 : 8;
    setPos({
      top,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.min(420, window.innerHeight - top - 8),
    });
  }
  const pick = (i: number) => {
    setPos(null);
    if (i !== step) onPick(i);
  };

  return (
    <div class="step-picker">
      <button type="button" class="step-current" disabled={disabled} aria-expanded={!!pos} onClick={toggle}>
        {shortName ? (
          <b>{shortName(step)}</b>
        ) : (
          <>
            <b>{single ? stepName(step) : phaseName(step)}</b>
            {!single && <span>{stepName(step)}</span>}
          </>
        )}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" class="icon">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {pos && (
        <div class="step-menu-backdrop" onClick={() => setPos(null)}>
          <ul
            class="step-menu"
            role="listbox"
            style={{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            {groups.map((grp) =>
              grp.length === 1 ? (
                <li key={grp[0]}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={grp[0] === step}
                    class={`phase${grp[0] === step ? ' on' : ''}`}
                    onClick={() => pick(grp[0])}
                  >
                    {stepName(grp[0])}
                  </button>
                </li>
              ) : (
                <li key={grp[0]}>
                  <span class="phase">{phaseName(grp[0])}</span>
                  <ul>
                    {grp.map((i) => (
                      <li key={i}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === step}
                          class={i === step ? 'on' : ''}
                          onClick={() => pick(i)}
                        >
                          {i === warnStep ? '⚠ ' : ''}
                          {stepName(i)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
