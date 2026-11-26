// Editor visuale dei modelli (sezioni, campi, formule) con anteprima e JSON.
import { h, icon, btn, toast, confirmDialog, download, menuButton, slugify, uid, debounce } from '../ui.js';
import { store } from '../store.js';
import { FIELD_TYPES, COLUMN_TYPES, KEY_RE, allFields, validateSystem } from '../engine.js';
import { syntaxError } from '../formula.js';
import { renderSheet } from '../sheet-render.js';
import { themeToggle } from '../theme.js';

const OPT = {
  default: { label: 'Valore iniziale', kind: 'default' },
  placeholder: { label: 'Testo di esempio (segnaposto)', kind: 'text' },
  formula: { label: 'Formula', kind: 'formula', ph: 'es. floor((@forza - 10) / 2)' },
  mod: { label: 'Formula del modificatore', kind: 'formula', ph: 'es. floor((@this - 10) / 2)' },
  max: { label: 'Massimo (numero o formula)', kind: 'formula', ph: 'es. 10 oppure @livello * 8' },
  sub: { label: 'Testo secondario', kind: 'text', ph: 'es. ½ {floor(@this/2)}', help: 'Le parti tra {graffe} sono formule.' },
  signed: { label: 'Mostra il segno (+2 / −1)', kind: 'bool' },
  levels: { label: 'Livelli di competenza (1 = sì/no, 2 = con maestria…)', kind: 'number' },
  options: { label: 'Opzioni (una per riga)', kind: 'lines' },
  rows: { label: 'Altezza (righe)', kind: 'number' },
  columns: { label: 'Colonne', kind: 'columns' },
  showIf: { label: 'Visibile solo se (formula)', kind: 'formula', ph: 'es. @multiclasse' },
  tile: { label: 'Mostralo come tessera (valore grande e centrato)', kind: 'bool' },
  variant: { label: 'Stile', kind: 'select', options: [['', 'Privilegi (usi, contatori, sotto-voci)'], ['journal', 'Diario (titolo e testo, nuove voci in cima)']] },
  menu: { label: 'Mostrala nel menu ⋯ della scheda invece che nella griglia (es. multiclasse)', kind: 'bool' },
  rowSpan: { label: 'Altezza nella griglia (righe occupate, su desktop)', kind: 'number' },
  weight: { label: 'Fa parte del peso/ingombro (nascosto se il personaggio lo disattiva)', kind: 'bool' },
};

const BASE_TYPE_OPTS = {
  text: ['default', 'placeholder'],
  textarea: ['default', 'rows', 'placeholder'],
  number: ['default', 'sub'],
  stat: ['default', 'mod', 'sub'],
  computed: ['formula', 'signed', 'sub'],
  skill: ['formula', 'levels', 'signed'],
  resource: ['max'],
  dots: ['max', 'default'],
  checkbox: ['default', 'menu'],
  select: ['options', 'default'],
  list: ['columns'],
  features: ['variant', 'placeholder'],
  richtext: ['default', 'rows', 'placeholder'],
  image: [],
};
// Opzioni comuni a tutti i tipi di campo.
const TYPE_OPTS = Object.fromEntries(Object.entries(BASE_TYPE_OPTS).map(([k, v]) => [k, [...v, 'tile', 'showIf', 'weight', 'rowSpan']]));

const TYPE_HINTS = {
  stat: 'Nelle formule: @chiave è il valore, @chiave_mod il modificatore. Dentro "modificatore", @this è il valore.',
  skill: 'Il giocatore sceglie il livello di competenza (pallini). Dentro la formula @this è il livello.',
  resource: 'Il valore attuale si legge con @chiave, il massimo con @chiave_max.',
  list: 'Nelle formule delle colonne usa @row.colonna. Altrove @chiave.colonna dà l\'elenco dei valori, es. sum(@inventario.peso). Le colonne "Note" aprono una finestra a comparsa.',
  computed: 'Valore di sola lettura calcolato dalla formula.',
  features: 'Elenco di privilegi che si aprono e chiudono, con descrizione, usi (caselle) e sotto-privilegi. Il menu della scheda ha Riposo breve / lungo per recuperare gli usi.',
  dots: 'Pallini cliccabili da 0 al massimo indicato.',
};

const NUMERIC = new Set(['number', 'stat', 'dots', 'skill']);

export function renderEditor(root, id) {
  const original = store.system(id);
  if (!original) {
    root.append(h('main', { class: 'empty' }, h('h1', {}, 'Modello non trovato'), h('a', { class: 'btn', href: '#/' }, 'Torna alla home')));
    return;
  }
  if (store.isBuiltin(id)) {
    root.append(h('main', { class: 'empty' },
      h('h1', {}, original.name),
      h('p', {}, 'I modelli inclusi sono di sola lettura. Creane una copia da modificare.'),
      btn('Duplica e modifica', () => { const c = store.duplicateSystem(id); location.hash = `#/t/${c.id}`; }, { cls: 'primary', iconName: 'copy' })));
    return;
  }

  const snapshot = structuredClone(original);
  let draft = structuredClone(original);
  const previewValues = {};
  const autoKey = new WeakSet();
  const openDetails = new WeakSet();
  document.title = `Modello: ${draft.name} · Schede GdR`;

  // ---- salvataggio automatico ------------------------------------------
  const status = h('span', { class: 'save-status muted' }, 'Salvato');
  const problemsBox = h('div', { class: 'problems', hidden: true });
  const saveNow = () => {
    store.saveSystem(draft);
    status.textContent = 'Salvato';
    const problems = validateSystem(draft);
    problemsBox.hidden = problems.length === 0;
    problemsBox.replaceChildren(
      h('strong', {}, icon('alert'), ` ${problems.length} ${problems.length === 1 ? 'problema' : 'problemi'} nel modello`),
      h('ul', {}, problems.slice(0, 12).map((p) => h('li', {}, p)), problems.length > 12 ? h('li', {}, `…e altri ${problems.length - 12}`) : null));
  };
  const saveLater = debounce(saveNow, 400);
  const refreshPreview = debounce(() => drawPreview(), 350);
  const changed = (structural = false) => {
    status.textContent = 'Salvataggio…';
    saveLater();
    if (structural) drawStructure();
    refreshPreview();
  };

  // ---- barra superiore -------------------------------------------------
  const nameInput = h('input', { class: 'title-input', value: draft.name, 'aria-label': 'Nome del modello', oninput: (e) => { draft.name = e.target.value; changed(); } });
  const header = h('header', { class: 'topbar sheet-top' },
    h('a', { href: '#/', class: 'btn ghost sq', 'aria-label': 'Indietro' }, icon('back')),
    h('div', { class: 'title-wrap' }, nameInput, status),
    h('div', { class: 'topbar-actions' },
      themeToggle(),
      menuButton([
        { label: 'Esporta modello (.json)', icon: 'download', onClick: () => { saveNow(); download(`modello-${slugify(draft.name)}.json`, store.exportSystem(draft.id)); } },
        { label: 'Annulla tutte le modifiche di questa sessione', icon: 'back', onClick: async () => {
          if (await confirmDialog('Annullare le modifiche?', 'Il modello tornerà com\'era quando hai aperto l\'editor.', 'Ripristina')) {
            draft = structuredClone(snapshot); nameInput.value = draft.name; saveNow(); drawAll();
          }
        } },
      ], { title: 'Altre azioni' })));

  // ---- pannelli ----------------------------------------------------------
  const structurePanel = h('div', { class: 'ed-structure' });
  const previewPanel = h('div', { class: 'ed-preview' });
  const jsonPanel = h('div', { class: 'ed-json', hidden: true });
  const body = h('div', { class: 'ed-body split' }, structurePanel, previewPanel, jsonPanel);

  const modes = [['struttura', 'Struttura'], ['anteprima', 'Anteprima'], ['json', 'JSON']];
  const modeBar = h('nav', { class: 'tabs ed-modes', role: 'tablist' });
  const setMode = (m) => {
    body.dataset.mode = m;
    structurePanel.hidden = m === 'json' || m === 'anteprima';
    previewPanel.hidden = m === 'json';
    jsonPanel.hidden = m !== 'json';
    body.classList.toggle('split', m === 'struttura');
    body.classList.toggle('preview-only', m === 'anteprima');
    [...modeBar.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    if (m === 'json') drawJson();
    if (m !== 'json') drawPreview();
  };
  modes.forEach(([m, l]) => modeBar.append(h('button', { type: 'button', role: 'tab', class: 'tab', dataset: { mode: m }, onclick: () => setMode(m) }, l)));

  // ---- struttura -------------------------------------------------------
  const existingKeys = (except) => new Set(allFields(draft).filter((f) => f !== except).map((f) => f.key));
  const uniqueKey = (base, except) => {
    const keys = existingKeys(except);
    let k = slugify(base);
    let i = 2;
    while (keys.has(k)) k = `${slugify(base)}_${i++}`;
    return k;
  };
  const move = (arr, i, d) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    changed(true);
  };

  function drawStructure() {
    const scrollY = window.scrollY;
    structurePanel.replaceChildren(
      h('label', { class: 'stack' }, h('span', { class: 'lbl' }, 'Descrizione'),
        h('textarea', { class: 'input', rows: 2, value: draft.description || '', placeholder: 'A quale gioco serve questo modello?', oninput: (e) => { draft.description = e.target.value; changed(); } })),
      helpBox(),
      ...draft.sections.map((s, si) => sectionEditor(s, si)),
      btn('Aggiungi sezione', () => {
        draft.sections.push({ id: uid(), title: 'Nuova sezione', columns: 3, fields: [] });
        changed(true);
      }, { iconName: 'plus', cls: 'add-section' }));
    window.scrollTo(0, scrollY);
  }

  function sectionEditor(s, si) {
    s.fields ||= [];
    const colsSel = h('select', { class: 'input', 'aria-label': 'Colonne', onchange: (e) => { s.columns = Number(e.target.value); changed(true); } },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('option', { value: n }, `${n} col.`)));
    colsSel.value = String(s.columns || 3);
    return h('div', { class: 'ed-sec' },
      h('div', { class: 'ed-sec-head' },
        h('input', { class: 'input ed-sec-title', value: s.title || '', placeholder: 'Titolo sezione', 'aria-label': 'Titolo sezione', oninput: (e) => { s.title = e.target.value; changed(); } }),
        h('input', { class: 'input ed-sec-tab', value: s.tab || '', placeholder: 'Scheda (tab)', title: 'Le sezioni con lo stesso nome di scheda vengono raggruppate in una tab', 'aria-label': 'Tab', oninput: (e) => { s.tab = e.target.value || undefined; changed(); } }),
        colsSel,
        h('div', { class: 'ed-tools' },
          btn('', () => move(draft.sections, si, -1), { iconName: 'up', title: 'Sposta su', cls: 'ghost sq small' }),
          btn('', () => move(draft.sections, si, 1), { iconName: 'down', title: 'Sposta giù', cls: 'ghost sq small' }),
          btn('', async () => {
            if (s.fields.length && !(await confirmDialog('Eliminare la sezione?', `"${s.title}" contiene ${s.fields.length} campi.`, 'Elimina', true))) return;
            draft.sections.splice(si, 1); changed(true);
          }, { iconName: 'trash', title: 'Elimina sezione', cls: 'ghost sq small danger' }))),
      h('label', { class: 'check ed-sec-tiles' }, h('input', { type: 'checkbox', checked: !!s.tiles, onchange: (e) => { if (e.target.checked) s.tiles = true; else delete s.tiles; changed(); } }), h('span', {}, 'Campi come tessere (valori grandi e centrati)')),
      h('label', { class: 'check ed-sec-tiles' }, h('input', { type: 'checkbox', checked: !!s.customizable, onchange: (e) => { if (e.target.checked) s.customizable = true; else delete s.customizable; changed(); } }), h('span', {}, 'Il giocatore può rinominare e nascondere i campi (⚙)')),
      h('details', { class: 'ed-sec-more' }, h('summary', {}, 'Condizione di visibilità'),
        formulaInput('Sezione visibile solo se (formula, vuoto = sempre)', s.showIf, 'es. @multiclasse', (v) => { if (v) s.showIf = v; else delete s.showIf; changed(); })),
      h('div', { class: 'ed-fields' }, s.fields.map((f, fi) => fieldEditor(s, f, fi))),
      btn('Aggiungi campo', () => {
        const f = { key: uniqueKey('campo'), label: '', type: 'text' };
        autoKey.add(f);
        openDetails.add(f);
        s.fields.push(f);
        changed(true);
        requestAnimationFrame(() => structurePanel.querySelector(`[data-fkey="${f.key}"] .ed-f-label`)?.focus());
      }, { iconName: 'plus', cls: 'ghost small' }));
  }

  function fieldEditor(s, f, fi) {
    const keyInput = h('input', {
      class: 'input mono ed-f-key', value: f.key || '', 'aria-label': 'Chiave', title: 'Chiave usata nelle formule (@chiave)', spellcheck: 'false',
      oninput: (e) => { autoKey.delete(f); f.key = e.target.value.trim(); markKey(); changed(); },
    });
    const markKey = () => {
      const bad = !KEY_RE.test(f.key || '') || existingKeys(f).has(f.key);
      keyInput.classList.toggle('invalid', bad);
    };
    markKey();
    const typeSel = h('select', { class: 'input', 'aria-label': 'Tipo', onchange: (e) => {
      f.type = e.target.value;
      if (f.type === 'list' && !f.columns) f.columns = [{ key: 'nome', label: 'Nome', type: 'text', width: 2 }, { key: 'valore', label: 'Valore', type: 'number' }];
      if (f.type === 'select' && !f.options) f.options = ['Opzione A', 'Opzione B'];
      if (f.type === 'stat' && !f.mod) f.mod = 'floor((@this - 10) / 2)';
      if (f.type === 'skill' && !f.formula) f.formula = '@this';
      if (f.type === 'resource' && !f.max) f.max = '10';
      if (f.type === 'dots' && !f.max) f.max = 5;
      openDetails.add(f);
      changed(true);
    } }, Object.entries(FIELD_TYPES).map(([k, t]) => h('option', { value: k }, t.label)));
    typeSel.value = f.type;
    const cols = s.columns || 3;
    const spanSel = h('select', { class: 'input ed-f-span', 'aria-label': 'Larghezza', title: 'Quante colonne occupa', onchange: (e) => { f.span = Number(e.target.value) || undefined; changed(); } },
      h('option', { value: '' }, 'auto'),
      Array.from({ length: cols }, (_, i) => h('option', { value: i + 1 }, `${i + 1}/${cols}`)));
    spanSel.value = f.span ? String(f.span) : '';

    const details = h('div', { class: 'ed-f-details', hidden: !openDetails.has(f) });
    const drawDetails = () => details.replaceChildren(...[
      TYPE_HINTS[f.type] ? h('p', { class: 'hint' }, TYPE_HINTS[f.type]) : null,
      ...(TYPE_OPTS[f.type] || []).map((opt) => optionInput(f, opt)),
    ].filter(Boolean));
    drawDetails();

    return h('div', { class: 'ed-field', dataset: { fkey: f.key } },
      h('div', { class: 'ed-f-main' },
        h('input', { class: 'input ed-f-label', value: f.label || '', placeholder: 'Etichetta', 'aria-label': 'Etichetta', oninput: (e) => {
          f.label = e.target.value;
          if (autoKey.has(f)) { f.key = uniqueKey(f.label || 'campo', f); keyInput.value = f.key; markKey(); }
          changed();
        } }),
        keyInput, typeSel, spanSel,
        h('div', { class: 'ed-tools' },
          btn('', () => {
            details.hidden = !details.hidden;
            if (details.hidden) openDetails.delete(f); else openDetails.add(f);
          }, { iconName: 'gear', title: 'Opzioni', cls: 'ghost sq small' }),
          btn('', () => move(s.fields, fi, -1), { iconName: 'up', title: 'Sposta su', cls: 'ghost sq small' }),
          btn('', () => move(s.fields, fi, 1), { iconName: 'down', title: 'Sposta giù', cls: 'ghost sq small' }),
          btn('', () => { s.fields.splice(fi, 1); changed(true); }, { iconName: 'trash', title: 'Elimina campo', cls: 'ghost sq small danger' }))),
      details);
  }

  function optionInput(f, opt) {
    const def = OPT[opt];
    const setProp = (v) => {
      if (v === '' || v === undefined || v === null || (Array.isArray(v) && !v.length)) delete f[opt]; else f[opt] = v;
      changed();
    };
    const lbl = h('span', { class: 'lbl' }, def.label);
    switch (def.kind) {
      case 'bool':
        return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!f[opt], onchange: (e) => setProp(e.target.checked || undefined) }), h('span', {}, def.label));
      case 'number':
        return h('label', { class: 'stack' }, lbl, h('input', { type: 'number', class: 'input num', value: f[opt] ?? '', oninput: (e) => setProp(e.target.value === '' ? '' : Number(e.target.value)) }));
      case 'select': {
        const sel = h('select', { class: 'input', onchange: (e) => setProp(e.target.value) }, def.options.map(([v, l]) => h('option', { value: v }, l)));
        sel.value = f[opt] || '';
        return h('label', { class: 'stack' }, lbl, sel);
      }
      case 'lines':
        return h('label', { class: 'stack' }, lbl, h('textarea', { class: 'input', rows: 4, value: (f[opt] || []).join('\n'), oninput: (e) => setProp(e.target.value.split('\n').map((x) => x.trim()).filter((x, i, a) => x || i < a.length - 1)) }));
      case 'formula':
        return formulaInput(def.label, f[opt], def.ph, (v) => setProp(v));
      case 'default': {
        if (f.type === 'checkbox') {
          return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!f.default, onchange: (e) => setProp(e.target.checked || undefined) }), h('span', {}, 'Spuntata all\'inizio'));
        }
        if (f.type === 'textarea') {
          return h('label', { class: 'stack' }, lbl, h('textarea', { class: 'input', rows: 2, value: f.default ?? '', oninput: (e) => setProp(e.target.value) }));
        }
        const numeric = NUMERIC.has(f.type);
        return h('label', { class: 'stack' }, lbl, h('input', {
          type: numeric ? 'number' : 'text', class: `input${numeric ? ' num' : ''}`, value: f.default ?? '',
          oninput: (e) => setProp(numeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value),
        }));
      }
      case 'columns':
        return columnsEditor(f);
      default:
        return h('label', { class: 'stack' }, lbl,
          h('input', { type: 'text', class: 'input', value: f[opt] ?? '', placeholder: def.ph || '', oninput: (e) => setProp(e.target.value) }),
          def.help ? h('small', { class: 'hint' }, def.help) : null);
    }
  }

  function formulaInput(labelText, value, ph, onSet) {
    const state = h('span', { class: 'formula-state' });
    const check = (v) => {
      const err = v ? syntaxError(v) : null;
      state.textContent = err ? `⚠ ${err}` : '';
      state.classList.toggle('bad', !!err);
    };
    const input = h('input', { type: 'text', class: 'input mono', value: value ?? '', placeholder: ph || '', spellcheck: 'false', autocapitalize: 'off',
      oninput: (e) => { check(e.target.value); onSet(e.target.value.trim()); } });
    check(value);
    return h('label', { class: 'stack' }, h('span', { class: 'lbl' }, labelText), input, state);
  }

  function columnsEditor(f) {
    f.columns ||= [];
    const box = h('div', { class: 'ed-cols' });
    const draw = () => box.replaceChildren(
      h('span', { class: 'lbl' }, 'Colonne della lista'),
      ...f.columns.map((c, ci) => {
        const typeSel = h('select', { class: 'input', 'aria-label': 'Tipo colonna', onchange: (e) => { c.type = e.target.value; draw(); changed(); } },
          Object.entries(COLUMN_TYPES).map(([k, l]) => h('option', { value: k }, l)));
        typeSel.value = c.type || 'text';
        const keyIn = h('input', { class: 'input mono', value: c.key || '', placeholder: 'chiave', 'aria-label': 'Chiave colonna', spellcheck: 'false', oninput: (e) => { c.key = e.target.value.trim(); changed(); } });
        return h('div', { class: 'ed-col' },
          h('div', { class: 'ed-col-main' },
            h('input', { class: 'input', value: c.label || '', placeholder: 'Intestazione', 'aria-label': 'Intestazione', oninput: (e) => {
              const wasAuto = !c.key || c.key === slugify(c.label || '');
              c.label = e.target.value;
              if (wasAuto) { c.key = slugify(c.label); keyIn.value = c.key; }
              changed();
            } }),
            keyIn,
            typeSel,
            h('input', { type: 'number', class: 'input num', min: 1, max: 6, value: c.width ?? '', placeholder: 'larg.', title: 'Larghezza relativa', 'aria-label': 'Larghezza', oninput: (e) => { c.width = Number(e.target.value) || undefined; changed(); } }),
            btn('', () => { move(f.columns, ci, -1); }, { iconName: 'up', title: 'Sposta a sinistra', cls: 'ghost sq small' }),
            btn('', () => { f.columns.splice(ci, 1); draw(); changed(); }, { iconName: 'x', title: 'Elimina colonna', cls: 'ghost sq small danger' })),
          c.type === 'computed' ? formulaInput('Formula della colonna', c.formula, 'es. @row.qta * @row.peso', (v) => { c.formula = v; changed(); }) : null,
          c.type === 'select' ? h('label', { class: 'stack' }, h('span', { class: 'lbl' }, 'Opzioni (una per riga)'),
            h('textarea', { class: 'input', rows: 3, value: (c.options || []).join('\n'), oninput: (e) => { c.options = e.target.value.split('\n').map((x) => x.trim()); changed(); } })) : null,
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!c.weight, onchange: (e) => { if (e.target.checked) c.weight = true; else delete c.weight; changed(); } }), h('span', {}, 'Colonna del peso (nascosta se il personaggio disattiva il peso)')));
      }),
      btn('Aggiungi colonna', () => { f.columns.push({ key: `col${f.columns.length + 1}`, label: '', type: 'text' }); draw(); changed(); }, { iconName: 'plus', cls: 'ghost small' }));
    draw();
    return box;
  }

  // ---- anteprima ---------------------------------------------------------
  function drawPreview() {
    if (previewPanel.hidden) return;
    try {
      const sheet = renderSheet({ system: structuredClone(draft), values: previewValues, options: { weight: true, menuFields: true } });
      previewPanel.replaceChildren(h('div', { class: 'preview-label muted' }, 'Anteprima — i valori inseriti qui non vengono salvati'), sheet.el);
    } catch (e) {
      previewPanel.replaceChildren(h('p', { class: 'problems' }, `Anteprima non disponibile: ${e.message}`));
    }
  }

  // ---- JSON --------------------------------------------------------------
  function drawJson() {
    const ta = h('textarea', { class: 'input mono json-area', spellcheck: 'false', value: JSON.stringify(draft, null, 2) });
    const err = h('p', { class: 'formula-state bad' });
    jsonPanel.replaceChildren(
      h('p', { class: 'muted' }, 'Modifica direttamente la definizione del modello. Utile per copiare blocchi interi o incollare un modello condiviso. Il formato è descritto in docs/FORMATO_MODELLI.md.'),
      ta, err,
      h('div', { class: 'row gap' },
        btn('Applica JSON', () => {
          try {
            const parsed = JSON.parse(ta.value);
            if (!Array.isArray(parsed.sections)) throw new Error('Manca l\'elenco "sections"');
            parsed.id = draft.id; // l'id non cambia
            delete parsed.builtin;
            draft = parsed;
            nameInput.value = draft.name || '';
            saveNow();
            drawStructure();
            err.textContent = '';
            toast('JSON applicato', 'ok');
          } catch (e) { err.textContent = `JSON non valido: ${e.message}`; }
        }, { cls: 'primary' }),
        btn('Copia', async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copiato'); } catch { ta.select(); } }, { cls: 'ghost' })));
  }

  function drawAll() { drawStructure(); drawPreview(); }

  root.append(header, h('main', { class: 'editor' }, problemsBox, modeBar, body));
  drawStructure();
  setMode('struttura');
  saveNow();
}

function helpBox() {
  const ex = (code, text) => h('li', {}, h('code', {}, code), ` — ${text}`);
  return h('details', { class: 'help' },
    h('summary', {}, 'Guida rapida alle formule'),
    h('ul', {},
      ex('@forza', 'valore del campo con chiave "forza"'),
      ex('@forza_mod', 'modificatore di una caratteristica'),
      ex('@pf_max', 'massimo di una risorsa'),
      ex('@this', 'il campo stesso (nelle sue formule)'),
      ex('floor((@this - 10) / 2)', 'arrotonda per difetto'),
      ex('if(@livello >= 5, 3, 2)', 'condizione: se vero, se falso'),
      ex('@classe == "Mago"', 'confronto con un testo (scelte)'),
      ex('sum(@inventario.peso)', 'somma una colonna di una lista'),
      ex('min(…) max(…) round(…) ceil(…) abs(…) clamp(x, lo, hi)', 'altre funzioni'),
      ex('concat(" · ", @classe)', 'unisce testi (utile nei titoli: "Incantesimi {@classe}")'),
      ex('@multiclasse', 'in "visibile solo se": mostra il campo o la sezione solo quando la casella è spuntata')));
}
