import { h, icon, toast, confirmDialog, download, menuButton, slugify } from '../ui.js';
import { store } from '../store.js';
import { hasWeight, weightEnabled, allFields, applyRest } from '../engine.js';
import { renderSheet } from '../sheet-render.js';
import { themeToggle, applyAccent, pickAccent } from '../theme.js';
import { openSpellList } from './spell-list.js';
import { withImages } from '../images.js';
import { openImageViewer } from '../richtext.js';
import { t } from '../i18n.js';
import { runLevelUp, runLevelDown } from '../levelup.js';
import { showRestRecap, askHitDice } from '../rest.js';

// Tab aperta per ogni personaggio, per ritrovarla dopo un ridisegno.
const lastTab = new Map();

// ---- stampa / PDF ------------------------------------------------------------
// Al momento di stampare si costruisce una versione apposta per la carta: tutte le
// tab in fila, tutto aperto, senza pulsanti né sezioni vuote. Vale anche per Cmd+P.
let printTarget = null; // { sys, id } del personaggio aperto

// Costruisce la versione da stampare di un personaggio (usata da buildPrint).
export function makePrintRoot({ sys, name, values, options = {} }) {
  const sheet = renderSheet({ system: sys, values: structuredClone(values), options: { ...options, print: true } });
  const root = h('div', { id: 'print-root', class: sys.theme || '' },
    h('header', { class: 'print-head' }, h('h1', {}, name), h('p', {}, t(sys.name))),
    sheet.el);
  root.querySelectorAll('.rt-editor, .list-tools').forEach((e) => e.remove()); // parti solo per modificare
  // su carta i campi diventano testo semplice, che va a capo invece di essere tagliato
  root.querySelectorAll('input:not([type=checkbox]), select').forEach((el) => {
    if (el.hidden) { el.remove(); return; } // es. la scelta del dado vita quando la classe è nota
    const text = el.tagName === 'SELECT' ? (el.value ? el.options[el.selectedIndex]?.text ?? '' : '') : el.value;
    el.replaceWith(h('span', { class: `${el.className} print-value` }, text));
  });
  root.querySelectorAll('.feats-empty, .rt-empty').forEach((e) => e.remove());
  // testi vuoti (es. Ideali non compilati): via anche l'etichetta
  root.querySelectorAll('.f-richtext').forEach((f) => { if (!f.querySelector('.rt-view p, .rt-view li')) f.remove(); });
  // via le sezioni (e le tab) rimaste senza contenuto
  // (i campi qui sono già diventati testo: contano se hanno un valore; le tabelle se hanno righe)
  const filled = 'input, select, textarea, .val, .feat, .lgroup, .dot, .stat-box, .skill-row, .rt-view p, .rt-view li, .counters, img, table.list tbody tr';
  const hasValue = (s) => [...s.querySelectorAll('.print-value')].some((v) => !['', '0'].includes(v.textContent.trim())); // es. monete tutte a 0: via
  root.querySelectorAll('.sec').forEach((s) => { if (!s.querySelector('.f') || !(s.querySelector(filled) || hasValue(s))) s.remove(); });
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
    root.append(h('main', { class: 'empty' }, h('h1', {}, t('Personaggio non trovato')), h('a', { class: 'btn', href: '#/' }, t('Torna alla home'))));
    return;
  }
  const sys = store.system(c.systemId);
  if (!sys) {
    root.append(h('main', { class: 'empty' },
      h('h1', {}, t('Modello mancante')),
      h('p', {}, t('Il modello usato da "{nome}" ({id}) non è presente. Importalo dalla home e riapri la scheda.', { nome: c.name, id: c.systemId })),
      h('a', { class: 'btn', href: '#/' }, t('Torna alla home'))));
    return;
  }

  // il campo del nome è largo quanto il testo, così il ritratto gli sta subito accanto
  const fitName = () => {
    const cs = getComputedStyle(nameInput);
    const g = (fitName.canvas ||= document.createElement('canvas')).getContext('2d');
    g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = nameInput.value || nameInput.placeholder || ' ';
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    nameInput.style.width = `${Math.ceil(g.measureText(text).width + pad + 6)}px`;
  };
  const nameInput = h('input', {
    class: 'title-input', value: c.name, 'aria-label': t('Nome del personaggio'),
    oninput: (e) => { store.updateCharacter(c.id, { name: e.target.value }); document.title = `${e.target.value} · ${t('Schede GdR')}`; fitName(); },
    // nome lasciato vuoto: torna "Senza nome"
    onblur: (e) => { if (!e.target.value.trim()) { e.target.value = t('Senza nome'); store.updateCharacter(c.id, { name: e.target.value }); fitName(); } },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });

  // ritratto in un cerchio a sinistra del nome (il primo campo immagine della scheda)
  const portraitField = allFields(sys).find((f) => f.type === 'image');
  const portrait = h('button', { type: 'button', class: 'title-avatar', title: t('Ritratto'), 'aria-label': t('Ritratto'),
    onclick: () => { const cur = store.character(c.id); const src = cur?.values?.[portraitField?.key]; if (src) openImageViewer(src, cur.name); } });
  const drawPortrait = () => {
    const src = portraitField ? store.character(c.id)?.values?.[portraitField.key] : null;
    portrait.hidden = !src;
    portrait.replaceChildren(...(src ? [h('img', { src, alt: '' })] : []));
  };
  drawPortrait();
  document.title = `${c.name} · ${t('Schede GdR')}`;

  printTarget = { sys, id: c.id };
  const sheet = renderSheet({
    system: sys,
    values: c.values,
    options: c.options || {},
    initialTab: lastTab.get(c.id),
    onTab: (name) => lastTab.set(c.id, name),
    onChange: (key, v) => { store.setValue(c.id, key, v); if (key === portraitField?.key) drawPortrait(); },
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
    toast(weightOn ? t('Peso e ingombro nascosti') : t('Peso e ingombro attivi'));
    redraw();
  };
  // Riposi: applicano le regole del modello (es. slot del Warlock col riposo
  // breve, PF e slot col lungo) e recuperano gli usi dei privilegi.
  const canRest = !!sys.rests || allFields(sys).some((f) => f.type === 'features' && !f.variant); // diario e appunti non hanno usi
  // elenco incantesimi: solo nelle schede che lo usano (D&D)
  const usesSpellList = allFields(sys).some((f) => (f.columns || []).some((c) => c.lookup?.source === 'incantesimi'));
  // riposo: applica le modifiche, aggiorna la scheda e mostra il riepilogo di cosa è stato recuperato
  const rest = async (kind) => {
    const before = structuredClone(store.character(c.id).values);
    // riposo breve: prima si possono spendere dadi vita per recuperare PF
    const dice = kind === 'breve' ? await askHitDice(sys, before) : {};
    if (dice === null) return; // annullato
    const changes = { ...applyRest(sys, before, kind).changes, ...dice };
    const keys = Object.keys(changes);
    keys.forEach((k) => store.setValue(c.id, k, changes[k]));
    if (keys.length) redraw();
    showRestRecap(sys, before, changes, kind);
  };

  // Caselle del modello che si attivano dal menu (es. multiclasse).
  const menuToggles = allFields(sys).filter((f) => f.menu && f.type === 'checkbox').map((f) => {
    const on = !!(c.values[f.key] ?? f.default);
    return {
      label: on ? (f.menuOn ? t(f.menuOn) : t('Disattiva: {nome}', { nome: t(f.label) })) : (f.menuOff ? t(f.menuOff) : t('Attiva: {nome}', { nome: t(f.label) })),
      icon: on ? 'x' : 'plus',
      onClick: () => { store.setValue(c.id, f.key, !on); toast(`${t(f.label)}: ${on ? t('disattivato') : t('attivato')}`); redraw(); },
    };
  });

  const header = h('header', { class: `topbar sheet-top${sys.theme ? ` ${sys.theme}` : ''}` },
    h('a', { href: '#/', class: 'btn ghost sq', 'aria-label': t('Indietro'), title: t('Tutti i personaggi') }, icon('back')),
    h('div', { class: 'title-wrap' }, portrait, nameInput, h('span', { class: 'chip' }, t(sys.name))),
    h('div', { class: 'topbar-actions' },
      h('button', { type: 'button', class: 'btn ghost sq', title: t('Colore della scheda'), 'aria-label': t('Colore della scheda'), onclick: chooseColor }, icon('palette')),
      themeToggle(),
      menuButton([
        sys.levelUp ? { label: t('Sali di livello'), icon: 'up', onClick: async () => {
          const r = await runLevelUp(sys, store.character(c.id).values, (k, v) => store.setValue(c.id, k, v), redraw);
          if (r?.homebrew) toast(t('Livello {n} (+{pf} PF massimi). Classe personalizzata: il resto aggiornalo a mano.', { n: r.level, pf: r.hp }), 'ok', 4500);
        } } : null,
        sys.levelUp ? { label: t('Scendi di livello'), icon: 'down', onClick: () => runLevelDown(sys, store.character(c.id).values, (k, v) => store.setValue(c.id, k, v), redraw) } : null,
        canRest ? { label: t('Riposo breve'), icon: 'sun', onClick: () => rest('breve') } : null,
        canRest ? { label: t('Riposo lungo'), icon: 'moon', onClick: () => rest('lungo') } : null,
        usesSpellList ? { label: t('Elenco incantesimi'), icon: 'book', onClick: openSpellList } : null,
        ...menuToggles,
        hasWeight(sys) ? { label: weightOn ? t('Disattiva peso e ingombro') : t('Attiva peso e ingombro'), icon: 'weight', onClick: toggleWeight } : null,
        { label: t('Esporta (.json)'), icon: 'download', onClick: async () => { download(`${slugify(c.name)}.json`, await withImages(store.exportCharacter(c.id))); toast(t('Scheda esportata')); } },
        { label: t('Stampa / PDF'), icon: 'print', onClick: () => { buildPrint(); window.print(); } },
        { label: t('Duplica'), icon: 'copy', onClick: () => { const d = store.duplicateCharacter(c.id); location.hash = `#/c/${d.id}`; } },
        { label: t('Elimina'), icon: 'trash', danger: true, onClick: async () => {
          if (await confirmDialog(t('Eliminare il personaggio?'), t('"{nome}" verrà eliminato da questo dispositivo.', { nome: c.name }), t('Elimina'), true)) {
            store.deleteCharacter(c.id); location.hash = '#/';
          }
        } },
      ], { title: t('Altre azioni') })));

  root.append(header, h('main', { class: 'sheet-main' }, sheet.el));
  requestAnimationFrame(fitName);
  // personaggio appena creato: il nome è già selezionato, basta scrivere
  let fresh = false;
  try { fresh = sessionStorage.getItem('gdr-schede/nuovo') === c.id; if (fresh) sessionStorage.removeItem('gdr-schede/nuovo'); } catch { /* niente */ }
  if (fresh) requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
  document.fonts?.ready.then(fitName); // il carattere della scheda può arrivare dopo
}
