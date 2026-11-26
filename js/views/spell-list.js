// Finestra "Elenco incantesimi": vedere, cercare, modificare, aggiungere a mano,
// importare ed esportare l'elenco salvato su questo dispositivo.
import { h, icon, btn, modal, toast, confirmDialog, pickFile, download } from '../ui.js';
import { autoGrow } from '../richtext.js';
import {
  loadSpells, saveSpells, clearSpells, spellsFromCSV, spellsToCSV, mergeSpells, sortSpells, blankSpell, SCHOOLS_IT,
} from '../spells.js';

const levelLabel = (n) => (n === 0 ? 'Trucchetto' : `${n}° livello`);

export async function openSpellList() {
  let list = sortSpells(loadSpells() || []);
  let query = '';
  let level = 'tutti';

  const save = (next) => {
    try { saveSpells(sortSpells(next)); list = sortSpells(next); return true; } catch (e) { toast(e.message, 'error', 5000); return false; }
  };

  const count = h('span', { class: 'spl-count' });
  const rowsBox = h('div', { class: 'spl-list' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Cerca per nome…', 'aria-label': 'Cerca incantesimo', oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
  const levelSel = h('select', { class: 'input spl-level', 'aria-label': 'Livello', onchange: (e) => { level = e.target.value; draw(); } },
    h('option', { value: 'tutti' }, 'Tutti i livelli'),
    Array.from({ length: 10 }, (_, n) => h('option', { value: String(n) }, n === 0 ? 'Trucchetti' : `${n}° livello`)));
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); }); // Invio non chiude la finestra

  const draw = () => {
    const shown = list.filter((s) => (level === 'tutti' || s.level === Number(level)) && (!query || s.name.toLowerCase().includes(query)));
    count.textContent = list.length
      ? `${shown.length === list.length ? list.length : `${shown.length} di ${list.length}`} incantesimi`
      : 'Nessun incantesimo';
    if (!list.length) {
      rowsBox.replaceChildren(h('div', { class: 'spl-empty' },
        h('p', {}, 'L\'elenco è vuoto.'),
        h('p', { class: 'muted small' }, 'Importa un file CSV o aggiungi gli incantesimi a mano: poi, scrivendo il nome nella scheda, la riga si compila da sola. L\'elenco resta salvato solo su questo dispositivo.')));
      return;
    }
    rowsBox.replaceChildren(...[
      ...shown.map((s) => h('button', { type: 'button', class: 'spl-row', onclick: () => edit(s) },
        h('span', { class: 'spl-name' }, s.name),
        h('span', { class: 'spl-meta' }, [levelLabel(s.level), s.school].filter(Boolean).join(' · ')))),
      !shown.length ? h('p', { class: 'muted small spl-more' }, 'Nessun incantesimo con questi filtri.') : null,
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
    const school = h('select', { class: 'input', onchange: (e) => { sp.school = e.target.value; } }, schools.map((o) => h('option', { value: o }, o || '—')));
    school.value = sp.school || '';
    const classes = h('input', { class: 'input', type: 'text', value: (sp.classes || []).join(', '), placeholder: 'es. Mago, Stregone' });
    const desc = autoGrow(h('textarea', { class: 'input note-area', rows: 8, value: sp.description || '', placeholder: 'Descrizione…', oninput: (e) => { sp.description = e.target.value; } }), 8);
    const name = text('name', 'es. Palla di fuoco');
    const r = await modal({
      title: isNew ? 'Nuovo incantesimo' : `Modifica: ${orig.name}`,
      wide: true,
      body: h('div', { class: 'spl-form' },
        field('Nome', name, true),
        field('Livello', lvl), field('Scuola', school),
        field('Tempo di lancio', text('castTime', 'es. 1 azione')), field('Gittata', text('range', 'es. 18 m')),
        field('Componenti', text('components', 'es. V, S, M (un pizzico di zolfo)')), field('Durata', text('duration', 'es. Istantanea')),
        field('Classi (separate da virgola)', classes, true),
        field('Descrizione', desc, true)),
      actions: [
        isNew ? null : { label: 'Elimina', value: 'delete', cls: 'danger' },
        { label: 'Annulla', value: null },
        { label: 'Salva', value: 'save', cls: 'primary' },
      ].filter(Boolean),
    });
    if (r === 'delete') {
      if (!(await confirmDialog('Eliminare l\'incantesimo?', `"${orig.name}" verrà tolto dall'elenco. Le schede in cui l'hai già inserito non cambiano.`, 'Elimina', true))) return;
      if (save(list.filter((s) => s !== orig))) { toast('Incantesimo eliminato'); draw(); }
      return;
    }
    if (r !== 'save') return;
    sp.name = sp.name.trim();
    if (!sp.name) { toast('Serve almeno il nome', 'error'); return; }
    sp.classes = classes.value.split(/[,;/]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const next = isNew ? [...list, sp] : list.map((s) => (s === orig ? sp : s));
    if (save(next)) { toast(isNew ? 'Incantesimo aggiunto' : 'Modifiche salvate', 'ok'); draw(); }
  };

  const importCSV = async () => {
    const file = await pickFile('.csv,text/csv');
    if (!file) return;
    let incoming;
    try { incoming = spellsFromCSV(await file.text()); } catch (e) { toast(`File non importato: ${e.message}`, 'error', 5000); return; }
    let mode = 'replace';
    if (list.length) {
      mode = await modal({
        title: 'Importa incantesimi',
        body: h('div', { class: 'stack gap' },
          h('p', {}, `Il file contiene ${incoming.length} incantesimi; nell'elenco ce ne sono già ${list.length}.`),
          h('p', { class: 'muted small' }, '"Aggiungi solo i nuovi" lascia com\'è quello che hai già (anche le tue modifiche e traduzioni) e aggiunge gli incantesimi con un nome che ancora non c\'è.')),
        actions: [
          { label: 'Annulla', value: null },
          { label: 'Sostituisci tutto', value: 'replace' },
          { label: 'Aggiungi solo i nuovi', value: 'merge', cls: 'primary' },
        ],
      });
      if (!mode) return;
    }
    if (mode === 'merge') {
      const r = mergeSpells(list, incoming);
      if (save(r.list)) toast(r.added ? `Aggiunti ${r.added} incantesimi` : 'Nessun incantesimo nuovo da aggiungere', 'ok', 4000);
    } else if (save(incoming)) toast(`Importati ${incoming.length} incantesimi`, 'ok', 4000);
    draw();
  };

  const exportCSV = () => {
    if (!list.length) return toast('L\'elenco è vuoto');
    download(`incantesimi-${new Date().toISOString().slice(0, 10)}.csv`, spellsToCSV(list), 'text/csv;charset=utf-8');
    toast('Elenco esportato');
  };

  const clearAll = async () => {
    if (!list.length) return;
    if (!(await confirmDialog('Svuotare l\'elenco?', `Verranno tolti tutti i ${list.length} incantesimi da questo dispositivo, comprese le tue modifiche. Le schede non cambiano. Se vuoi tenerne una copia, prima esportalo in CSV.`, 'Svuota', true))) return;
    clearSpells();
    list = [];
    toast('Elenco svuotato');
    draw();
  };

  draw();
  await modal({
    title: 'Elenco incantesimi',
    wide: true,
    body: h('div', { class: 'spl' },
      h('div', { class: 'spl-tools' },
        btn('Nuovo incantesimo', () => edit(null), { iconName: 'plus', cls: 'small primary' }),
        btn('Importa CSV', importCSV, { iconName: 'upload', cls: 'small' }),
        btn('Esporta CSV', exportCSV, { iconName: 'download', cls: 'small' }),
        btn('Svuota', clearAll, { iconName: 'trash', cls: 'small ghost danger' })),
      h('div', { class: 'spl-filters' }, search, levelSel),
      count,
      rowsBox,
      h('p', { class: 'muted small spl-note' }, icon('book'), ' Salvato solo su questo dispositivo: per usarlo anche sul telefono esportalo e importalo lì.')),
    actions: [{ label: 'Chiudi', value: true, cls: 'primary' }],
  });
}
