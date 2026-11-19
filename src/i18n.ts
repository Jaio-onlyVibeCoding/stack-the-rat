import { useEffect, useState } from 'preact/hooks';

// Lingue: inglese (principale), italiano (secondaria), poi le più parlate al mondo.
export type Lang = 'en' | 'it' | 'zh' | 'hi' | 'es' | 'ar';

export interface LangInfo {
  code: Lang;
  label: string;
  /** Codice lingua usato da Scryfall per le carte stampate (null = mai stampate in questa lingua) */
  scryfall: string | null;
  rtl?: boolean;
}

export const LANGS: LangInfo[] = [
  { code: 'en', label: 'English', scryfall: 'en' },
  { code: 'it', label: 'Italiano', scryfall: 'it' },
  { code: 'zh', label: '中文', scryfall: 'zhs' },
  { code: 'hi', label: 'हिन्दी', scryfall: null },
  { code: 'es', label: 'Español', scryfall: 'es' },
  { code: 'ar', label: 'العربية', scryfall: 'ar', rtl: true },
];

const en = {
  searchLabel: 'Card name',
  searchPlaceholder: 'Search a card…',
  loading: 'Loading…',
  error: 'Scryfall is not responding. Try again.',
  noResults: 'No cards found.',
  add: 'Add to stack',
  stack: 'Stack',
  stackEmpty: 'The stack is empty.',
  top: 'Top',
  remove: 'Remove',
  language: 'Language',
  fallback: 'Not printed in your language: showing English.',
  credits:
    'Card data and images from Scryfall. Magic: The Gathering © Wizards of the Coast. Unofficial fan content, not approved by Wizards.',
};

export type Key = keyof typeof en;
type Dict = Record<Key, string>;

const it: Dict = {
  searchLabel: 'Nome della carta',
  searchPlaceholder: 'Cerca una carta…',
  loading: 'Caricamento…',
  error: 'Scryfall non risponde. Riprova.',
  noResults: 'Nessuna carta trovata.',
  add: 'Aggiungi allo stack',
  stack: 'Stack',
  stackEmpty: 'Lo stack è vuoto.',
  top: 'In cima',
  remove: 'Rimuovi',
  language: 'Lingua',
  fallback: 'Non stampata nella tua lingua: mostro la versione inglese.',
  credits:
    'Dati e immagini delle carte da Scryfall. Magic: The Gathering © Wizards of the Coast. Contenuto non ufficiale dei fan, non approvato da Wizards.',
};

const zh: Dict = {
  searchLabel: '卡牌名称',
  searchPlaceholder: '搜索卡牌…',
  loading: '加载中…',
  error: 'Scryfall 无响应，请重试。',
  noResults: '未找到卡牌。',
  add: '加入堆叠',
  stack: '堆叠',
  stackEmpty: '堆叠为空。',
  top: '顶部',
  remove: '移除',
  language: '语言',
  fallback: '没有该语言的印刷版本：显示英文版。',
  credits:
    '卡牌数据与图片来自 Scryfall。Magic: The Gathering © Wizards of the Coast。非官方粉丝内容，未经 Wizards 认可。',
};

const hi: Dict = {
  searchLabel: 'कार्ड का नाम',
  searchPlaceholder: 'कार्ड खोजें…',
  loading: 'लोड हो रहा है…',
  error: 'Scryfall जवाब नहीं दे रहा। फिर से कोशिश करें।',
  noResults: 'कोई कार्ड नहीं मिला।',
  add: 'स्टैक में जोड़ें',
  stack: 'स्टैक',
  stackEmpty: 'स्टैक खाली है।',
  top: 'सबसे ऊपर',
  remove: 'हटाएँ',
  language: 'भाषा',
  fallback: 'यह कार्ड हिन्दी में नहीं छपा: अंग्रेज़ी संस्करण दिखाया जा रहा है।',
  credits:
    'कार्ड डेटा और चित्र Scryfall से। Magic: The Gathering © Wizards of the Coast। अनौपचारिक प्रशंसक सामग्री, Wizards द्वारा अनुमोदित नहीं।',
};

const es: Dict = {
  searchLabel: 'Nombre de la carta',
  searchPlaceholder: 'Busca una carta…',
  loading: 'Cargando…',
  error: 'Scryfall no responde. Inténtalo de nuevo.',
  noResults: 'No se encontraron cartas.',
  add: 'Añadir a la pila',
  stack: 'Pila',
  stackEmpty: 'La pila está vacía.',
  top: 'Arriba',
  remove: 'Quitar',
  language: 'Idioma',
  fallback: 'No impresa en tu idioma: se muestra la versión en inglés.',
  credits:
    'Datos e imágenes de cartas de Scryfall. Magic: The Gathering © Wizards of the Coast. Contenido no oficial de fans, no aprobado por Wizards.',
};

const ar: Dict = {
  searchLabel: 'اسم البطاقة',
  searchPlaceholder: 'ابحث عن بطاقة…',
  loading: 'جارٍ التحميل…',
  error: 'Scryfall لا يستجيب. حاول مرة أخرى.',
  noResults: 'لم يتم العثور على بطاقات.',
  add: 'أضف إلى المكدس',
  stack: 'المكدس',
  stackEmpty: 'المكدس فارغ.',
  top: 'الأعلى',
  remove: 'إزالة',
  language: 'اللغة',
  fallback: 'غير مطبوعة بلغتك: يتم عرض النسخة الإنجليزية.',
  credits:
    'بيانات وصور البطاقات من Scryfall. Magic: The Gathering © Wizards of the Coast. محتوى غير رسمي من المعجبين، غير معتمد من Wizards.',
};

const DICTS: Record<Lang, Dict> = { en, it, zh, hi, es, ar };

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

function applyToDocument() {
  const root = document.documentElement;
  root.lang = current;
  root.dir = langInfo(current).rtl ? 'rtl' : 'ltr';
}
applyToDocument();

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem('lang', l);
  } catch {}
  applyToDocument();
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
