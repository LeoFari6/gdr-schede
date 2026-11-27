// Riepilogo di un riposo (breve o lungo): cosa è stato recuperato, con i valori prima e dopo.
import { Engine, allFields, normalizeFeature, normalizeCounter, counterMax } from './engine.js';
import { interpolate } from './formula.js';
import { h, modal, icon, toast } from './ui.js';
import { t, tValues } from './i18n.js';

/**
 * Righe del riepilogo per le modifiche `changes` di applyRest (valori prima: `values`).
 * Ogni riga: { label, from, to, hint? }. Mostra le risorse come "rimasti" (es. slot 1 → 4).
 */
export function describeRest(system, values, changes) {
  const before = new Engine(system, values);
  const after = new Engine(system, { ...values, ...changes });
  const fields = new Map(allFields(system).map((f) => [f.key, f]));
  const label = (f) => tValues(interpolate(t(f.label || f.key), before.resolver()).trim());
  const num = (e, fn) => { const r = e.safe(fn); return r.ok ? Number(r.value) || 0 : 0; };
  const items = [];
  const add = (it) => { if (it.from !== it.to) items.push(it); };

  for (const key of Object.keys(changes)) {
    const f = fields.get(key);
    if (!f) continue;
    if (f.type === 'resource') {
      add({ label: label(f), from: num(before, () => before.value(f)), to: num(after, () => after.value(f)), hint: `/ ${num(after, () => after.max(f))}` });
    } else if (f.type === 'dots' && /^slot/.test(key)) {
      // slot: i pallini accesi sono quelli usati → si mostrano quelli disponibili
      const max = num(before, () => before.max(f));
      const [, two, lvl] = /^slot(2?)_(\d)$/.exec(key) || [];
      const cls = values.multiclasse ? tValues(String((two ? values.classe_2 : values.classe) || '')) : '';
      const name = lvl ? t('Slot di {liv}', { liv: t('{n}° livello', { n: Number(lvl) }) }) + (cls ? ` · ${cls}` : '') : label(f);
      add({ label: name, from: max - Math.min(max, num(before, () => before.value(f))), to: max - Math.min(max, num(after, () => after.value(f))), hint: t('disponibili') });
    } else if (f.type === 'number' || f.type === 'dots') {
      add({ label: label(f), from: num(before, () => before.value(f)), to: num(after, () => after.value(f)) });
    } else if (f.type === 'features') {
      // privilegi: usi e contatori recuperati, voce per voce
      const walk = (a, b) => (a || []).forEach((itA, i) => {
        const nA = normalizeFeature(itA);
        const nB = normalizeFeature((b || [])[i] || itA);
        if (nA.usi && nA.usati !== nB.usati) add({ label: nA.nome || t('Senza nome'), from: nA.usi - nA.usati, to: nA.usi - nB.usati, hint: t('usi') });
        nA.contatori.forEach((c, k) => {
          const cA = normalizeCounter(c);
          const cB = normalizeCounter(nB.contatori[k] || c);
          if (cA.usati === cB.usati) return;
          const mx = counterMax(before, cA);
          const m = mx.ok ? mx.value : cA.usati;
          add({ label: `${nA.nome} · ${cA.nome}`, from: m - cA.usati, to: m - cB.usati });
        });
        walk(itA?.figli, ((b || [])[i] || {}).figli);
      });
      walk(values[key], changes[key]);
    }
  }
  return items;
}

/** Mostra il riepilogo del riposo. `kind` = "breve" | "lungo". */
export function showRestRecap(system, values, changes, kind) {
  const items = describeRest(system, values, changes);
  const title = kind === 'breve' ? t('Riposo breve') : t('Riposo lungo');
  const rows = items.map((it, i) => h('li', { class: 'lvl-item', style: { '--i': String(i) } },
    h('span', { class: 'lvl-lbl' }, it.label),
    h('span', { class: 'lvl-val' }, h('s', {}, String(it.from)), h('span', { class: 'lvl-arrow', 'aria-hidden': 'true' }, '→'), h('b', {}, String(it.to)),
      it.hint ? h('small', { class: 'lvl-hint' }, it.hint) : null)));
  return modal({
    title: '',
    body: h('div', { class: `lvl rest rest-${kind}` },
      h('div', { class: 'rest-ico' }, icon(kind === 'breve' ? 'sun' : 'moon')),
      h('h2', { class: 'lvl-title' }, title),
      items.length
        ? [h('p', { class: 'lvl-sub' }, t('Ecco cosa hai recuperato')), h('ul', { class: 'lvl-list' }, rows)]
        : h('p', { class: 'lvl-sub' }, t('Niente da recuperare: era già tutto al massimo.'))),
    actions: [{ label: t('Avanti'), value: true, cls: 'primary' }],
  });
}

// ---- dadi vita nel riposo breve ----------------------------------------------
/** Dadi vita spendibili: { pools: [{ key, cls, die, left }], con, hp, max }. */
export function hitDicePools(system, values) {
  const e = new Engine(system, values);
  const fields = new Map(allFields(system).map((f) => [f.key, f]));
  const val = (fn) => { const r = e.safe(fn); return r.ok ? r.value : null; };
  const pools = [['dv', 'tipo_dv', values.classe], ['dv_2', 'tipo_dv_2', values.classe_2]]
    .filter(([key]) => fields.has(key) && (key === 'dv' || values.multiclasse))
    .map(([key, dieKey, cls]) => ({
      key, cls: String(cls || '').trim(),
      die: Number(String(val(() => e.resolve(dieKey)) || 'd8').replace(/\D/g, '')) || 8,
      left: Math.max(0, Number(val(() => e.value(fields.get(key)))) || 0),
    }));
  const pf = fields.get('pf');
  return {
    pools,
    con: Number(val(() => e.resolve('cos_mod'))) || 0,
    hp: pf ? Number(val(() => e.value(pf))) || 0 : 0,
    max: pf ? Number(val(() => e.max(pf))) || 0 : 0,
  };
}

/**
 * PF recuperati spendendo dadi vita: spends = [{ key, n, roll }] (roll = somma dei dadi tirati).
 * Ogni dado aggiunge il modificatore di Costituzione; i PF non superano il massimo.
 * Restituisce { changes, heal }.
 */
export function spendHitDice(system, values, spends) {
  const { pools, con, hp, max } = hitDicePools(system, values);
  const changes = {};
  let heal = 0;
  for (const s of spends) {
    const pool = pools.find((p) => p.key === s.key);
    const n = Math.min(pool?.left ?? 0, Math.max(0, Math.floor(Number(s.n) || 0)));
    if (!pool || !n) continue;
    heal += Math.max(0, Math.floor(Number(s.roll) || 0) + n * con);
    changes[pool.key] = pool.left - n;
  }
  if (!Object.keys(changes).length) return { changes, heal: 0 };
  const next = Math.min(max, hp + heal);
  changes.pf = next >= max ? undefined : next; // undefined = al massimo
  return { changes, heal: next - hp };
}

/**
 * Chiede se spendere dadi vita durante il riposo breve.
 * Restituisce le modifiche da aggiungere ({} se non ne spendi), oppure null se annulli il riposo.
 */
export async function askHitDice(system, values) {
  const info = hitDicePools(system, values);
  const usable = info.pools.filter((p) => p.left > 0);
  if (!usable.length || info.hp >= info.max) return {}; // niente dadi o PF già al massimo: non chiede
  const signed = (n) => (n >= 0 ? `+${n}` : String(n));
  const rows = usable.map((p) => {
    const state = { n: 0 };
    const count = h('b', { class: 'hd-spend-n' }, '0');
    const roll = h('input', { class: 'input num hd-spend-roll', type: 'number', min: 0, inputmode: 'numeric', placeholder: t('somma'), 'aria-label': t('Somma dei dadi tirati'), disabled: true, oninput: () => update() });
    const set = (n) => { state.n = Math.max(0, Math.min(p.left, n)); count.textContent = String(state.n); roll.disabled = !state.n; if (!state.n) roll.value = ''; update(); };
    const el = h('div', { class: 'hd-spend' },
      h('div', { class: 'hd-spend-info' }, h('strong', {}, `${tValues(p.cls) || t('Dadi vita')} · d${p.die}`), h('small', {}, t('{n} rimasti', { n: p.left }))),
      h('div', { class: 'hd-count' },
        h('button', { type: 'button', class: 'btn sq', 'aria-label': t('Un dado in meno'), onclick: () => set(state.n - 1) }, '−'),
        count,
        h('button', { type: 'button', class: 'btn sq', 'aria-label': t('Un dado in più'), onclick: () => set(state.n + 1) }, '+')),
      roll);
    return { p, state, roll, el };
  });
  const total = h('p', { class: 'hd-spend-total' });
  const spends = () => rows.map((r) => ({ key: r.p.key, n: r.state.n, roll: r.roll.value }));
  const update = () => {
    const any = rows.some((r) => r.state.n);
    const missing = rows.some((r) => r.state.n && r.roll.value === '');
    const { heal } = spendHitDice(system, values, spends());
    total.textContent = !any ? t('Scegli quanti dadi usare e scrivi la somma del tiro.')
      : missing ? t('Scrivi la somma dei dadi tirati.')
        : t('Recuperi {n} PF ({da} → {a})', { n: heal, da: info.hp, a: info.hp + heal });
  };
  update();
  for (;;) {
    const r = await modal({
      title: t('Vuoi spendere dadi vita?'),
      body: h('div', { class: 'stack gap' },
        h('p', { class: 'muted small' }, t('Hai {pf} PF su {max}. Per ogni dado si aggiunge il modificatore di Costituzione ({c}).', { pf: info.hp, max: info.max, c: signed(info.con) })),
        h('div', { class: 'hd-spend-list' }, rows.map((x) => x.el)),
        total),
      actions: [
        { label: t('Annulla'), value: null },
        { label: t('No, solo riposo'), value: 'skip' },
        { label: t('Recupera'), value: 'go', cls: 'primary' },
      ],
    });
    if (r === null) return null;
    if (r === 'skip') return {};
    if (rows.some((x) => x.state.n && x.roll.value === '')) { toast(t('Scrivi la somma dei dadi tirati.'), 'error'); continue; }
    return spendHitDice(system, values, spends()).changes;
  }
}
