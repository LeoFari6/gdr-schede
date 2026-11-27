// Finestra "Elenco incantesimi": vedere, cercare, modificare, aggiungere a mano,
// importare ed esportare l'elenco salvato su questo dispositivo.
import { h, icon, btn, modal, toast, confirmDialog, pickFile, download } from '../ui.js';
import { autoGrow } from '../richtext.js';
import { t } from '../i18n.js';
import {
  loadSpells, saveSpells, clearSpells, spellsFromCSV, spellsToCSV, mergeSpells, sortSpells, blankSpell, SCHOOLS_IT,
} from '../spells.js';

const levelLabel = (n) => (n === 0 ? t('Trucchetto') : t('{n}° livello', { n }));

export async function openSpellList() {
  let list = sortSpells(loadSpells() || []);
  let query = '';
  let level = 'tutti';

  const save = (next) => {
    try { saveSpells(sortSpells(next)); list = sortSpells(next); return true; } catch (e) { toast(e.message, 'error', 5000); return false; }
  };

  const count = h('span', { class: 'spl-count' });
  const rowsBox = h('div', { class: 'spl-list' });
  const search = h('input', { class: 'input', type: 'search', placeholder: t('Cerca per nome…'), 'aria-label': t('Cerca incantesimo'), oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
  const levelSel = h('select', { class: 'input spl-level', 'aria-label': t('Livello'), onchange: (e) => { level = e.target.value; draw(); } },
    h('option', { value: 'tutti' }, t('Tutti i livelli')),
    Array.from({ length: 10 }, (_, n) => h('option', { value: String(n) }, n === 0 ? t('Trucchetti') : t('{n}° livello', { n }))));
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); }); // Invio non chiude la finestra

  const draw = () => {
    const shown = list.filter((s) => (level === 'tutti' || s.level === Number(level)) && (!query || s.name.toLowerCase().includes(query)));
    count.textContent = list.length
      ? (shown.length === list.length ? t('{n} incantesimi', { n: list.length }) : t('{n} di {tot} incantesimi', { n: shown.length, tot: list.length }))
      : t('Nessun incantesimo');
    if (!list.length) {
      rowsBox.replaceChildren(h('div', { class: 'spl-empty' },
        h('p', {}, t('L\'elenco è vuoto.')),
        h('p', { class: 'muted small' }, t('Importa un file CSV o aggiungi gli incantesimi a mano: poi, scrivendo il nome nella scheda, la riga si compila da sola. L\'elenco resta salvato solo su questo dispositivo.'))));
      return;
    }
    rowsBox.replaceChildren(...[
      ...shown.map((s) => h('button', { type: 'button', class: 'spl-row', onclick: () => edit(s) },
        h('span', { class: 'spl-name' }, s.name),
        h('span', { class: 'spl-meta' }, [levelLabel(s.level), t(s.school)].filter(Boolean).join(' · ')))),
      !shown.length ? h('p', { class: 'muted small spl-more' }, t('Nessun incantesimo con questi filtri.')) : null,
    ].filter(Boolean)); // replaceChildren scriverebbe "null" come testo
  };

  // modifica (o creazione) di un incantesimo
  const edit = async (orig) => {
    const isNew = !orig;
    const sp = { ...blankSpell(), ...(orig || {}) };
    const field = (label, el, wide) => h('label', { class: `stack${wide ? ' spl-wide' : ''}` }, h('span', { class: 'lbl' }, label), el);
    const text = (key, ph) => h('input', { class: 'input', type: 'text', value: sp[key] ?? '', placeholder: ph || '', oninput: (e) => { sp[key] = e.target.value; } });
    const lvl = h('select', { class: 'input', onchange: (e) => { sp.level = Number(e.target.value); } },
      Array.from({ length: 10 }, (_, n) => h('option', { value: String(n) }, levelLabel(n))));
    lvl.value = String(sp.level);
    const schools = SCHOOLS_IT.includes(sp.school) || !sp.school ? ['', ...SCHOOLS_IT] : ['', sp.school, ...SCHOOLS_IT];
    const school = h('select', { class: 'input', onchange: (e) => { sp.school = e.target.value; } }, schools.map((o) => h('option', { value: o }, t(o) || '—')));
    school.value = sp.school || '';
    const classes = h('input', { class: 'input', type: 'text', value: (sp.classes || []).join(', '), placeholder: t('es. Mago, Stregone') });
    const desc = autoGrow(h('textarea', { class: 'input note-area', rows: 8, value: sp.description || '', placeholder: t('Descrizione…'), oninput: (e) => { sp.description = e.target.value; } }), 8);
    const name = text('name', t('es. Palla di fuoco'));
    const r = await modal({
      title: isNew ? t('Nuovo incantesimo') : t('Modifica: {nome}', { nome: orig.name }),
      wide: true,
      body: h('div', { class: 'spl-form' },
        field(t('Nome'), name, true),
        field(t('Livello'), lvl), field(t('Scuola'), school),
        field(t('Tempo di lancio'), text('castTime', t('es. 1 azione'))), field(t('Gittata'), text('range', t('es. 18 m'))),
        field(t('Componenti'), text('components', t('es. V, S, M (un pizzico di zolfo)'))), field(t('Durata'), text('duration', t('es. Istantanea'))),
        field(t('Classi (separate da virgola)'), classes, true),
        field(t('Descrizione'), desc, true)),
      actions: [
        isNew ? null : { label: t('Elimina'), value: 'delete', cls: 'danger' },
        { label: t('Annulla'), value: null },
        { label: t('Salva'), value: 'save', cls: 'primary' },
      ].filter(Boolean),
    });
    if (r === 'delete') {
      if (!(await confirmDialog(t('Eliminare l\'incantesimo?'), t('"{nome}" verrà tolto dall\'elenco. Le schede in cui l\'hai già inserito non cambiano.', { nome: orig.name }), t('Elimina'), true))) return;
      if (save(list.filter((s) => s !== orig))) { toast(t('Incantesimo eliminato')); draw(); }
      return;
    }
    if (r !== 'save') return;
    sp.name = sp.name.trim();
    if (!sp.name) { toast(t('Serve almeno il nome'), 'error'); return; }
    sp.classes = classes.value.split(/[,;/]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const next = isNew ? [...list, sp] : list.map((s) => (s === orig ? sp : s));
    if (save(next)) { toast(isNew ? t('Incantesimo aggiunto') : t('Modifiche salvate'), 'ok'); draw(); }
  };

  const importCSV = async () => {
    const file = await pickFile('.csv,text/csv');
    if (!file) return;
    let incoming;
    try { incoming = spellsFromCSV(await file.text()); } catch (e) { toast(t('File non importato: {err}', { err: e.message }), 'error', 5000); return; }
    let mode = 'replace';
    if (list.length) {
      mode = await modal({
        title: t('Importa incantesimi'),
        body: h('div', { class: 'stack gap' },
          h('p', {}, t('Il file contiene {n} incantesimi; nell\'elenco ce ne sono già {tot}.', { n: incoming.length, tot: list.length })),
          h('p', { class: 'muted small' }, t('"Aggiungi solo i nuovi" lascia com\'è quello che hai già (anche le tue modifiche e traduzioni) e aggiunge gli incantesimi con un nome che ancora non c\'è.'))),
        actions: [
          { label: t('Annulla'), value: null },
          { label: t('Sostituisci tutto'), value: 'replace' },
          { label: t('Aggiungi solo i nuovi'), value: 'merge', cls: 'primary' },
        ],
      });
      if (!mode) return;
    }
    if (mode === 'merge') {
      const r = mergeSpells(list, incoming);
      if (save(r.list)) toast(r.added ? t('Aggiunti {n} incantesimi', { n: r.added }) : t('Nessun incantesimo nuovo da aggiungere'), 'ok', 4000);
    } else if (save(incoming)) toast(t('Importati {n} incantesimi', { n: incoming.length }), 'ok', 4000);
    draw();
  };

  const exportCSV = () => {
    if (!list.length) return toast(t('L\'elenco è vuoto'));
    download(`incantesimi-${new Date().toISOString().slice(0, 10)}.csv`, spellsToCSV(list), 'text/csv;charset=utf-8');
    toast(t('Elenco esportato'));
  };

  const clearAll = async () => {
    if (!list.length) return;
    if (!(await confirmDialog(t('Svuotare l\'elenco?'), t('Verranno tolti tutti i {n} incantesimi da questo dispositivo, comprese le tue modifiche. Le schede non cambiano. Se vuoi tenerne una copia, prima esportalo in CSV.', { n: list.length }), t('Svuota'), true))) return;
    clearSpells();
    list = [];
    toast(t('Elenco svuotato'));
    draw();
  };

  draw();
  await modal({
    title: t('Elenco incantesimi'),
    wide: true,
    body: h('div', { class: 'spl' },
      h('div', { class: 'spl-tools' },
        btn(t('Nuovo incantesimo'), () => edit(null), { iconName: 'plus', cls: 'small primary' }),
        btn(t('Importa CSV'), importCSV, { iconName: 'upload', cls: 'small' }),
        btn(t('Esporta CSV'), exportCSV, { iconName: 'download', cls: 'small' }),
        btn(t('Svuota'), clearAll, { iconName: 'trash', cls: 'small ghost danger' })),
      h('div', { class: 'spl-filters' }, search, levelSel),
      count,
      rowsBox,
      h('p', { class: 'muted small spl-note' }, icon('book'), ' ' + t('Salvato solo su questo dispositivo: per usarlo anche sul telefono esportalo e importalo lì.'))),
    actions: [{ label: t('Chiudi'), value: true, cls: 'primary' }],
  });
}
