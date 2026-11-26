import { h, icon, toast, confirmDialog, download, menuButton, slugify } from '../ui.js';
import { store } from '../store.js';
import { hasWeight, weightEnabled, allFields, applyRest } from '../engine.js';
import { renderSheet } from '../sheet-render.js';
import { themeToggle, applyAccent, pickAccent } from '../theme.js';
import { openSpellList } from './spell-list.js';

// Tab aperta per ogni personaggio, per ritrovarla dopo un ridisegno.
const lastTab = new Map();

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
        { label: 'Stampa / PDF', icon: 'print', onClick: () => window.print() },
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
