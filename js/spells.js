// Elenco di incantesimi importato da un file CSV.
// Resta salvato solo su questo dispositivo (a parte rispetto ai personaggi):
// l'app non contiene testi dei manuali, li porta l'utente con il proprio file.

import { t } from './i18n.js';

const KEY = 'gdr-schede/incantesimi';

// Nomi di colonna accettati (inglese o italiano, maiuscole indifferenti).
const COLUMNS = {
  name: ['name', 'nome', 'spell'],
  level: ['level', 'livello', 'lvl'],
  school: ['school', 'scuola'],
  castTime: ['cast_time', 'casting_time', 'casting time', 'tempo', 'tempo di lancio', 'tempo_di_lancio'],
  range: ['range', 'gittata'],
  duration: ['duration', 'durata'],
  components: ['components', 'componenti'],
  verbal: ['verbal', 'v'],
  somatic: ['somatic', 's'],
  material: ['material', 'm'],
  materialCost: ['material_cost', 'materials', 'materiali', 'material cost'],
  description: ['description', 'descrizione', 'desc', 'text'],
  classes: ['classes', 'classi', 'class'],
};

// Scuole di magia: dall'inglese ai nomi della scheda italiana.
export const SCHOOL_IT = {
  abjuration: 'Abiurazione', conjuration: 'Evocazione', divination: 'Divinazione', enchantment: 'Ammaliamento',
  evocation: 'Invocazione', illusion: 'Illusione', necromancy: 'Necromanzia', transmutation: 'Trasmutazione',
};

export const SCHOOLS_IT = Object.values(SCHOOL_IT);

// Classi della scheda e i loro nomi nei file in inglese.
const CLASS_EN = {
  artefice: 'artificer', bardo: 'bard', chierico: 'cleric', druido: 'druid', guerriero: 'fighter', ladro: 'rogue',
  mago: 'wizard', monaco: 'monk', paladino: 'paladin', ranger: 'ranger', stregone: 'sorcerer', warlock: 'warlock', barbaro: 'barbarian',
};

/** Legge un CSV (virgolette, virgole e a capo dentro i campi, BOM iniziale). Restituisce righe di celle. */
export function parseCSV(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const sep = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const yes = (v) => /^(1|true|yes|si|sì|x)$/i.test(String(v ?? '').trim());

/** Trasforma il CSV in un elenco di incantesimi. Lancia un errore se manca la colonna del nome. */
export function spellsFromCSV(text) {
  const [header, ...rows] = parseCSV(text);
  if (!header) throw new Error(t('il file è vuoto'));
  const norm = header.map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, norm.findIndex((h) => names.includes(h))]));
  if (idx.name < 0) throw new Error(t('manca la colonna con il nome (name o nome)'));
  const get = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  const out = [];
  for (const r of rows) {
    const name = get(r, 'name');
    if (!name) continue;
    let components = get(r, 'components');
    if (!components && (idx.verbal >= 0 || idx.somatic >= 0 || idx.material >= 0)) {
      const parts = [];
      if (yes(get(r, 'verbal'))) parts.push('V');
      if (yes(get(r, 'somatic'))) parts.push('S');
      if (yes(get(r, 'material'))) parts.push(get(r, 'materialCost') ? `M (${get(r, 'materialCost')})` : 'M');
      components = parts.join(', ');
    }
    const school = get(r, 'school');
    const level = parseInt(get(r, 'level').replace(/\D/g, '') || '0', 10);
    out.push({
      name,
      level: Number.isFinite(level) ? Math.min(9, Math.max(0, level)) : 0,
      school: SCHOOL_IT[school.toLowerCase()] || school,
      castTime: get(r, 'castTime'),
      range: get(r, 'range'),
      duration: get(r, 'duration'),
      components,
      description: get(r, 'description'),
      classes: get(r, 'classes').toLowerCase().split(/[,;/]/).map((x) => x.trim()).filter(Boolean),
    });
  }
  if (!out.length) throw new Error(t('nessun incantesimo trovato nel file'));
  return out;
}

// ---- salvataggio locale ----------------------------------------------------
let cache;

export function loadSpells() {
  if (cache !== undefined) return cache;
  try { cache = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null'); } catch { cache = null; }
  return cache;
}

export function saveSpells(list) {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error(t('spazio di archiviazione del browser esaurito'));
  }
  cache = list;
}

export function clearSpells() {
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* niente da fare */ }
  cache = null;
}

/**
 * Cerca per nome: prima i nomi che iniziano con il testo, poi quelli che lo
 * contengono; a parità, prima quelli delle classi indicate (nomi italiani).
 */
export function searchSpells(list, query, classes = [], limit = 8) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!list?.length || q.length < 2) return [];
  // accetta classi scritte in italiano o in inglese, sia nella scheda sia nell'elenco
  const wanted = classes.flatMap((c) => { const k = String(c).trim().toLowerCase(); return k ? [k, CLASS_EN[k]].filter(Boolean) : []; });
  const scored = [];
  for (const sp of list) {
    const n = sp.name.toLowerCase();
    const pos = n.indexOf(q);
    if (pos < 0) continue;
    const words = n.split(/[\s/'-]+/);
    let score = pos === 0 ? 0 : words.some((w) => w.startsWith(q)) ? 1 : 2;
    if (wanted.length && !sp.classes?.some((c) => wanted.includes(c))) score += 3;
    scored.push([score, sp.name.length, sp]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].name.localeCompare(b[2].name));
  return scored.slice(0, limit).map((x) => x[2]);
}

/** Un incantesimo vuoto, da compilare a mano. */
export const blankSpell = () => ({ name: '', level: 1, school: '', castTime: '', range: '', duration: '', components: '', description: '', classes: [] });

/** Aggiunge all'elenco solo gli incantesimi che non ci sono già (stesso nome, maiuscole indifferenti). */
export function mergeSpells(list, incoming) {
  const have = new Set((list || []).map((s) => s.name.trim().toLowerCase()));
  const added = incoming.filter((s) => !have.has(s.name.trim().toLowerCase()));
  return { list: [...(list || []), ...added], added: added.length };
}

/** Elenco ordinato per livello e poi per nome. */
export const sortSpells = (list) => [...list].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'it'));

/** Esporta in CSV (si può reimportare: stesse colonne lette da spellsFromCSV). */
export function spellsToCSV(list) {
  const cols = ['name', 'level', 'school', 'cast_time', 'range', 'duration', 'components', 'classes', 'description'];
  const cell = (v) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = list.map((s) => [s.name, s.level, s.school, s.castTime, s.range, s.duration, s.components, (s.classes || []).join(', '), s.description].map(cell).join(','));
  return [cols.join(','), ...rows].join('\n') + '\n';
}
