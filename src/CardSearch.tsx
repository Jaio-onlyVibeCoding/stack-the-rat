import { useEffect, useRef, useState } from 'preact/hooks';
import { getCard, getTokenCard, suggest, suggestTokens, type Card, type Suggestion } from './scryfall';
import { langInfo, useI18n } from './i18n';

type Status = 'idle' | 'loading' | 'empty' | 'error';

export function CardSearch({ onPick, autoFocus = false }: { onPick: (c: Card) => void; autoFocus?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, []);
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [names, setNames] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');

  // Aspetta 300 ms dopo l'ultima lettera prima di chiedere a Scryfall
  useEffect(() => {
    const query = q.trim();
    // "t:nome" cerca le pedine
    const token = /^t:/i.test(query);
    if (token ? query.length < 3 : query.length < 2) {
      setNames([]);
      setStatus('idle');
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const res = token ? await suggestTokens(query.slice(2), ac.signal) : await suggest(query, ac.signal);
        setNames(res);
        setStatus(res.length ? 'idle' : 'empty');
      } catch {
        if (!ac.signal.aborted) setStatus('error');
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  async function pick(n: Suggestion) {
    setNames([]);
    setQ('');
    setStatus('loading');
    try {
      const l = langInfo(lang).scryfall;
      const card = n.id ? await getTokenCard(n.id, l) : await getCard(n.name, l);
      if (card) onPick(card);
      setStatus(card ? 'idle' : 'empty');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div class="search">
      <label class="sr-only" for="card-search">
        {t('searchLabel')}
      </label>
      <input
        id="card-search"
        ref={input}
        type="search"
        autocomplete="off"
        placeholder={t('searchPlaceholder')}
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      {status === 'loading' && <p class="status">{t('loading')}</p>}
      {status === 'empty' && <p class="status">{t('noResults')}</p>}
      {status === 'error' && <p class="status error">{t('error')}</p>}
      {names.length > 0 && (
        <ul class="suggestions">
          {names.map((n) => (
            <li key={n.id ?? n.name}>
              <button type="button" onClick={() => pick(n)}>
                {n.printed ?? n.name}
                {n.printed && <small>{n.name}</small>}
                {n.detail && <small>{n.detail}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
