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

  const wanted = langInfo(lang).scryfall;
  const isFallback = preview && lang !== 'en' && preview.lang !== wanted;

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
          <button type="button" class="primary" onClick={addToStack}>
            {t('add')}
          </button>
        </section>
      )}

      <section class="stack">
        <h2>{t('stack')}</h2>
        {stack.length === 0 ? (
          <p class="status">{t('stackEmpty')}</p>
        ) : (
          <ol>
            {[...stack].reverse().map((e, i) => (
              <li key={e.uid} class={i === 0 ? 'item is-top' : 'item'}>
                {e.card.art && <img src={e.card.art} alt="" />}
                <div class="info">
                  {i === 0 && <span class="badge">{t('top')}</span>}
                  <strong>{e.card.printedName}</strong>
                  <span class="type">{e.card.typeLine}</span>
                </div>
                <button
                  type="button"
                  class="ghost"
                  aria-label={`${t('remove')} ${e.card.printedName}`}
                  onClick={() => setStack((s) => s.filter((x) => x.uid !== e.uid))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer class="credits">{t('credits')}</footer>
    </main>
  );
}
