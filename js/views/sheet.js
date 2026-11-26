import { h, icon, toast, confirmDialog, download, menuButton, slugify } from '../ui.js';
import { store } from '../store.js';
import { hasWeight, weightEnabled, allFields, applyRest } from '../engine.js';
import { renderSheet } from '../sheet-render.js';
import { themeToggle, applyAccent, pickAccent } from '../theme.js';
import { openSpellList } from './spell-list.js';

// Tab aperta per ogni personaggio, per ritrovarla dopo un ridisegno.
const lastTab = new Map();

// ---- stampa / PDF ------------------------------------------------------------
// Al momento di stampare si costruisce una versione apposta per la carta: tutte le
// tab in fila, tutto aperto, senza pulsanti né sezioni vuote. Vale anche per Cmd+P.
let printTarget = null; // { sys, id } del personaggio aperto

// Costruisce la versione da stampare di un personaggio (usata da buildPrint).
export function makePrintRoot({ sys, name, values, options = {} }) {
  const sheet = renderSheet({ system: sys, values: structuredClone(values), options: { ...options, print: true } });
  const root = h('div', { id: 'print-root', class: sys.theme === 'fantasy' ? 'fantasy' : '' },
    h('header', { class: 'print-head' }, h('h1', {}, name), h('p', {}, sys.name)),
    sheet.el);
  root.querySelectorAll('.rt-editor, .list-tools').forEach((e) => e.remove()); // parti solo per modificare
  // su carta i campi diventano testo semplice, che va a capo invece di essere tagliato
  root.querySelectorAll('input:not([type=checkbox]), select').forEach((el) => {
    const text = el.tagName === 'SELECT' ? (el.value ? el.options[el.selectedIndex]?.text ?? '' : '') : el.value;
    el.replaceWith(h('span', { class: `${el.className} print-value` }, text));
  });
  root.querySelectorAll('.feats-empty, .rt-empty').forEach((e) => e.remove());
  // testi vuoti (es. Ideali non compilati): via anche l'etichetta
  root.querySelectorAll('.f-richtext').forEach((f) => { if (!f.querySelector('.rt-view p, .rt-view li')) f.remove(); });
  // via le sezioni (e le tab) rimaste senza contenuto
  const filled = 'input, select, textarea, .val, .feat, .lgroup, .dot, .stat-box, .skill-row, .rt-view p, .rt-view li, .counters, img';
  root.querySelectorAll('.sec').forEach((s) => { if (!s.querySelector('.f') || !s.querySelector(filled)) s.remove(); });
  root.querySelectorAll('.sheet-page').forEach((p) => { if (!p.querySelector('.sec')) p.remove(); });
  // titolo di sezione uguale a quello della tab (es. Incantesimi / Incantesimi): ne basta uno
  root.querySelectorAll('.sheet-page').forEach((p) => {
    const tab = p.querySelector('.print-tab')?.textContent;
    p.querySelectorAll('.sec-head h2').forEach((h2) => { if (h2.textContent === tab) h2.closest('.sec-head').remove(); });
  });
  return root;
}

function buildPrint() {
  removePrint();
  if (!printTarget || !location.hash.startsWith(`#/c/${encodeURIComponent(printTarget.id)}`)) return;
  const c = store.character(printTarget.id);
  if (!c) return;
  document.body.append(makePrintRoot({ sys: printTarget.sys, name: c.name, values: c.values, options: c.options || {} }));
}
function removePrint() { document.getElementById('print-root')?.remove(); }
addEventListener('beforeprint', buildPrint);
addEventListener('afterprint', removePrint);

export function renderCharacter(root, id) {
  const c = store.character(id);
  if (!c) {
    root.append(h('main', { class: 'empty' }, h('h1', {}, 'Personaggio non trovato'), h('a', { class: 'btn', href: '#/' }, 'Torna alla home')));
    return;
  }
  const sys = store.system(c.systemId);
  if (!sys) {
    root.append(h('main', { class: 'empty' },
      h('h1', {}, 'Modello mancante'),
      h('p', {}, `Il modello usato da "${c.name}" (${c.systemId}) non è presente. Importalo dalla home e riapri la scheda.`),
      h('a', { class: 'btn', href: '#/' }, 'Torna alla home')));
    return;
  }

  const nameInput = h('input', {
    class: 'title-input', value: c.name, 'aria-label': 'Nome del personaggio',
    oninput: (e) => { store.updateCharacter(c.id, { name: e.target.value }); document.title = `${e.target.value} · Schede GdR`; },
  });
  document.title = `${c.name} · Schede GdR`;

  printTarget = { sys, id: c.id };
  const sheet = renderSheet({
    system: sys,
    values: c.values,
    options: c.options || {},
    initialTab: lastTab.get(c.id),
    onTab: (name) => lastTab.set(c.id, name),
    onChange: (key, v) => store.setValue(c.id, key, v),
  });

  applyAccent(document.documentElement, c.options?.accent);
  const chooseColor = async () => {
    const color = await pickAccent(c.options?.accent, (col) => applyAccent(document.documentElement, col));
    if (color === undefined) return;
    const options = { ...(c.options || {}) };
    if (color) options.accent = color; else delete options.accent;
    store.updateCharacter(c.id, { options });
  };

  const redraw = () => {
    const y = window.scrollY;
    root.replaceChildren();
    renderCharacter(root, id);
    window.scrollTo(0, y);
  };
  const weightOn = weightEnabled(c.options);
  const toggleWeight = () => {
    store.updateCharacter(c.id, { options: { ...(c.options || {}), weight: !weightOn } });
    toast(weightOn ? 'Peso e ingombro nascosti' : 'Peso e ingombro attivi');
    redraw();
  };
  // Riposi: applicano le regole del modello (es. slot del Warlock col riposo
  // breve, PF e slot col lungo) e recuperano gli usi dei privilegi.
  const canRest = !!sys.rests || allFields(sys).some((f) => f.type === 'features');
  // elenco incantesimi: solo nelle schede che lo usano (D&D)
  const usesSpellList = allFields(sys).some((f) => (f.columns || []).some((c) => c.lookup?.source === 'incantesimi'));
  const rest = (name, kind) => {
    const { changes, labels } = applyRest(sys, c.values, kind);
    const keys = Object.keys(changes);
    keys.forEach((k) => store.setValue(c.id, k, changes[k]));
    toast(labels.length ? `${name}: recuperati ${labels.join(', ')}` : `${name}: niente da recuperare`, labels.length ? 'ok' : 'info', 3500);
    if (keys.length) redraw();
  };

  // Caselle del modello che si attivano dal menu (es. multiclasse).
  const menuToggles = allFields(sys).filter((f) => f.menu && f.type === 'checkbox').map((f) => {
    const on = !!(c.values[f.key] ?? f.default);
    return {
      label: on ? (f.menuOn || `Disattiva: ${f.label}`) : (f.menuOff || `Attiva: ${f.label}`),
      icon: on ? 'x' : 'plus',
      onClick: () => { store.setValue(c.id, f.key, !on); toast(`${f.label}: ${on ? 'disattivato' : 'attivato'}`); redraw(); },
    };
  });

  const header = h('header', { class: `topbar sheet-top${sys.theme === 'fantasy' ? ' fantasy' : ''}` },
    h('a', { href: '#/', class: 'btn ghost sq', 'aria-label': 'Indietro', title: 'Tutti i personaggi' }, icon('back')),
    h('div', { class: 'title-wrap' }, nameInput, h('span', { class: 'chip' }, sys.name)),
    h('div', { class: 'topbar-actions' },
      h('button', { type: 'button', class: 'btn ghost sq', title: 'Colore della scheda', 'aria-label': 'Colore della scheda', onclick: chooseColor }, icon('palette')),
      themeToggle(),
      menuButton([
        canRest ? { label: 'Riposo breve', icon: 'sun', onClick: () => rest('Riposo breve', 'breve') } : null,
        canRest ? { label: 'Riposo lungo', icon: 'moon', onClick: () => rest('Riposo lungo', 'lungo') } : null,
        usesSpellList ? { label: 'Elenco incantesimi', icon: 'book', onClick: openSpellList } : null,
        ...menuToggles,
        hasWeight(sys) ? { label: weightOn ? 'Disattiva peso e ingombro' : 'Attiva peso e ingombro', icon: 'weight', onClick: toggleWeight } : null,
        { label: 'Esporta (.json)', icon: 'download', onClick: () => { download(`${slugify(c.name)}.json`, store.exportCharacter(c.id)); toast('Scheda esportata'); } },
        { label: 'Stampa / PDF', icon: 'print', onClick: () => { buildPrint(); window.print(); } },
        { label: 'Duplica', icon: 'copy', onClick: () => { const d = store.duplicateCharacter(c.id); location.hash = `#/c/${d.id}`; } },
        store.isBuiltin(sys.id) ? null : { label: 'Modifica modello', icon: 'edit', onClick: () => { location.hash = `#/t/${sys.id}`; } },
        { label: 'Elimina', icon: 'trash', danger: true, onClick: async () => {
          if (await confirmDialog('Eliminare il personaggio?', `"${c.name}" verrà eliminato da questo dispositivo.`, 'Elimina', true)) {
            store.deleteCharacter(c.id); location.hash = '#/';
          }
        } },
      ], { title: 'Altre azioni' })));

  root.append(header, h('main', { class: 'sheet-main' }, sheet.el));
}
