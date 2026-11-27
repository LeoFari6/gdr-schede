// Persistenza in localStorage + import/export JSON.
import { BUILTIN_SYSTEMS } from './systems.js';
import { uid } from './ui.js';
import { t } from './i18n.js';

const KEY = 'gdr-schede/v1';
export const FORMAT = 'gdr-schede';
export const FORMAT_VERSION = 1;

const empty = () => ({ version: 1, characters: [], settings: { theme: 'auto' } });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return { ...empty(), ...s };
  } catch { /* storage non disponibile o dati corrotti */ }
  return empty();
}

let state = load();
let timer = null;
const listeners = new Set();

function flush() {
  if (!timer) return; // niente da salvare
  clearTimeout(timer);
  timer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    listeners.forEach((fn) => fn({ type: 'error', error: t('Impossibile salvare: spazio di archiviazione esaurito o non disponibile. Esporta un backup.') }));
  }
}
function persist() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
// Modifiche fatte in un'altra scheda del browser: ricarica lo stato.
addEventListener('storage', (e) => {
  if (e.key !== KEY || timer) return;
  state = load();
  listeners.forEach((fn) => fn({ type: 'external' }));
});

const now = () => Date.now();
const clone = (o) => structuredClone(o);

export const store = {
  onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  flush,

  // ---- schede ---------------------------------------------------------
  // Si usano solo le schede incluse nell'app (D&D 5e e Generico): niente modelli personalizzati.
  systems() { return [...BUILTIN_SYSTEMS]; },
  system(id) { return BUILTIN_SYSTEMS.find((s) => s.id === id) || null; },

  // ---- personaggi ----------------------------------------------------
  characters() { return [...state.characters].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
  character(id) { return state.characters.find((c) => c.id === id) || null; },

  createCharacter(systemId, name) {
    const c = { id: `p_${uid()}`, name: name || t('Nuovo personaggio'), systemId, values: {}, createdAt: now(), updatedAt: now() };
    state.characters.push(c);
    persist();
    return c;
  },

  updateCharacter(id, patch) {
    const c = this.character(id);
    if (!c) return null;
    Object.assign(c, patch, { updatedAt: now() });
    persist();
    return c;
  },

  setValue(id, key, value) {
    const c = this.character(id);
    if (!c) return;
    if (value === undefined) delete c.values[key]; else c.values[key] = value;
    c.updatedAt = now();
    persist();
  },

  duplicateCharacter(id) {
    const src = this.character(id);
    if (!src) return null;
    const c = { ...clone(src), id: `p_${uid()}`, name: `${src.name} (${t('copia')})`, createdAt: now(), updatedAt: now() };
    state.characters.push(c);
    persist();
    return c;
  },

  deleteCharacter(id) {
    state.characters = state.characters.filter((c) => c.id !== id);
    persist();
  },

  // ---- impostazioni --------------------------------------------------
  setting(k) { return state.settings?.[k]; },
  setSetting(k, v) { state.settings = { ...state.settings, [k]: v }; persist(); },

  // ---- export --------------------------------------------------------
  exportCharacter(id) {
    const c = this.character(id);
    return { format: FORMAT, formatVersion: FORMAT_VERSION, type: 'character', exportedAt: new Date().toISOString(), character: clone(c) };
  },
  exportAll() {
    return { format: FORMAT, formatVersion: FORMAT_VERSION, type: 'backup', exportedAt: new Date().toISOString(), characters: clone(state.characters), settings: clone(state.settings) };
  },

  // ---- import --------------------------------------------------------
  /** Importa un personaggio o un backup. Eventuali modelli contenuti nei file vengono ignorati. */
  importData(data) {
    if (!data || typeof data !== 'object') throw new Error(t('File non valido'));
    if (data.format !== FORMAT) throw new Error(t('Questo file non è stato esportato da Schede GdR'));
    if (data.type === 'system') throw new Error(t('Questo file contiene un modello di scheda: si possono importare solo personaggi e backup.'));

    const report = { characters: 0, warnings: [] };
    const importCharacter = (ch) => {
      const c = clone(ch);
      if (!this.system(c.systemId)) report.warnings.push(t('"{nome}": usa un modello di scheda non disponibile ({id})', { nome: c.name, id: c.systemId }));
      if (!c.id || this.character(c.id)) c.id = `p_${uid()}`;
      c.values = c.values || {};
      c.updatedAt = now();
      state.characters.push(c);
      report.characters++;
    };

    if (data.type === 'character') importCharacter(data.character);
    else if (data.type === 'backup') (data.characters || []).forEach(importCharacter);
    else throw new Error(t('Tipo di file sconosciuto: {tipo}', { tipo: data.type }));

    persist();
    return report;
  },

  _reset() { state = empty(); persist(); flush(); },
};
