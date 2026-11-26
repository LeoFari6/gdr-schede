// Motore della scheda: dato un modello (system) e i valori di un personaggio,
// calcola i valori derivati e risolve i riferimenti @campo.
import { compile, evaluate, toNum, isTruthy, FormulaError, syntaxError } from './formula.js';

export const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const FIELD_TYPES = {
  text: { label: 'Testo' },
  textarea: { label: 'Testo lungo' },
  richtext: { label: 'Testo formattato (grassetto, elenchi)' },
  number: { label: 'Numero' },
  stat: { label: 'Caratteristica (valore + modificatore)' },
  computed: { label: 'Calcolato (formula)' },
  skill: { label: 'Abilità / competenza' },
  resource: { label: 'Risorsa (attuale / massimo)' },
  dots: { label: 'Pallini / caselle' },
  checkbox: { label: 'Casella' },
  select: { label: 'Scelta da elenco' },
  list: { label: 'Lista (tabella)' },
  features: { label: 'Privilegi (voci richiudibili con usi)' },
  image: { label: 'Immagine' },
};

export const COLUMN_TYPES = {
  text: 'Testo',
  number: 'Numero',
  checkbox: 'Casella',
  computed: 'Calcolato',
  select: 'Scelta da elenco',
  notes: 'Note (finestra a comparsa)',
};

export const allFields = (system) => (system?.sections || []).flatMap((s) => s.fields || []);

export function defaultValue(f) {
  if (f.default !== undefined && f.default !== null && f.default !== '') {
    return typeof f.default === 'object' ? structuredClone(f.default) : f.default;
  }
  switch (f.type) {
    case 'number': case 'stat': case 'dots': case 'skill': return 0;
    case 'checkbox': return false;
    case 'list': case 'features': return [];
    case 'resource': return null; // null = pari al massimo
    case 'select': return f.options?.[0] ?? '';
    default: return '';
  }
}

export class Engine {
  constructor(system, values = {}) {
    this.system = system;
    this.values = values;
    this.fields = new Map();
    for (const f of allFields(system)) if (f.key) this.fields.set(f.key, f);
    this.cache = new Map();
    this.stack = new Set();
  }

  raw(f) {
    const v = this.values[f.key];
    return v === undefined ? defaultValue(f) : v;
  }

  memo(id, fn) {
    if (this.cache.has(id)) return this.cache.get(id);
    if (this.stack.has(id)) throw new FormulaError(`Riferimento circolare su @${id}`);
    this.stack.add(id);
    try {
      const v = fn();
      this.cache.set(id, v);
      return v;
    } finally {
      this.stack.delete(id);
    }
  }

  /** Crea una funzione di risoluzione dei nomi per un certo contesto. */
  resolver(scope = {}) {
    return (name) => this.resolve(name, scope);
  }

  resolve(name, scope = {}) {
    // @this: dentro la formula "propria" di un campo è il valore grezzo;
    // altrove (tiri, testo secondario di campi derivati) è un alias del campo.
    if (scope.self && (name === 'this' || name.startsWith('this_') || name.startsWith('this.'))) {
      if (name === 'this' && scope.own) return this.rawNumberish(scope.self);
      name = scope.self.key + name.slice(4);
    }
    if (name.startsWith('row.')) {
      if (!scope.row) throw new FormulaError('@row si usa solo dentro le liste');
      return this.rowValue(scope.list, scope.row, name.slice(4));
    }
    const dot = name.indexOf('.');
    if (dot > 0) {
      const base = name.slice(0, dot);
      const col = name.slice(dot + 1);
      const f = this.fields.get(base);
      if (!f || f.type !== 'list') throw new FormulaError(`@${base} non è una lista`);
      return (this.raw(f) || []).map((r) => this.rowValue(f, r, col));
    }
    let f = this.fields.get(name);
    if (f) return this.value(f);
    const m = /^(.*)_(mod|max|level)$/.exec(name);
    if (m && (f = this.fields.get(m[1]))) {
      if (m[2] === 'mod' && f.type === 'stat') return this.mod(f);
      if (m[2] === 'max' && (f.type === 'resource' || f.type === 'dots')) return this.max(f);
      if (m[2] === 'level' && f.type === 'skill') return toNum(this.raw(f));
    }
    throw new FormulaError(`Campo @${name} inesistente`);
  }

  rawNumberish(f) {
    const v = this.raw(f);
    if (f.type === 'checkbox') return v ? 1 : 0;
    if (f.type === 'resource') return this.value(f);
    if (['number', 'stat', 'dots', 'skill'].includes(f.type)) return toNum(v);
    return v;
  }

  ownFormula(src, f) {
    return evaluate(compile(src), { resolve: this.resolver({ self: f, own: true }) });
  }

  /** Valore inserito a mano al posto di quello calcolato (undefined = si usa il calcolo). */
  manual(key) {
    const m = this.values?._manuale;
    return m && Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined;
  }

  value(f) {
    switch (f.type) {
      case 'computed': { const m = this.manual(f.key); return m !== undefined ? m : this.memo(f.key, () => this.ownFormula(f.formula || '0', f)); }
      case 'skill': { const m = this.manual(f.key); return m !== undefined ? m : this.memo(f.key, () => this.ownFormula(f.formula || '@this', f)); }
      case 'resource': {
        const v = this.raw(f);
        return v === null || v === '' || v === undefined ? this.max(f) : toNum(v);
      }
      case 'list': case 'features': return (this.raw(f) || []).length;
      case 'number': case 'stat': case 'dots': return toNum(this.raw(f));
      case 'checkbox': return this.raw(f) ? 1 : 0;
      case 'image': return 0;
      default: return this.raw(f) ?? '';
    }
  }

  mod(f) {
    const m = this.manual(`${f.key}_mod`);
    if (m !== undefined) return m;
    return this.memo(`${f.key}_mod`, () => this.ownFormula(f.mod || '0', f));
  }

  max(f) {
    // pallini: il massimo può essere un numero o una formula (es. gli slot in base alla classe)
    if (f.type === 'dots') {
      const src = String(f.max ?? 5).trim();
      if (/^\d+$/.test(src)) return Number(src);
      return this.memo(`${f.key}_max`, () => Math.max(0, Math.floor(toNum(this.ownFormula(src, f)))));
    }
    return this.memo(`${f.key}_max`, () => this.ownFormula(String(f.max ?? '10'), f));
  }

  rowValue(list, row, col) {
    const c = (list.columns || []).find((x) => x.key === col);
    if (!c) throw new FormulaError(`Colonna "${col}" inesistente in @${list.key}`);
    const v = row?.[col];
    switch (c.type) {
      case 'computed':
        return evaluate(compile(c.formula || '0'), { resolve: this.resolver({ self: list, row, list }) });
      case 'number': return toNum(v);
      case 'checkbox': return v ? 1 : 0;
      default: return v ?? '';
    }
  }

  /** Versione "sicura" per l'interfaccia: non lancia mai. */
  safe(fn) {
    try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; }
  }

  /** Valuta una condizione di visibilità (showIf). Vuota = sempre visibile. */
  visible(cond) {
    if (cond === undefined || cond === null || cond === '') return true;
    const r = this.safe(() => isTruthy(evaluate(compile(String(cond)), { resolve: this.resolver() })));
    return r.ok ? r.value : true;
  }
}

/** Il peso/ingombro è attivo per questo personaggio? */
export const weightEnabled = (options) => !!options?.weight;

/** Il modello contiene campi o colonne legati al peso? */
export const hasWeight = (system) => allFields(system).some((f) => f.weight || (f.columns || []).some((c) => c.weight));

/** Controlla un modello e restituisce l'elenco dei problemi trovati. */
export function validateSystem(system) {
  const problems = [];
  const add = (msg, where) => problems.push(where ? `${where}: ${msg}` : msg);
  if (!system || typeof system !== 'object') return ['Il modello non è un oggetto valido'];
  if (!system.name) add('Il modello non ha un nome');
  if (!Array.isArray(system.sections)) return [...problems, 'Manca l\'elenco "sections"'];
  const seen = new Map();
  const formulas = [];
  for (const [si, s] of system.sections.entries()) {
    if (s.showIf) formulas.push([String(s.showIf), `${s.title || `Sezione ${si + 1}`} (visibile se)`]);
    for (const m of String(s.title || '').matchAll(/\{([^{}]+)\}/g)) formulas.push([m[1], `${s.title} (titolo)`]);
    if (!Array.isArray(s.fields)) { add('la sezione non ha "fields"', s.title || `Sezione ${si + 1}`); continue; }
    for (const f of s.fields) {
      const where = `${s.title || 'Sezione'} › ${f.label || f.key || '(senza nome)'}`;
      if (!FIELD_TYPES[f.type]) add(`tipo "${f.type}" sconosciuto`, where);
      if (!f.key) { add('manca la chiave', where); continue; }
      if (!KEY_RE.test(f.key)) add(`chiave "${f.key}" non valida (lettere, numeri, _; non iniziare con un numero)`, where);
      if (f.key === 'this' || f.key === 'row') add(`la chiave "${f.key}" è riservata`, where);
      if (seen.has(f.key)) add(`chiave "${f.key}" duplicata (già usata in ${seen.get(f.key)})`, where);
      seen.set(f.key, where);
      for (const prop of ['formula', 'mod', 'max', 'showIf']) {
        if (f[prop] !== undefined && f[prop] !== '') formulas.push([String(f[prop]), `${where} (${prop})`]);
      }
      if (f.type === 'list') {
        const cols = new Set();
        if (f.groupBy && !(f.columns || []).some((c) => c.key === f.groupBy)) add(`raggruppa per "${f.groupBy}": colonna inesistente`, where);
        for (const g of f.groups || []) if (g && !Array.isArray(g) && g.showIf) formulas.push([String(g.showIf), `${where} › gruppo ${g.label} (visibile se)`]);
        for (const c of f.columns || []) {
          if (!c.key || !KEY_RE.test(c.key)) add(`colonna con chiave non valida "${c.key ?? ''}"`, where);
          if (cols.has(c.key)) add(`colonna "${c.key}" duplicata`, where);
          cols.add(c.key);
          if (c.type === 'computed') formulas.push([c.formula || '0', `${where} › ${c.label || c.key}`]);
        }
      }
    }
  }
  for (const [src, where] of formulas) {
    const err = syntaxError(src);
    if (err) add(err, where);
  }
  for (const [kind, rules] of Object.entries(system.rests || {})) {
    for (const r of rules || []) {
      const err = r.if ? syntaxError(String(r.if)) : null;
      if (err) add(err, `Riposo ${kind} (condizione)`);
      for (const k of r.reset || []) if (!seen.has(k)) add(`il riposo ${kind} azzera "${k}", che non esiste`);
      for (const x of r.restore || []) {
        if (!seen.has(x.key)) add(`il riposo ${kind} recupera "${x.key}", che non esiste`);
        const e2 = syntaxError(String(x.amount ?? ''));
        if (e2) add(e2, `Riposo ${kind} (quanto recuperare)`);
      }
    }
  }
  // Prova a calcolare tutto con valori di default per scovare riferimenti errati.
  if (problems.length === 0) {
    const engine = new Engine(system, {});
    for (const f of allFields(system)) {
      const where = f.label || f.key;
      const r = engine.safe(() => {
        engine.value(f);
        if (f.type === 'stat') engine.mod(f);
        if (f.type === 'resource' || f.type === 'dots') engine.max(f);
        if (f.type === 'list') {
          const fakeRow = Object.fromEntries((f.columns || []).map((c) => [c.key, c.type === 'number' ? 0 : '']));
          for (const c of f.columns || []) if (c.type === 'computed') engine.rowValue(f, fakeRow, c.key);
        }
        if (f.showIf) evaluate(compile(String(f.showIf)), { resolve: engine.resolver() });
      });
      if (!r.ok) add(r.error, where);
    }
    for (const [kind, rules] of Object.entries(system.rests || {})) {
      for (const r of rules || []) {
        if (!r.if) continue;
        const res = engine.safe(() => evaluate(compile(String(r.if)), { resolve: engine.resolver() }));
        if (!res.ok) add(res.error, `Riposo ${kind} (condizione)`);
      }
    }
    for (const s of system.sections) {
      if (!s.showIf) continue;
      const r = engine.safe(() => evaluate(compile(String(s.showIf)), { resolve: engine.resolver() }));
      if (!r.ok) add(r.error, `${s.title || 'Sezione'} (visibile se)`);
    }
  }
  return problems;
}

// ---- privilegi ---------------------------------------------------------------
export const RECHARGE = ['', 'Riposo breve', 'Riposo lungo', 'Alba', 'Altro'];
export const MAX_USES = 99;

/** Contatore dentro un privilegio (es. Punti Stregoneria): max è un numero o una formula. */
export function normalizeCounter(r = {}) {
  return {
    nome: String(r.nome ?? ''),
    max: r.max === undefined || r.max === null ? '' : String(r.max),
    usati: Math.max(0, Math.floor(toNum(r.usati))),
    ricarica: RECHARGE.includes(r.ricarica) ? r.ricarica : '',
    nota: String(r.nota ?? ''),
  };
}

/**
 * Porta una voce di privilegio alla forma attuale:
 * { nome, testo, usi, usati, ricarica, aperto, contatori: [...], figli: [...] }.
 * Accetta anche le righe delle vecchie liste ({ nome, note, usi: "2/riposo lungo" }).
 * I sotto-privilegi senza stato salvato partono aperti.
 */
export function normalizeFeature(r = {}, depth = 0) {
  const out = {
    nome: String(r.nome ?? ''),
    testo: String(r.testo ?? r.note ?? ''),
    usi: 0,
    usati: toNum(r.usati),
    ricarica: RECHARGE.includes(r.ricarica) ? r.ricarica : '',
    aperto: r.aperto === undefined ? depth === 1 : !!r.aperto,
    contatori: Array.isArray(r.contatori) ? r.contatori.map(normalizeCounter) : [],
    figli: depth === 0 && Array.isArray(r.figli) ? r.figli.map((c) => normalizeFeature(c, 1)) : [],
  };
  if (typeof r.usi === 'number') out.usi = r.usi;
  else if (r.usi) {
    const text = String(r.usi);
    const n = parseInt(text.match(/\d+/)?.[0] ?? '', 10);
    out.usi = Number.isFinite(n) ? n : 0;
    if (!out.ricarica) out.ricarica = /breve/i.test(text) ? 'Riposo breve' : /lungo/i.test(text) ? 'Riposo lungo' : '';
    if (!out.usi) out.testo = [out.testo, `Usi: ${text}`].filter(Boolean).join('\n');
  }
  out.usi = Math.max(0, Math.min(MAX_USES, Math.floor(toNum(out.usi))));
  out.usati = Math.max(0, Math.min(out.usi, Math.floor(out.usati)));
  return out;
}

/** Massimo di un contatore: numero o formula (es. @livello). */
export function counterMax(engine, c) {
  const src = String(c.max ?? '').trim();
  if (src === '') return { ok: true, value: 0 };
  if (/^\d+$/.test(src)) return { ok: true, value: Number(src) };
  const r = engine.safe(() => toNum(evaluate(compile(src), { resolve: engine.resolver() })));
  return r.ok ? { ok: true, value: Math.max(0, Math.floor(r.value)) } : r;
}

/** Recupera usi e contatori dei privilegi con una delle ricariche indicate. Restituisce le chiavi modificate. */
export function resetFeatureUses(system, values, recharges) {
  const changed = {};
  for (const f of allFields(system)) {
    if (f.type !== 'features' || !Array.isArray(values[f.key])) continue;
    let touched = false;
    const reset = (it) => {
      const n = normalizeFeature(it);
      const next = { ...it };
      if (Array.isArray(it.figli)) next.figli = it.figli.map(reset);
      if (recharges.includes(n.ricarica) && n.usati) { next.usati = 0; touched = true; }
      if (Array.isArray(it.contatori)) {
        next.contatori = it.contatori.map((c) => {
          const nc = normalizeCounter(c);
          if (recharges.includes(nc.ricarica) && nc.usati) { touched = true; return { ...c, usati: 0 }; }
          return c;
        });
      }
      return next;
    };
    const next = values[f.key].map(reset);
    if (touched) changed[f.key] = next;
  }
  return changed;
}

/**
 * Applica un riposo ("breve" o "lungo"):
 *  - le regole del modello (system.rests[kind]): ogni regola, se la sua
 *    condizione "if" è vera, riporta al valore iniziale i campi in "reset"
 *    (es. gli slot del Warlock con il riposo breve, i PF con il lungo);
 *  - gli usi e i contatori dei privilegi con la ricarica corrispondente.
 * Restituisce { changes: { chiave: valore | undefined }, labels: [cosa è stato recuperato] }.
 * undefined = torna al valore iniziale.
 */
export function applyRest(system, values, kind) {
  const engine = new Engine(system, values);
  const changes = {};
  const labels = [];
  for (const rule of system.rests?.[kind] || []) {
    if (rule.if && !engine.visible(rule.if)) continue;
    const touched = (rule.reset || []).filter((k) => values[k] !== undefined && engine.fields.has(k));
    touched.forEach((k) => { changes[k] = undefined; });
    // restore: recupera solo una parte di una risorsa (es. metà dei dadi vita)
    for (const { key, amount } of rule.restore || []) {
      const f = engine.fields.get(key);
      if (!f || f.type !== 'resource' || values[key] === undefined || values[key] === null || values[key] === '') continue;
      const r = engine.safe(() => {
        const max = toNum(engine.max(f));
        const next = Math.min(max, toNum(engine.value(f)) + Math.max(0, toNum(evaluate(compile(String(amount)), { resolve: engine.resolver() }))));
        return next >= max ? undefined : next; // undefined = pieno
      });
      if (r.ok && r.value !== toNum(values[key])) { changes[key] = r.value; touched.push(key); }
    }
    if (touched.length && rule.label && !labels.includes(rule.label)) labels.push(rule.label);
  }
  const recharges = kind === 'lungo' ? ['Riposo breve', 'Riposo lungo'] : ['Riposo breve'];
  const feats = resetFeatureUses(system, values, recharges);
  if (Object.keys(feats).length) { Object.assign(changes, feats); labels.push('usi dei privilegi'); }
  return { changes, labels };
}
