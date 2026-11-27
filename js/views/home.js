import { h, icon, btn, modal, toast, confirmDialog, promptDialog, download, pickFile, menuButton, relativeTime, slugify } from '../ui.js';
import { store } from '../store.js';
import { allFields, defaultValue, Engine } from '../engine.js';
import { themeToggle, applyAccent } from '../theme.js';
import { withImages, importImages } from '../images.js';
import { t, tValues, lang, setLang, LANGS } from '../i18n.js';

// pulsante della lingua: mostra l'altra lingua disponibile
const langButton = () => {
  const other = lang === 'it' ? 'en' : 'it';
  return h('button', { type: 'button', class: 'btn ghost small lang-btn', title: LANGS[other], 'aria-label': LANGS[other], onclick: () => setLang(other) }, other.toUpperCase());
};

export function renderHome(root) {
  const chars = store.characters();
  const builtins = store.systems().filter((s) => store.isBuiltin(s.id));
  const custom = store.systems().filter((s) => !store.isBuiltin(s.id));
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

  const charGrid = h('div', { class: 'cards' },
    h('button', { type: 'button', class: 'card card-new', onclick: () => newCharacter() }, icon('plus'), h('span', {}, t('Nuovo personaggio'))),
    chars.map((c) => characterCard(c, root)));

  root.append(header, h('main', { class: 'home' },
    h('section', { class: 'home-sec' },
      h('div', { class: 'home-sec-head' }, h('h2', {}, t('Personaggi')), h('span', { class: 'count' }, chars.length || '')),
      chars.length ? null : h('p', { class: 'muted intro' }, t('Crea il tuo primo personaggio: scheda di D&D 5ª edizione oppure generica. Tutto resta salvato in questo browser.')),
      charGrid),

    h('section', { class: 'home-sec' },
      h('div', { class: 'home-sec-head' }, h('h2', {}, t('Schede'))),
      h('div', { class: 'picks' }, builtins.map((s) => pickCard(s, s.id === 'dnd5e')))),

    h('section', { class: 'home-sec' },
      h('div', { class: 'home-sec-head' },
        h('h2', {}, t('I tuoi modelli')), h('span', { class: 'count' }, custom.length || ''),
        btn(t('Nuovo modello'), async () => {
          const name = await promptDialog(t('Nuovo modello'), t('Nome del modello'));
          if (!name) return;
          const sys = store.newSystem(name);
          location.hash = `#/t/${sys.id}`;
        }, { iconName: 'plus', cls: 'small ghost push' })),
      custom.length
        ? h('div', { class: 'systems' }, custom.map((s) => systemRow(s, root)))
        : h('p', { class: 'muted' }, t('Qui compaiono le schede che crei tu. Per partire da una scheda inclusa usa "Duplica e modifica" dal suo menu.')))));
}

// Scheda inclusa da scegliere: un tocco crea un nuovo personaggio con quella scheda.
function pickCard(s, main) {
  return h('article', { class: `pick${main ? ' pick-main' : ''}${s.theme === 'fantasy' ? ' fantasy' : ''}` },
    h('button', { type: 'button', class: 'pick-body', onclick: () => newCharacter(s.id) },
      h('h3', {}, t(s.name)),
      h('span', { class: 'pick-cta' }, icon('plus'), t('Nuovo personaggio'))),
    menuButton([
      { label: t('Duplica e modifica come modello tuo'), icon: 'copy', onClick: () => { const copy = store.duplicateSystem(s.id); location.hash = `#/t/${copy.id}`; } },
      { label: t('Esporta (.json)'), icon: 'download', onClick: () => download(`modello-${slugify(s.name)}.json`, store.exportSystem(s.id)) },
    ], { title: t('Azioni per {nome}', { nome: t(s.name) }) }));
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
  for (const f of allFields(sys)) {
    if (!['text', 'select', 'number'].includes(f.type)) continue;
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
  const card = h('article', { class: `card card-char${sys?.theme === 'fantasy' ? ' fantasy' : ''}` },
    h('a', { href: `#/c/${c.id}`, class: 'card-link' },
      portrait(c, sys),
      h('div', { class: 'card-body' },
        h('h3', {}, c.name),
        h('p', { class: 'card-sub' }, subtitle(c, sys)),
        h('p', { class: 'card-meta' }, h('span', { class: 'chip' }, t(sys?.name) || '?'), h('span', { class: 'muted' }, relativeTime(c.updatedAt))))),
    menuButton([
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

function systemRow(s, root) {
  const used = store.charactersUsing(s.id).length;
  const builtin = store.isBuiltin(s.id);
  return h('article', { class: 'sys-row' },
    h('div', { class: 'sys-info' },
      h('h3', {}, t(s.name)),
      h('p', { class: 'card-meta muted' }, used ? t(used === 1 ? '{n} personaggio' : '{n} personaggi', { n: used }) : t('Nessun personaggio'))),
    h('div', { class: 'sys-actions' },
      builtin
        ? btn(t('Nuovo personaggio'), () => newCharacter(s.id), { iconName: 'plus', cls: 'small' })
        : btn(t('Modifica'), () => { location.hash = `#/t/${s.id}`; }, { iconName: 'edit', cls: 'small' }),
      menuButton([
        builtin
          ? { label: t('Duplica e modifica come modello tuo'), icon: 'copy', onClick: () => { const copy = store.duplicateSystem(s.id); location.hash = `#/t/${copy.id}`; } }
          : { label: t('Nuovo personaggio con questo modello'), icon: 'plus', onClick: () => newCharacter(s.id) },
        builtin ? null : { label: t('Duplica'), icon: 'copy', onClick: () => { store.duplicateSystem(s.id); rerender(root); } },
        { label: t('Esporta (.json)'), icon: 'download', onClick: () => download(`modello-${slugify(s.name)}.json`, store.exportSystem(s.id)) },
        builtin ? null : { label: t('Elimina'), icon: 'trash', danger: true, onClick: async () => {
          const msg = used
            ? t('{n} personaggi usano questo modello e non potranno più essere aperti finché non lo reimporti. Continuare?', { n: used })
            : t('Il modello "{nome}" verrà eliminato.', { nome: s.name });
          if (await confirmDialog(t('Eliminare il modello?'), msg, t('Elimina'), true)) { store.deleteSystem(s.id); rerender(root); }
        } },
      ], { title: t('Azioni per {nome}', { nome: t(s.name) }) })));
}

async function newCharacter(preselected) {
  const systems = store.systems();
  const name = h('input', { class: 'input', type: 'text', placeholder: t('es. Elara di Valdombra'), required: true });
  const ordered = [...systems].sort((a, b) => (b.id === 'dnd5e') - (a.id === 'dnd5e') || store.isBuiltin(b.id) - store.isBuiltin(a.id));
  let chosen = [preselected, store.setting('lastSystem'), 'dnd5e'].find((id) => id && store.system(id)) || ordered[0].id;
  const choices = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': t('Scheda') });
  const drawChoices = () => choices.replaceChildren(...ordered.map((s) => h('button', {
    type: 'button', class: 'choice', role: 'radio', 'aria-checked': String(s.id === chosen),
    onclick: () => { chosen = s.id; drawChoices(); },
  }, h('span', { class: 'choice-radio', 'aria-hidden': 'true' }), h('span', { class: 'choice-name' }, t(s.name)),
  store.isBuiltin(s.id) ? null : h('span', { class: 'choice-tag' }, t('tuo modello')))));
  drawChoices();
  const ok = await modal({
    title: t('Nuovo personaggio'),
    body: h('div', { class: 'stack gap' },
      h('label', { class: 'stack' }, h('span', { class: 'lbl' }, t('Nome')), name),
      h('div', { class: 'stack' }, h('span', { class: 'lbl' }, t('Scheda')), choices)),
    actions: [{ label: t('Annulla'), value: false }, { label: t('Crea'), value: true, cls: 'primary' }],
  });
  if (!ok) return;
  store.setSetting('lastSystem', chosen);
  const c = store.createCharacter(chosen, name.value.trim() || t('Senza nome'));
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
    if (r.systems) parts.push(t('{n} modelli', { n: r.systems }));
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
