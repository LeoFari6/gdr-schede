// Persistenza in localStorage + import/export JSON.
import { BUILTIN_SYSTEMS } from './systems.js';
import { uid } from './ui.js';
import { validateSystem } from './engine.js';

const KEY = 'gdr-schede/v1';
export const FORMAT = 'gdr-schede';
export const FORMAT_VERSION = 1;

const empty = () => ({ version: 1, systems: [], characters: [], settings: { theme: 'auto' } });

// Rimuove dai modelli creati con versioni precedenti tutto ciò che riguarda
// i tiri di dado digitali (non più supportati).
export function stripDice(sys) {
  if (!sys || !Array.isArray(sys.sections)) return sys;
  for (const s of sys.sections) {
    s.fields = (s.fields || []).filter((f) => f.type !== 'roll');
    for (const f of s.fields) {
      delete f.roll; delete f.target; delete f.targetMode; delete f.rowRoll;
      for (const c of f.columns || []) if (c.type === 'dice') c.type = 'text';
    }
  }
  return sys;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) {
      (s.systems || []).forEach(stripDice);
      return { ...empty(), ...s };
    }
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
    listeners.forEach((fn) => fn({ type: 'error', error: 'Impossibile salvare: spazio di archiviazione esaurito o non disponibile. Esporta un backup.' }));
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

  // ---- modelli -------------------------------------------------------
  systems() { return [...BUILTIN_SYSTEMS, ...state.systems]; },
  system(id) { return this.systems().find((s) => s.id === id) || null; },
  isBuiltin(id) { return BUILTIN_SYSTEMS.some((s) => s.id === id); },

  saveSystem(sys) {
    if (this.isBuiltin(sys.id)) throw new Error('I modelli inclusi non si possono modificare: duplicali.');
    const copy = clone(sys);
    delete copy.builtin;
    copy.updatedAt = now();
    const i = state.systems.findIndex((s) => s.id === copy.id);
    if (i >= 0) state.systems[i] = copy; else state.systems.push(copy);
    persist();
    return copy;
  },

  duplicateSystem(id, name) {
    const src = this.system(id);
    if (!src) return null;
    const copy = clone(src);
    copy.id = `m_${uid()}`;
    copy.name = name || `${src.name} (copia)`;
    copy.basedOn = src.id;
    delete copy.builtin;
    return this.saveSystem(copy);
  },

  newSystem(name) {
    return this.saveSystem({
      id: `m_${uid()}`, name, description: '', version: 1,
      sections: [{ id: uid(), title: 'Personaggio', columns: 3, fields: [
        { key: 'giocatore', label: 'Giocatore', type: 'text' },
      ] }],
    });
  },

  deleteSystem(id) {
    if (this.isBuiltin(id)) return false;
    state.systems = state.systems.filter((s) => s.id !== id);
    persist();
    return true;
  },

  charactersUsing(systemId) { return state.characters.filter((c) => c.systemId === systemId); },

  // ---- personaggi ----------------------------------------------------
  characters() { return [...state.characters].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
  character(id) { return state.characters.find((c) => c.id === id) || null; },

  createCharacter(systemId, name) {
    const c = { id: `p_${uid()}`, name: name || 'Nuovo personaggio', systemId, values: {}, createdAt: now(), updatedAt: now() };
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
    const c = { ...clone(src), id: `p_${uid()}`, name: `${src.name} (copia)`, createdAt: now(), updatedAt: now() };
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
    return { format: FORMAT, formatVersion: FORMAT_VERSION, type: 'character', exportedAt: new Date().toISOString(), character: clone(c), system: clone(this.system(c.systemId)) };
  },
  exportSystem(id) {
    return { format: FORMAT, formatVersion: FORMAT_VERSION, type: 'system', exportedAt: new Date().toISOString(), system: clone(this.system(id)) };
  },
  exportAll() {
    return { format: FORMAT, formatVersion: FORMAT_VERSION, type: 'backup', exportedAt: new Date().toISOString(), systems: clone(state.systems), characters: clone(state.characters), settings: clone(state.settings) };
  },

  // ---- import --------------------------------------------------------
  /** Importa un file esportato. Restituisce un riepilogo testuale. */
  importData(data) {
    if (!data || typeof data !== 'object') throw new Error('File non valido');
    // Accetta anche un modello "nudo" (oggetto con sections)
    if (!data.format && Array.isArray(data.sections)) data = { format: FORMAT, type: 'system', system: data };
    if (data.format !== FORMAT) throw new Error('Questo file non è stato esportato da Schede GdR');
    // Per ora non si importano modelli da soli: solo personaggi (con il loro modello) e backup.
    if (data.type === 'system') throw new Error('importare modelli non è disponibile per ora. Puoi importare personaggi e backup.');

    const report = { systems: 0, characters: 0, warnings: [] };
    const idMap = new Map();

    const importSystem = (sys) => {
      if (!sys) return null;
      const problems = validateSystem(sys);
      if (problems.length) report.warnings.push(`Modello "${sys.name}": ${problems.length} problemi (${problems[0]})`);
      const existing = this.system(sys.id);
      if (existing && JSON.stringify(stripMeta(existing)) === JSON.stringify(stripMeta(sys))) {
        idMap.set(sys.id, sys.id);
        return existing.id;
      }
      if (existing && this.isBuiltin(sys.id) && sys.builtin) {
        // stesso modello incluso, versione diversa: usa quello locale
        idMap.set(sys.id, sys.id);
        return sys.id;
      }
      const copy = stripDice(clone(sys));
      delete copy.builtin;
      if (existing) {
        copy.id = `m_${uid()}`;
        copy.name = `${sys.name} (importato)`;
      }
      if (!copy.id) copy.id = `m_${uid()}`;
      this.saveSystem(copy);
      idMap.set(sys.id, copy.id);
      report.systems++;
      return copy.id;
    };

    const importCharacter = (ch, fallbackSystemId) => {
      const c = clone(ch);
      c.systemId = idMap.get(c.systemId) || fallbackSystemId || c.systemId;
      if (!this.system(c.systemId)) report.warnings.push(`"${c.name}": modello mancante (${c.systemId})`);
      if (!c.id || this.character(c.id)) c.id = `p_${uid()}`;
      c.values = c.values || {};
      c.updatedAt = now();
      state.characters.push(c);
      report.characters++;
    };

    if (data.type === 'system') importSystem(data.system);
    else if (data.type === 'character') {
      const sid = importSystem(data.system);
      importCharacter(data.character, sid);
    } else if (data.type === 'backup') {
      (data.systems || []).forEach(importSystem);
      (data.characters || []).forEach((c) => importCharacter(c));
    } else throw new Error(`Tipo di file sconosciuto: ${data.type}`);

    persist();
    return report;
  },

  _reset() { state = empty(); persist(); flush(); },
};

function stripMeta(sys) {
  const { updatedAt, builtin, basedOn, ...rest } = sys;
  return rest;
}
