// Salire e scendere di livello nelle schede di D&D 5e.
//  - Sali di livello: +1 a una classe; i PF crescono con il tiro del dado vita o con la media,
//    e per le classi note compare un riepilogo animato di cosa è cambiato.
//  - Scendi di livello: −1 a una classe; si tolgono i PF guadagnati a quel livello.
// I PF presi a ogni livello si ricordano in values._livelli, così scendendo si toglie il valore giusto.
import { Engine } from './engine.js';
import { DND_CLASSES } from './systems.js';
import { h, modal, toast } from './ui.js';
import { t, tValues } from './i18n.js';

export const MAX_LEVEL = 20;
const ord = (n) => t('{n}° livello', { n });
// livelli di classe con l'aumento dei punteggi di caratteristica (o un talento)
const ASI = { _: [4, 8, 12, 16, 19], Guerriero: [4, 6, 8, 12, 14, 16, 19], Ladro: [4, 8, 10, 12, 16, 19] };
const signed = (n) => (n >= 0 ? `+${n}` : String(n));

/** Le classi del personaggio: [{ n, cls, levelKey, level, slot }] (la seconda solo col multiclasse). */
export function classesOf(values) {
  const out = [{ n: 1, cls: String(values.classe ?? '').trim(), levelKey: 'livello', slot: 'slot' }];
  if (values.multiclasse) out.push({ n: 2, cls: String(values.classe_2 ?? '').trim(), levelKey: 'livello_2', slot: 'slot2' });
  return out.map((c) => ({ ...c, level: Math.max(1, Math.floor(Number(values[c.levelKey]) || 1)) }));
}

/** Dado vita e modificatore di Costituzione della classe `n`: { die, con, avg } (avg = media + COS, almeno 1). */
export function hpInfo(system, values, n = 1) {
  const e = new Engine(system, values);
  const die = Number(String(e.safe(() => e.resolve(n === 1 ? 'tipo_dv' : 'tipo_dv_2')).value || 'd8').replace(/\D/g, '')) || 8;
  const con = Number(e.safe(() => e.resolve('cos_mod')).value) || 0;
  return { die, con, avg: Math.max(1, die / 2 + 1 + con) };
}

// Differenze tra prima e dopo: righe del riepilogo { label, from, to } (solo ciò che cambia).
function diff(system, values, changes, cls, totalFrom, totalTo) {
  const before = new Engine(system, values);
  const after = new Engine(system, { ...values, ...changes });
  const val = (e, k) => { const r = e.safe(() => e.resolve(k)); return r.ok ? r.value : null; };
  const items = [];
  const add = (label, a, b, hint) => { if (a !== b && b !== null) items.push({ label, from: a, to: b, hint }); };
  add('Livello di classe', cls.level, changes[cls.levelKey]);
  if (values.multiclasse) add('Livello del personaggio', totalFrom, totalTo);
  add('Punti ferita massimi', Number(values.pf_max ?? 10) || 0, changes.pf_max);
  const comp = (e) => val(e, 'comp');
  if (comp(before) !== comp(after)) add('Bonus competenza', `+${comp(before)}`, `+${comp(after)}`);
  const dvKey = cls.n === 1 ? 'dv_max' : 'dv_2_max';
  add('Dadi vita', val(before, dvKey), val(after, dvKey));
  const slots = [];
  for (let i = 1; i <= 9; i++) {
    const k = `${cls.slot}_${i}_max`;
    const a = Number(val(before, k)) || 0;
    const b = Number(val(after, k)) || 0;
    if (a !== b) add(t('Slot di {liv}', { liv: ord(i) }), a, b);
    slots.push([i, a, b]);
  }
  return { items, slots };
}

const totalOf = (system, values, cls) => {
  const e = new Engine(system, values);
  return Number(e.safe(() => e.resolve('livello_tot')).value) || cls.level;
};

/**
 * Calcola la salita di livello della classe `n` senza toccare i dati.
 * `hp` = PF guadagnati (tiro + COS); se manca si usa la media.
 * Restituisce { changes, items, known, cls, level, total, hp } oppure { error }.
 */
export function planLevelUp(system, values, n = 1, hp) {
  const cls = classesOf(values).find((c) => c.n === n);
  if (!cls) return { error: 'classe' };
  const total = totalOf(system, values, cls);
  if (total >= MAX_LEVEL) return { error: 'max' };
  const info = hpInfo(system, values, n);
  const gain = Math.max(1, Math.round(hp ?? info.avg));
  const level = cls.level + 1;
  const hpMax = Number(values.pf_max ?? 10) || 0;
  const changes = { [cls.levelKey]: level, pf_max: hpMax + gain };
  if (values.pf !== undefined && values.pf !== null && values.pf !== '') changes.pf = Number(values.pf) + gain; // se non è al massimo, sale anche l'attuale
  changes._livelli = [...(Array.isArray(values._livelli) ? values._livelli : []), { c: n, pf: gain }];

  const { items, slots } = diff(system, values, changes, cls, total, total + 1);
  const pfRow = items.find((i) => i.label === 'Punti ferita massimi');
  if (pfRow) pfRow.hint = hp == null
    ? t('media del d{d} ({m}) + mod. COS ({c})', { d: info.die, m: info.die / 2 + 1, c: signed(info.con) })
    : t('tiro del d{d} ({r}) + mod. COS ({c})', { d: info.die, r: gain - info.con, c: signed(info.con) });
  const unlocked = slots.filter(([, a, b]) => !a && b).map(([i]) => i).pop();
  if (unlocked) items.push({ note: t('Puoi lanciare incantesimi di {liv}', { liv: ord(unlocked) }), star: true });
  if ((ASI[cls.cls] || ASI._).includes(level)) items.push({ note: t('Aumento dei punteggi di caratteristica (o un talento)'), star: true });
  items.push({ note: t('Controlla i nuovi privilegi di classe del {liv}.', { liv: ord(level) }) });
  return { changes, items, known: DND_CLASSES.includes(cls.cls), cls: cls.cls, level, total: total + 1, hp: gain };
}

/** PF da togliere scendendo di livello: quelli presi all'ultimo livello di quella classe, se ricordati, altrimenti la media. */
export function hpToRemove(system, values, n = 1) {
  const hist = Array.isArray(values._livelli) ? values._livelli : [];
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i]?.c === n) return { hp: Number(hist[i].pf) || 0, known: true };
  return { hp: hpInfo(system, values, n).avg, known: false };
}

/** Calcola la discesa di livello della classe `n` (minimo livello 1). `hp` = PF da togliere. */
export function planLevelDown(system, values, n = 1, hp) {
  const cls = classesOf(values).find((c) => c.n === n);
  if (!cls) return { error: 'classe' };
  if (cls.level <= 1) return { error: 'min' };
  const total = totalOf(system, values, cls);
  const loss = Math.max(0, Math.round(hp ?? hpToRemove(system, values, n).hp));
  const hpMax = Number(values.pf_max ?? 10) || 0;
  const newMax = Math.max(1, hpMax - loss);
  const changes = { [cls.levelKey]: cls.level - 1, pf_max: newMax };
  if (values.pf !== undefined && values.pf !== null && values.pf !== '') changes.pf = Math.min(newMax, Math.max(0, Number(values.pf) - loss));
  // dimentica l'ultimo livello ricordato di quella classe
  const hist = Array.isArray(values._livelli) ? [...values._livelli] : [];
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i]?.c === n) { hist.splice(i, 1); break; }
  changes._livelli = hist.length ? hist : undefined;
  const { items } = diff(system, values, changes, cls, total, total - 1);
  return { changes, items, cls: cls.cls, level: cls.level - 1, total: total - 1, hp: loss };
}

// ---- interfaccia ---------------------------------------------------------------
const nameOf = (c) => tValues(c.cls) || t(c.n === 1 ? '1ª classe' : '2ª classe');

// In multiclasse: quale classe? I pulsanti sono le classi stesse (es. "Mago · 4 → 5").
async function pickClass(classes, { title, text, step }) {
  const usable = classes.filter((c) => (step < 0 ? c.level > 1 : true));
  if (classes.length === 1) return usable.length ? classes[0].n : null;
  if (!usable.length) return null;
  return modal({
    title,
    body: h('p', { class: 'muted small' }, text),
    actions: [{ label: t('Annulla'), value: null }, ...usable.map((c) => ({ label: `${nameOf(c)} · ${c.level} → ${c.level + step}`, value: c.n, cls: 'lvl-choice' }))],
  });
}

// PF: tirare il dado vita o prendere la media. Restituisce { gain, rolled }, oppure null se si annulla.
async function askHp(info) {
  for (;;) {
    const roll = h('input', { class: 'input num lvl-roll', type: 'number', min: 1, max: info.die, inputmode: 'numeric', placeholder: `1–${info.die}`, 'aria-label': t('Risultato del d{d}', { d: info.die }) });
    const r = await modal({
      title: t('Punti ferita del nuovo livello'),
      body: h('div', { class: 'stack gap' },
        h('p', { class: 'muted small' }, t('Tira il d{d} e scrivi il risultato, oppure prendi la media. Al risultato si aggiunge il modificatore di Costituzione ({c}).', { d: info.die, c: signed(info.con) })),
        h('label', { class: 'lvl-roll-row' }, h('span', {}, t('Risultato del d{d}', { d: info.die })), roll)),
      actions: [
        { label: t('Annulla'), value: null },
        { label: t('Media (+{n})', { n: info.avg }), value: 'avg' },
        { label: t('Usa il tiro'), value: 'roll', cls: 'primary' },
      ],
    });
    if (!r) return null;
    if (r === 'avg') return { gain: info.avg, rolled: false };
    const n = Math.floor(Number(roll.value));
    if (n >= 1 && n <= info.die) return { gain: Math.max(1, n + info.con), rolled: true };
    toast(t('Scrivi un numero da 1 a {d}', { d: info.die }), 'error');
  }
}

/** Sali di livello: classe (in multiclasse), PF (tiro o media), poi applica e mostra il riepilogo. */
export async function runLevelUp(system, values, set, onApplied) {
  const classes = classesOf(values);
  if (planLevelUp(system, values, classes[0].n).error === 'max') { // il tetto è sul livello totale
    await modal({ title: t('Livello massimo'), body: h('p', {}, t('Il personaggio è già al livello {n}.', { n: MAX_LEVEL })) });
    return false;
  }
  const n = await pickClass(classes, { title: t('Su quale classe sali di livello?'), text: t('Il livello del personaggio sale di 1; scegli quale classe lo prende.'), step: 1 });
  if (!n) return false;
  const hp = await askHp(hpInfo(system, values, n));
  if (!hp) return false;
  const plan = planLevelUp(system, values, n, hp.rolled ? hp.gain : undefined);
  if (plan.error) return false;
  for (const [k, v] of Object.entries(plan.changes)) set(k, v);
  onApplied?.(); // la scheda si aggiorna subito, sotto il riepilogo
  if (!DND_CLASSES.includes(plan.cls)) return { homebrew: true, level: plan.level, hp: plan.hp };
  await celebrate(plan);
  return plan;
}

/** Scendi di livello: classe (in multiclasse), conferma con i PF da togliere, poi applica. */
export async function runLevelDown(system, values, set, onApplied) {
  const classes = classesOf(values);
  const n = await pickClass(classes, { title: t('Su quale classe scendi di livello?'), text: t('Il livello del personaggio scende di 1; scegli da quale classe.'), step: -1 });
  if (!n) {
    if (!classes.some((c) => c.level > 1)) await modal({ title: t('Livello minimo'), body: h('p', {}, t('Il personaggio è già al 1° livello.')) });
    return false;
  }
  const guess = hpToRemove(system, values, n);
  const input = h('input', { class: 'input num lvl-roll', type: 'number', min: 0, inputmode: 'numeric', value: guess.hp, 'aria-label': t('PF da togliere') });
  const preview = planLevelDown(system, values, n, guess.hp);
  const rows = preview.items.filter((it) => it.label !== 'Punti ferita massimi').map((it) => h('li', { class: 'lvl-item lvl-down' },
    h('span', { class: 'lvl-lbl' }, t(it.label)),
    h('span', { class: 'lvl-val' }, h('s', {}, String(it.from)), h('span', { class: 'lvl-arrow', 'aria-hidden': 'true' }, '→'), h('b', {}, String(it.to)))));
  const ok = await modal({
    title: t('Scendi di livello'),
    body: h('div', { class: 'stack gap' },
      h('p', { class: 'lvl-sub' }, `${nameOf(classes.find((c) => c.n === n))} · ${ord(preview.level + 1)} → ${ord(preview.level)}`),
      h('ul', { class: 'lvl-list' }, rows),
      h('label', { class: 'lvl-roll-row' }, h('span', {}, t('PF massimi da togliere')), input),
      h('small', { class: 'hint' }, guess.known ? t('Sono i PF presi salendo a questo livello.') : t('Non so quanti PF avevi preso: propongo la media, cambiala se serve.'))),
    actions: [{ label: t('Annulla'), value: false }, { label: t('Scendi di livello'), value: true, cls: 'primary danger' }],
  });
  if (!ok) return false;
  const plan = planLevelDown(system, values, n, Number(input.value) || 0);
  if (plan.error) return false;
  for (const [k, v] of Object.entries(plan.changes)) set(k, v);
  onApplied?.();
  toast(t('{classe}: ora {liv} ({pf} PF massimi)', { classe: nameOf(classes.find((c) => c.n === n)), liv: ord(plan.level), pf: signed(-plan.hp) }), 'ok', 4000);
  return plan;
}

// Riepilogo animato: il nuovo livello in grande, poi le novità una alla volta.
function celebrate(plan) {
  const rows = plan.items.map((it, i) => h('li', { class: `lvl-item${it.note ? ' lvl-note' : ''}${it.star ? ' lvl-star' : ''}`, style: { '--i': String(i) } },
    it.note
      ? [h('span', { class: 'lvl-ico', 'aria-hidden': 'true' }, it.star ? '★' : '•'), h('span', {}, it.note)]
      : [h('span', { class: 'lvl-lbl' }, t(it.label), it.hint ? h('small', {}, it.hint) : null),
        h('span', { class: 'lvl-val' }, h('s', {}, String(it.from)), h('span', { class: 'lvl-arrow', 'aria-hidden': 'true' }, '→'), h('b', {}, String(it.to)))]));
  return modal({
    title: '',
    body: h('div', { class: 'lvl' },
      h('div', { class: 'lvl-burst', 'aria-hidden': 'true' }, Array.from({ length: 12 }, (_, i) => h('i', { style: { '--a': `${i * 30}deg` } }))),
      h('div', { class: 'lvl-badge' }, h('small', {}, t('Livello')), h('b', {}, String(plan.level))),
      h('h2', { class: 'lvl-title' }, t('Sei salito di livello!')),
      h('p', { class: 'lvl-sub' }, `${tValues(plan.cls)} · ${ord(plan.level)}`),
      h('ul', { class: 'lvl-list' }, rows)),
    actions: [{ label: t('Avanti'), value: true, cls: 'primary' }],
  });
}
