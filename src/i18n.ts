import { useEffect, useState } from 'preact/hooks';

// Lingue dell'interfaccia e delle carte: inglese (principale) e italiano.
// La ricerca invece accetta nomi di carte in qualsiasi lingua (vedi scryfall.ts).
export type Lang = 'en' | 'it';

export interface LangInfo {
  code: Lang;
  label: string;
  /** Codice lingua delle stampe su Scryfall */
  scryfall: string;
}

export const LANGS: LangInfo[] = [
  { code: 'en', label: 'English', scryfall: 'en' },
  { code: 'it', label: 'Italiano', scryfall: 'it' },
];

const en = {
  searchLabel: 'Card name',
  searchPlaceholder: 'Search a card, in any language…',
  loading: 'Loading…',
  error: 'Scryfall is not responding. Try again.',
  noResults: 'No cards found.',
  add: 'Add to stack',
  cancel: 'Cancel',
  stack: 'Stack',
  stackEmpty: 'The stack is empty.',
  top: 'Top of the stack',
  remove: 'Remove',
  language: 'Language',
  fallback: 'Not printed in Italian: showing English.',
  credits:
    'Card data and images from Scryfall. Magic: The Gathering © Wizards of the Coast. Unofficial fan content, not approved by Wizards.',
};

export type Key = keyof typeof en;
type Dict = Record<Key, string>;

const it: Dict = {
  searchLabel: 'Nome della carta',
  searchPlaceholder: 'Cerca una carta, in qualsiasi lingua…',
  loading: 'Caricamento…',
  error: 'Scryfall non risponde. Riprova.',
  noResults: 'Nessuna carta trovata.',
  add: 'Aggiungi allo stack',
  cancel: 'Annulla',
  stack: 'Stack',
  stackEmpty: 'Lo stack è vuoto.',
  top: 'In cima allo stack',
  remove: 'Rimuovi',
  language: 'Lingua',
  fallback: 'Non stampata in italiano: mostro la versione inglese.',
  credits:
    'Dati e immagini delle carte da Scryfall. Magic: The Gathering © Wizards of the Coast. Contenuto non ufficiale dei fan, non approvato da Wizards.',
};

const DICTS: Record<Lang, Dict> = { en, it };

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (isLang(saved)) return saved;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export const langInfo = (l: Lang): LangInfo => LANGS.find((x) => x.code === l)!;

document.documentElement.lang = current;

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem('lang', l);
  } catch {}
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Hook: restituisce la lingua attuale e la funzione di traduzione t(). */
export function useI18n() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return { lang: current, t: (k: Key) => DICTS[current][k] };
}
