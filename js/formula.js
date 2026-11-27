// Motore di formule.
// Nessun uso di eval(): le espressioni vengono tokenizzate, trasformate in un
// albero sintattico (AST) e valutate. Sintassi supportata:
//   numeri         3, 2.5
//   stringhe       "Mago", 'pesante'
//   riferimenti    @forza, @pf_max, @inventario.peso, @row.valore, @this
//   operatori      + - * / % ^   == != < > <= >=   && || !
//   funzioni       floor ceil round abs min max clamp sum count avg if concat pick

import { t } from './i18n.js';

export class FormulaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormulaError';
  }
}

const NUM_RE = /^\d+(?:\.\d+)?/;
const REF_RE = /^@([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)/;
const ID_RE = /^[a-zA-Z_]\w*/;
const STR_RE = /^"([^"]*)"|^'([^']*)'/;
const OPS2 = ['<=', '>=', '==', '!=', '&&', '||'];
const OPS1 = ['+', '-', '*', '/', '%', '^', '(', ')', ',', '<', '>', '!'];

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const s = String(src ?? '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = s.slice(i);
    let m;
    if ((m = REF_RE.exec(rest))) {
      tokens.push({ t: 'ref', v: m[1] });
      i += m[0].length;
      continue;
    }
    if ((m = NUM_RE.exec(rest))) {
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ((m = STR_RE.exec(rest))) {
      tokens.push({ t: 'str', v: m[1] ?? m[2] });
      i += m[0].length;
      continue;
    }
    if ((m = ID_RE.exec(rest))) {
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (OPS2.includes(two)) {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (OPS1.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    throw new FormulaError(t('Carattere non valido "{c}"', { c }));
  }
  return tokens;
}

export function parse(src) {
  const tokens = tokenize(src);
  if (tokens.length === 0) return { k: 'num', v: 0 };
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (...vs) => peek()?.t === 'op' && vs.includes(peek().v);
  const expect = (v) => {
    if (!isOp(v)) throw new FormulaError(t('Manca "{v}"', { v }));
    pos++;
  };

  const binaryLevel = (ops, nextLevel) => () => {
    let left = nextLevel();
    while (isOp(...ops)) {
      const op = tokens[pos++].v;
      left = { k: 'bin', op, l: left, r: nextLevel() };
    }
    return left;
  };

  const parsePrimary = () => {
    const tk = tokens[pos++];
    if (!tk) throw new FormulaError(t('Espressione incompleta'));
    switch (tk.t) {
      case 'num': return { k: 'num', v: tk.v };
      case 'str': return { k: 'str', v: tk.v };
      case 'ref': return { k: 'ref', name: tk.v };
      case 'id': {
        const name = tk.v.toLowerCase();
        if (name === 'true') return { k: 'num', v: 1 };
        if (name === 'false') return { k: 'num', v: 0 };
        if (!isOp('(')) {
          throw new FormulaError(t('Nome sconosciuto "{v}" (i riferimenti ai campi iniziano con @)', { v: tk.v }));
        }
        if (!(name in FUNCTIONS)) throw new FormulaError(t('Funzione sconosciuta "{v}"', { v: tk.v }));
        pos++;
        const args = [];
        if (!isOp(')')) {
          args.push(parseOr());
          while (isOp(',')) { pos++; args.push(parseOr()); }
        }
        expect(')');
        return { k: 'call', name, args };
      }
      case 'op':
        if (tk.v === '(') {
          const e = parseOr();
          expect(')');
          return e;
        }
    }
    throw new FormulaError(t('Simbolo inatteso "{v}"', { v: tk.v }));
  };

  const parsePow = () => {
    const base = parsePrimary();
    if (isOp('^')) {
      pos++;
      return { k: 'bin', op: '^', l: base, r: parseUnary() };
    }
    return base;
  };
  const parseUnary = () => {
    if (isOp('-', '+', '!')) {
      const op = tokens[pos++].v;
      return { k: 'un', op, e: parseUnary() };
    }
    return parsePow();
  };
  const parseMul = binaryLevel(['*', '/', '%'], parseUnary);
  const parseAdd = binaryLevel(['+', '-'], parseMul);
  const parseCmp = binaryLevel(['==', '!=', '<', '>', '<=', '>='], parseAdd);
  const parseAnd = binaryLevel(['&&'], parseCmp);
  const parseOr = binaryLevel(['||'], parseAnd);

  const ast = parseOr();
  if (pos < tokens.length) throw new FormulaError(t('Simbolo inatteso "{v}"', { v: tokens[pos].v }));
  return ast;
}

// ---------------------------------------------------------------------------

export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.reduce((a, b) => a + toNum(b), 0);
  if (v == null || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const flatNums = (args) => args.flat(Infinity).map(toNum);

const FUNCTIONS = {
  floor: (a) => Math.floor(toNum(a)),
  ceil: (a) => Math.ceil(toNum(a)),
  round: (a) => Math.round(toNum(a)),
  abs: (a) => Math.abs(toNum(a)),
  min: (...a) => { const n = flatNums(a); return n.length ? Math.min(...n) : 0; },
  max: (...a) => { const n = flatNums(a); return n.length ? Math.max(...n) : 0; },
  clamp: (x, lo, hi) => Math.min(Math.max(toNum(x), toNum(lo)), toNum(hi)),
  sum: (...a) => flatNums(a).reduce((x, y) => x + y, 0),
  count: (...a) => a.flat(Infinity).filter((v) => v !== '' && v != null && v !== 0 && v !== false).length,
  avg: (...a) => { const n = flatNums(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : 0; },
  // pick(i, v0, v1, …): il valore in posizione i (da 0), utile per le tabelle per livello
  pick: (i, ...v) => (v.length ? v[Math.max(0, Math.min(v.length - 1, Math.floor(toNum(i))))] : 0),
  concat: (...a) => a.flat(Infinity).map((v) => (typeof v === 'number' ? formatValue(v) : String(v ?? ''))).join(''),
  if: null, // gestita a parte (valutazione pigra)
};

export function isTruthy(v) {
  if (typeof v === 'string') return v !== '' && v !== '0';
  if (Array.isArray(v)) return v.length > 0;
  return toNum(v) !== 0;
}

export function evaluate(ast, ctx = {}) {
  const resolve = ctx.resolve || ((name) => { throw new FormulaError(t('Campo @{nome} inesistente', { nome: name })); });
  const ev = (n) => {
    switch (n.k) {
      case 'num':
      case 'str':
        return n.v;
      case 'ref':
        return resolve(n.name);
      case 'un': {
        const v = ev(n.e);
        if (n.op === '!') return isTruthy(v) ? 0 : 1;
        return n.op === '-' ? -toNum(v) : toNum(v);
      }
      case 'bin': {
        if (n.op === '&&') return isTruthy(ev(n.l)) && isTruthy(ev(n.r)) ? 1 : 0;
        if (n.op === '||') return isTruthy(ev(n.l)) || isTruthy(ev(n.r)) ? 1 : 0;
        const a = ev(n.l);
        const b = ev(n.r);
        if (n.op === '==' || n.op === '!=') {
          const eq = typeof a === 'string' || typeof b === 'string'
            ? String(a).toLowerCase() === String(b).toLowerCase()
            : toNum(a) === toNum(b);
          return (n.op === '==') === eq ? 1 : 0;
        }
        const x = toNum(a);
        const y = toNum(b);
        switch (n.op) {
          case '+': return x + y;
          case '-': return x - y;
          case '*': return x * y;
          case '/': return y === 0 ? 0 : x / y;
          case '%': return y === 0 ? 0 : x % y;
          case '^': return x ** y;
          case '<': return x < y ? 1 : 0;
          case '>': return x > y ? 1 : 0;
          case '<=': return x <= y ? 1 : 0;
          case '>=': return x >= y ? 1 : 0;
        }
        throw new FormulaError(t('Operatore sconosciuto {op}', { op: n.op }));
      }
      case 'call': {
        if (n.name === 'if') {
          if (n.args.length < 2) throw new FormulaError(t('if(condizione, se_vero, se_falso)'));
          return isTruthy(ev(n.args[0])) ? ev(n.args[1]) : (n.args[2] ? ev(n.args[2]) : 0);
        }
        return FUNCTIONS[n.name](...n.args.map(ev));
      }
    }
    throw new FormulaError(t('Espressione non valida'));
  };
  return ev(ast);
}

// Cache dei parse: le formule dei modelli si ripetono a ogni aggiornamento.
const cache = new Map();
export function compile(src) {
  const key = String(src ?? '');
  let entry = cache.get(key);
  if (!entry) {
    try { entry = { ast: parse(key) }; } catch (e) { entry = { error: e }; }
    if (cache.size > 2000) cache.clear();
    cache.set(key, entry);
  }
  if (entry.error) throw entry.error;
  return entry.ast;
}

/** Restituisce null se la formula è sintatticamente valida, altrimenti il messaggio d'errore. */
export function syntaxError(src) {
  try { compile(src); return null; } catch (e) { return e.message; }
}

/** Raccoglie i nomi dei riferimenti (@...) usati in una formula. */
export function references(src) {
  const out = new Set();
  const walk = (n) => {
    if (!n) return;
    if (n.k === 'ref') out.add(n.name);
    if (n.k === 'un') walk(n.e);
    if (n.k === 'bin') { walk(n.l); walk(n.r); }
    if (n.k === 'call') n.args.forEach(walk);
  };
  walk(compile(src));
  return [...out];
}

/** Sostituisce i blocchi {formula} in un testo con i loro valori. */
export function interpolate(text, resolve) {
  return String(text ?? '').replace(/\{([^{}]+)\}/g, (_, expr) => {
    try { return formatValue(evaluate(compile(expr), { resolve })); } catch { return '⚠'; }
  });
}

export function formatValue(v, signed = false) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return String(v.length);
  let n = toNum(v);
  n = Math.round(n * 100) / 100;
  const s = String(n).replace('.', ',');
  return signed && n > 0 ? `+${s}` : s.replace('-', '−');
}
