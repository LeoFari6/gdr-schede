import { h, icon, modal, toast, confirmDialog, download, pickFile, menuButton, relativeTime, slugify } from '../ui.js';
import { store } from '../store.js';
import { allFields, defaultValue, Engine } from '../engine.js';
import { themeToggle, applyAccent } from '../theme.js';
import { withImages, importImages } from '../images.js';
import { t, tValues, lang, setLang, LANGS } from '../i18n.js';
import { openSpellList } from './spell-list.js';

// pulsante della lingua: mostra l'altra lingua disponibile
const langButton = () => {
  const other = lang === 'it' ? 'en' : 'it';
  return h('button', { type: 'button', class: 'btn ghost small lang-btn', title: LANGS[other], 'aria-label': LANGS[other], onclick: () => setLang(other) }, other.toUpperCase());
};

// personaggi visibili nella home prima di "Mostra tutti" (la scelta vale finché resti nell'app)
const MAX_VISIBLE = 5;
let showAll = false;

export function renderHome(root) {
  const chars = store.characters();
  const builtins = store.systems();
  // D&D 5e per prima e più in evidenza
  builtins.sort((a, b) => (b.id === 'dnd5e') - (a.id === 'dnd5e'));

  const header = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('h1', {}, t('Schede GdR'))),
    h('div', { class: 'topbar-actions' },
      langButton(),
      themeToggle(),
      menuButton([
        { label: t('Importa personaggio o backup (.json)'), icon: 'upload', onClick: () => importFile(root) },
        { label: t('Esporta backup completo'), icon: 'download', onClick: async () => { download(`schede-gdr-backup-${new Date().toISOString().slice(0, 10)}.json`, await withImages(store.exportAll())); toast(t('Backup esportato')); } },
      ], { title: t('Altre azioni') })));

  // al massimo MAX_VISIBLE personaggi; gli altri compaiono con "Mostra tutti"
  const visible = showAll ? chars : chars.slice(0, MAX_VISIBLE);
  const charGrid = h('div', { class: 'cards' },
    h('button', { type: 'button', class: 'card card-new', onclick: () => newCharacter() }, icon('plus'), h('span', {}, t('Nuovo personaggio'))),
    visible.map((c) => characterCard(c, root)));
  const more = chars.length > MAX_VISIBLE
    ? h('button', { type: 'button', class: 'btn small ghost show-all', onclick: () => { showAll = !showAll; rerender(root); } },
      icon(showAll ? 'up' : 'down'), h('span', {}, showAll ? t('Mostra meno') : t('Mostra tutti ({n})', { n: chars.length })))
    : null;

  root.append(header, h('main', { class: 'home' },
    h('section', { class: 'home-sec' },
      h('div', { class: 'home-sec-head' }, h('h2', {}, t('Personaggi')), h('span', { class: 'count' }, chars.length || '')),
      chars.length ? null : h('p', { class: 'muted intro' }, t('Crea il tuo primo personaggio: scheda di D&D 5ª edizione oppure di Cyberpunk RED. Tutto resta salvato in questo browser.')),
      charGrid, more),

    h('section', { class: 'home-sec' },
      h('div', { class: 'home-sec-head' }, h('h2', {}, t('Schede'))),
      h('div', { class: 'picks' }, builtins.map((s) => pickCard(s))))));
}

// Scheda inclusa da scegliere: un tocco crea un nuovo personaggio con quella scheda.
// Voci del menu ⋯ di una scheda (valgono per tutti i personaggi che la usano).
// D&D: l'elenco degli incantesimi importati.
function sheetMenu(s) {
  const out = [];
  if (allFields(s).some((f) => (f.columns || []).some((c) => c.lookup?.source === 'incantesimi'))) {
    out.push({ label: t('Elenco incantesimi'), icon: 'book', onClick: openSpellList });
  }
  return out;
}

// Le schede incluse hanno tutte la stessa importanza, una sotto l'altra; ⋯ apre il loro menu.
function pickCard(s) {
  const items = sheetMenu(s);
  return h('article', { class: `pick${s.theme ? ` ${s.theme}` : ''}` },
    h('button', { type: 'button', class: 'pick-body', onclick: () => newCharacter(s.id) },
      h('h3', {}, t(s.name)),
      h('span', { class: 'pick-cta' }, icon('plus'), t('Nuovo personaggio'))),
    items.length
      ? menuButton(items, { title: t('Azioni per {nome}', { nome: t(s.name) }) })
      : h('span', { class: 'pick-gear-sp', 'aria-hidden': 'true' })); // spazio vuoto: le schede restano allineate
}

function subtitle(c, sys) {
  if (!sys) return t('Modello mancante');
  // multiclasse: le due classi e il livello totale (es. "Stregone / Warlock · Livello 7")
  const has = (k) => allFields(sys).some((f) => f.key === k);
  if (has('multiclasse') && has('livello_tot') && c.values.multiclasse) {
    const e = new Engine(sys, c.values);
    const classes = [c.values.classe, c.values.classe_2].map((x) => String(x ?? '').trim()).filter(Boolean).map((x) => tValues(x));
    const tot = e.safe(() => e.resolve('livello_tot'));
    return [classes.join(' / '), tot.ok && tot.value ? `${t('Livello')} ${tot.value}` : ''].filter(Boolean).join(' · ');
  }
  const parts = [];
  const eng = new Engine(sys, c.values);
  for (const f of allFields(sys)) {
    if (!['text', 'select', 'number'].includes(f.type) || f.hidden) continue;
    if (f.showIf && !eng.visible(f.showIf)) continue; // es. il livello della seconda classe senza multiclasse
    const v = c.values[f.key] ?? defaultValue(f);
    if (v === '' || v == null) continue;
    parts.push(f.type === 'number' ? `${t(f.label)} ${v}` : tValues(String(v)));
    if (parts.length >= 2) break;
  }
  return parts.join(' · ');
}

function portrait(c, sys) {
  const img = sys && allFields(sys).find((f) => f.type === 'image' && c.values[f.key]);
  if (img) return h('img', { class: 'avatar', src: c.values[img.key], alt: '' });
  const initials = c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return h('span', { class: 'avatar avatar-ph', 'aria-hidden': 'true' }, initials || '?');
}

function characterCard(c, root) {
  const sys = store.system(c.systemId);
  const card = h('article', { class: `card card-char${sys?.theme ? ` ${sys.theme}` : ''}` },
    h('a', { href: `#/c/${c.id}`, class: 'card-link' },
      portrait(c, sys),
      h('div', { class: 'card-body' },
        h('h3', {}, c.pinned ? h('span', { class: 'pin-mark', title: t('Fissato in cima'), 'aria-label': t('Fissato in cima') }, icon('pin')) : null, c.name),
        h('p', { class: 'card-sub' }, subtitle(c, sys)),
        h('p', { class: 'card-meta' }, h('span', { class: 'chip' }, t(sys?.name) || '?'), h('span', { class: 'muted' }, relativeTime(c.updatedAt))))),
    menuButton([
      { label: c.pinned ? t('Togli dalla cima') : t('Fissa in cima'), icon: 'pin', onClick: () => { store.setPinned(c.id, !c.pinned); rerender(root); } },
      { label: t('Duplica'), icon: 'copy', onClick: () => { store.duplicateCharacter(c.id); rerender(root); } },
      { label: t('Esporta (.json)'), icon: 'download', onClick: async () => download(`${slugify(c.name)}.json`, await withImages(store.exportCharacter(c.id))) },
      { label: t('Elimina'), icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog(t('Eliminare il personaggio?'), t('"{nome}" verrà eliminato da questo dispositivo. L\'operazione non si può annullare.', { nome: c.name }), t('Elimina'), true)) {
          store.deleteCharacter(c.id); rerender(root); toast(t('Personaggio eliminato'));
        }
      } },
    ], { title: t('Azioni per {nome}', { nome: c.name }) }));
  applyAccent(card, c.options?.accent);
  return card;
}

// Nuovo personaggio: si crea subito (il nome si scrive poi nella scheda, già selezionato).
// Dalla card "Nuovo personaggio" si sceglie solo la scheda; dalle schede in basso nemmeno quella.
async function newCharacter(preselected) {
  let sysId = preselected && store.system(preselected) ? preselected : null;
  if (!sysId) {
    const ordered = [...store.systems()].sort((a, b) => (b.id === 'dnd5e') - (a.id === 'dnd5e'));
    sysId = ordered.length === 1 ? ordered[0].id : await modal({
      title: t('Nuovo personaggio'),
      body: h('p', { class: 'muted small' }, t('Con quale scheda?')),
      actions: [{ label: t('Annulla'), value: null }, ...ordered.map((s) => ({ label: t(s.name), value: s.id, cls: 'lvl-choice' }))],
    });
    if (!sysId) return;
  }
  store.setSetting('lastSystem', sysId);
  const c = store.createCharacter(sysId, t('Nuovo personaggio'));
  try { sessionStorage.setItem('gdr-schede/nuovo', c.id); } catch { /* il nome resta solo da cambiare a mano */ }
  location.hash = `#/c/${c.id}`;
}

async function importFile(root) {
  const file = await pickFile();
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const r = store.importData(data);
    // immagini incluse nel file (appunti, diario, privilegi…)
    if (data && data.images) {
      try { r.images = await importImages(data.images); } catch (e) { r.warnings.push(t('Immagini non importate: {err}', { err: e.message })); }
    }
    const parts = [];
    if (r.characters) parts.push(t('{n} personaggi', { n: r.characters }));
    toast(parts.length ? t('Importati: {cosa}', { cosa: parts.join(', ') }) : t('Niente di nuovo da importare'), 'ok');
    if (r.warnings.length) {
      await modal({ title: t('Importazione completata con avvisi'), body: h('ul', {}, r.warnings.map((w) => h('li', {}, w))) });
    }
    rerender(root);
  } catch (e) {
    toast(t('Importazione non riuscita: {err}', { err: e.message }), 'error', 5000);
  }
}

function rerender(root) {
  root.replaceChildren();
  renderHome(root);
}
