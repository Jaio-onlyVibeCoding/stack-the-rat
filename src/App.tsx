import { useState } from 'preact/hooks';
import { CardSearch } from './CardSearch';
import { LANGS, langInfo, setLang, useI18n, type Lang } from './i18n';
import type { Card } from './scryfall';

interface StackEntry {
  uid: number;
  card: Card;
}

let uid = 0;

export function App() {
  const { t, lang } = useI18n();
  const [preview, setPreview] = useState<Card | null>(null);
  const [stack, setStack] = useState<StackEntry[]>([]);

  const isFallback = preview && lang !== 'en' && preview.lang !== langInfo(lang).scryfall;

  function addToStack() {
    if (!preview) return;
    setStack((s) => [...s, { uid: ++uid, card: preview }]);
    setPreview(null);
  }

  return (
    <main class="shell">
      <header class="top">
        <h1>Stack The Rat</h1>
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

      <CardSearch onPick={setPreview} />

      {preview && (
        <section class="preview">
          {preview.image && <img src={preview.image} alt={preview.printedName} />}
          {isFallback && <p class="status">{t('fallback')}</p>}
          <div class="actions">
            <button type="button" class="secondary" onClick={() => setPreview(null)}>
              {t('cancel')}
            </button>
            <button type="button" class="primary" onClick={addToStack}>
              {t('add')}
            </button>
          </div>
        </section>
      )}

      <section class="stack">
        <h2>{t('stack')}</h2>
        {stack.length === 0 ? (
          <p class="status">{t('stackEmpty')}</p>
        ) : (
          // Ordine visivo: la carta più vecchia sta in alto e dietro; ogni nuova carta
          // si sovrappone sotto. L'ultima (in cima allo stack) è intera e illuminata.
          <ol class="pile">
            {stack.map((e, i) => {
              const isTop = i === stack.length - 1;
              return (
                <li
                  key={e.uid}
                  class={isTop ? 'pile-card is-top' : 'pile-card'}
                  style={{ zIndex: i + 1 }}
                  aria-current={isTop ? 'true' : undefined}
                >
                  {e.card.image ? (
                    <img src={e.card.image} alt={e.card.printedName} />
                  ) : (
                    <div class="no-image">{e.card.printedName}</div>
                  )}
                  {isTop && <span class="badge">{t('top')}</span>}
                  <button
                    type="button"
                    class="remove"
                    aria-label={`${t('remove')} ${e.card.printedName}`}
                    onClick={() => setStack((s) => s.filter((x) => x.uid !== e.uid))}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <footer class="credits">{t('credits')}</footer>
    </main>
  );
}
