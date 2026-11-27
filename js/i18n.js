// Lingua dell'interfaccia (italiano / inglese).
// I testi nel codice sono scritti in italiano e passano da t(): in inglese si cerca la
// traduzione nel dizionario (i18n-en.js), se manca resta l'italiano.
// I dati salvati (es. il nome della classe) restano sempre in italiano, così le formule
// funzionano in entrambe le lingue: si traducono solo quando si mostrano.
import { EN } from './i18n-en.js';

const KEY = 'gdr-schede/lang';
export const LANGS = { it: 'Italiano', en: 'English' };

function initialLang() {
  if (typeof localStorage === 'undefined') return 'it'; // fuori dal browser (es. test)
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in LANGS) return saved;
  } catch { /* archivio non disponibile */ }
  const nav = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
  return !nav || /^it\b/i.test(nav) ? 'it' : 'en';
}

export const lang = initialLang();
export const locale = lang === 'en' ? 'en-GB' : 'it-IT';

/** Cambia lingua e ricarica la pagina (tutti i testi si ridisegnano). */
export function setLang(next) {
  if (!(next in LANGS) || next === lang) return;
  try { localStorage.setItem(KEY, next); } catch { /* resta per questa sessione */ }
  location.reload();
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Testo dell'interfaccia: t('Aggiungi riga'), t('{n} incantesimi', { n: 3 }). */
export function t(s, vars) {
  if (s === undefined || s === null || s === '') return s ?? '';
  const str = String(s);
  return fill(lang === 'en' ? (EN[str] ?? str) : str, vars);
}

// Valori salvati che si mostrano tradotti (classi, caratteristiche…) anche dentro frasi
// composte, es. "Privilegi di classe · Mago" → "Class features · Wizard".
const VALUE_WORDS = [
  'Artefice', 'Barbaro', 'Bardo', 'Chierico', 'Druido', 'Guerriero', 'Ladro', 'Mago', 'Monaco', 'Paladino', 'Ranger', 'Stregone', 'Warlock',
  'Intelligenza', 'Saggezza', 'Carisma', 'Forza', 'Destrezza', 'Costituzione',
  '1ª classe', '2ª classe',
];
const wordRe = new RegExp(`(^|[^\\p{L}])(${VALUE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}])`, 'gu');

/** Traduce i valori noti dentro un testo già composto (solo in inglese). */
export function tValues(s) {
  if (lang !== 'en' || !s) return s;
  return String(s).replace(wordRe, (m, pre, w) => pre + (EN[w] ?? w));
}

/** Da un valore scritto nella lingua dell'interfaccia al valore salvato (es. "Wizard" → "Mago"). */
export function toStored(s) {
  if (lang !== 'en' || !s) return s;
  const low = String(s).trim().toLowerCase();
  const hit = VALUE_WORDS.find((w) => (EN[w] ?? w).toLowerCase() === low);
  return hit ?? s;
}
