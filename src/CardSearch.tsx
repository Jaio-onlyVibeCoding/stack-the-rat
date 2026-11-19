import { useEffect, useState } from 'preact/hooks';
import { getCard, suggest, type Card, type Suggestion } from './scryfall';
import { langInfo, useI18n } from './i18n';

type Status = 'idle' | 'loading' | 'empty' | 'error';

export function CardSearch({ onPick }: { onPick: (c: Card) => void }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [names, setNames] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');

  // Aspetta 300 ms dopo l'ultima lettera prima di chiedere a Scryfall
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setNames([]);
      setStatus('idle');
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await suggest(query, ac.signal);
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

  async function pick(name: string) {
    setNames([]);
    setQ('');
    setStatus('loading');
    try {
      const card = await getCard(name, langInfo(lang).scryfall);
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
            <li key={n.name}>
              <button type="button" onClick={() => pick(n.name)}>
                {n.printed ?? n.name}
                {n.printed && <small>{n.name}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
