import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { LANGS, setLang, useI18n, type Key } from './i18n';

/** Un passo della guida: elemento da evidenziare (selettore CSS), titolo e testo. */
export interface TourStep {
  target: string;
  title: Key;
  text: Key;
  /** passo speciale: scelta della lingua, con testi in tutte le lingue */
  lang?: boolean;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Guida al primo avvio: oscura lo schermo, evidenzia un elemento alla volta e mostra un fumetto
 * con la spiegazione. Avanti / Indietro / Salta.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  // Posizione dell'elemento evidenziato; si aggiorna se lo schermo cambia (rotazione, tastiera…)
  useEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      if (!el) return setRect(null);
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 500); // l'interfaccia può spostarsi mentre la guida è aperta
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(id);
    };
  }, [i]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 6;
  const bubbleW = Math.min(320, vw - 16);
  // Fumetto sotto l'elemento se c'è spazio, altrimenti sopra; senza elemento, al centro
  let bubble: Record<string, string>;
  if (!rect) {
    bubble = { left: `${(vw - bubbleW) / 2}px`, top: `${vh / 2 - 90}px` };
  } else {
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bubbleW / 2, vw - bubbleW - 8));
    const below = vh - (rect.top + rect.height) > 200;
    bubble = below
      ? { left: `${left}px`, top: `${rect.top + rect.height + pad + 10}px` }
      : { left: `${left}px`, bottom: `${vh - rect.top + pad + 10}px` };
  }

  const last = i === steps.length - 1;

  return createPortal(
    <div class="tour" role="dialog" aria-modal="true" aria-label={step.lang ? 'Language' : t(step.title)}>
      {rect ? (
        <div
          class="tour-spot"
          style={{
            top: `${rect.top - pad}px`,
            left: `${rect.left - pad}px`,
            width: `${rect.width + pad * 2}px`,
            height: `${rect.height + pad * 2}px`,
          }}
        />
      ) : (
        <div class="tour-dim" />
      )}
      <div class="tour-bubble" style={{ ...bubble, width: `${bubbleW}px` }}>
        <p class="tour-count">
          {i + 1} / {steps.length}
        </p>
        {step.lang ? (
          <>
            <h2>Choose your language · Scegli la lingua</h2>
            <p>You can change it later from the menu. · Potrai cambiarla dopo dal menu.</p>
            <div class="tour-langs">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  class="primary"
                  onClick={() => {
                    setLang(l.code);
                    setI(i + 1);
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>{t(step.title)}</h2>
            <p>{t(step.text)}</p>
          </>
        )}
        <div class="tour-actions">
          <button type="button" class="tour-skip" onClick={onClose}>
            {t('tourSkip')}
          </button>
          {i > 0 && (
            <button type="button" class="secondary" onClick={() => setI(i - 1)}>
              {t('tourBack')}
            </button>
          )}
          {!step.lang && (
            <button type="button" class="primary" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? t('tourDone') : t('tourNext')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
