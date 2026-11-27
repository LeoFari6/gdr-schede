import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluate, compile, interpolate, formatValue, FormulaError } from '../js/formula.js';
import { Engine, validateSystem, hasWeight, normalizeFeature, resetFeatureUses, counterMax, applyRest } from '../js/engine.js';
import { BUILTIN_SYSTEMS } from '../js/systems.js';
import { parseCSV, spellsFromCSV, searchSpells, spellsToCSV, mergeSpells } from '../js/spells.js';
import { imageIdsIn, IMG_LINE } from '../js/images.js';

const calc = (src, vars = {}) => evaluate(compile(src), { resolve: (n) => {
  if (!(n in vars)) throw new FormulaError(`Campo @${n} inesistente`);
  return vars[n];
} });

test('aritmetica e precedenza', () => {
  assert.equal(calc('1 + 2 * 3'), 7);
  assert.equal(calc('(1 + 2) * 3'), 9);
  assert.equal(calc('2 ^ 3 ^ 2'), 512);
  assert.equal(calc('-2 ^ 2'), -4);
  assert.equal(calc('10 / 4'), 2.5);
  assert.equal(calc('7 % 3'), 1);
  assert.equal(calc('5 / 0'), 0);
  assert.equal(calc(''), 0);
});

test('funzioni', () => {
  assert.equal(calc('floor((15 - 10) / 2)'), 2);
  assert.equal(calc('floor((8 - 10) / 2)'), -1);
  assert.equal(calc('max(1, 5, 3)'), 5);
  assert.equal(calc('clamp(12, 0, 10)'), 10);
  assert.equal(calc('if(1 > 2, 10, 20)'), 20);
  assert.equal(calc('sum(@a)', { a: [1, 2, 3] }), 6);
  assert.equal(calc('count(@a)', { a: ['x', '', 'y'] }), 2);
  assert.equal(calc('concat(" · ", @c, 2.5)', { c: 'Mago' }), ' · Mago2,5');
});

test('stringhe e confronti', () => {
  assert.equal(calc('@cls == "Mago"', { cls: 'mago' }), 1);
  assert.equal(calc('if(@x <= 64, "-2", "0")', { x: 50 }), '-2');
  assert.equal(calc('!0 && (1 || 0)'), 1);
});

test('errori leggibili', () => {
  assert.throws(() => parse('1 +'), /incompleta/);
  assert.throws(() => parse('forza + 1'), /iniziano con @/);
  assert.throws(() => parse('foo(1)'), /Funzione sconosciuta/);
  assert.throws(() => parse('(1 + 2'), /Manca "\)"/);
  assert.throws(() => parse('1d20'), /Simbolo inatteso|Nome sconosciuto/);
});

test('interpolazione e formattazione', () => {
  assert.equal(interpolate('½ {floor(@v/2)} · ⅕ {floor(@v/5)}', (n) => ({ v: 55 })[n]), '½ 27 · ⅕ 11');
  assert.equal(formatValue(3, true), '+3');
  assert.equal(formatValue(-1, true), '−1');
  assert.equal(formatValue(2.5), '2,5');
});

const mini = {
  name: 'Test',
  sections: [{ title: 'S', fields: [
    { key: 'forza', type: 'stat', default: 14, mod: 'floor((@this - 10) / 2)' },
    { key: 'livello', type: 'number', default: 5 },
    { key: 'comp', type: 'computed', formula: '2 + floor((@livello - 1) / 4)' },
    { key: 'atletica', type: 'skill', formula: '@forza_mod + @this * @comp', levels: 2 },
    { key: 'pf', type: 'resource', max: '@livello * 8' },
    { key: 'inv', type: 'list', columns: [
      { key: 'nome', type: 'text' }, { key: 'qta', type: 'number' }, { key: 'peso', type: 'number' },
      { key: 'tot', type: 'computed', formula: '@row.qta * @row.peso' },
    ] },
    { key: 'carico', type: 'computed', formula: 'sum(@inv.tot)' },
  ] }],
};

test('engine: valori derivati', () => {
  const e = new Engine(mini, { atletica: 1, inv: [{ nome: 'Corda', qta: 2, peso: 5 }, { nome: 'Torcia', qta: 3, peso: 1 }] });
  assert.equal(e.resolve('forza'), 14);
  assert.equal(e.resolve('forza_mod'), 2);
  assert.equal(e.resolve('comp'), 3);
  assert.equal(e.resolve('atletica'), 5);
  assert.equal(e.resolve('atletica_level'), 1);
  assert.equal(e.resolve('pf'), 40);
  assert.equal(e.resolve('pf_max'), 40);
  assert.equal(e.resolve('inv'), 2);
  assert.equal(e.resolve('carico'), 13);
});

test('engine: riferimenti circolari e inesistenti', () => {
  const sys = { name: 'C', sections: [{ title: 'S', fields: [
    { key: 'a', type: 'computed', formula: '@b + 1' },
    { key: 'b', type: 'computed', formula: '@a + 1' },
  ] }] };
  const e = new Engine(sys, {});
  assert.throws(() => e.resolve('a'), /circolare/);
  assert.throws(() => e.resolve('zzz'), /inesistente/);
  assert.ok(validateSystem(sys).some((p) => p.includes('circolare')));
});

test('validazione: chiavi duplicate e formule errate', () => {
  const sys = { name: 'V', sections: [{ title: 'S', fields: [
    { key: 'x', type: 'number' }, { key: 'x', type: 'text' }, { key: '1y', type: 'computed', formula: '1 +' },
  ] }] };
  const p = validateSystem(sys);
  assert.ok(p.some((m) => m.includes('duplicata')));
  assert.ok(p.some((m) => m.includes('non valida')));
  assert.ok(p.some((m) => m.includes('incompleta')));
});

test('i modelli inclusi sono validi', () => {
  for (const sys of BUILTIN_SYSTEMS) {
    assert.deepEqual(validateSystem(sys), [], `Problemi nel modello ${sys.name}`);
  }
});

test('D&D 5e: calcoli di esempio', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const e = new Engine(dnd, { des: 16, sag: 12, livello: 5, percezione: 1, car_inc: 'Saggezza' });
  assert.equal(e.resolve('des_mod'), 3);
  assert.equal(e.resolve('comp'), 3);
  assert.equal(e.resolve('percezione'), 4);
  assert.equal(e.resolve('perc_passiva'), 14);
  // maestria: la percezione passiva segue il livello di competenza
  assert.equal(new Engine(dnd, { des: 16, sag: 12, livello: 5, percezione: 2 }).resolve('perc_passiva'), 17);
  assert.equal(e.resolve('cd_inc'), 12);
});

test('D&D 5e: multiclasse', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const base = { livello: 3, livello_2: 2, int: 16, car: 14, car_inc: 'Intelligenza', car_inc_2: 'Carisma' };
  const single = new Engine(dnd, base);
  assert.equal(single.resolve('livello_tot'), 3);
  assert.equal(single.resolve('comp'), 2);
  assert.equal(single.visible('@multiclasse'), false);
  const multi = new Engine(dnd, { ...base, multiclasse: true });
  assert.equal(multi.resolve('livello_tot'), 5);
  assert.equal(multi.resolve('comp'), 3);
  assert.equal(multi.visible('@multiclasse'), true);
  assert.equal(multi.resolve('cd_inc'), 14);
  assert.equal(multi.resolve('cd_inc_2'), 13);
  // le due classi hanno slot distinti
  assert.ok(multi.fields.has('slot_1') && multi.fields.has('slot2_1'));
  assert.equal(interpolate('Incantesimi{concat(" · ", @classe_2)}', multi.resolver()), 'Incantesimi · ');
});

test('peso: campi marcati e nessun tiro nei modelli inclusi', () => {
  for (const sys of BUILTIN_SYSTEMS) {
    assert.ok(hasWeight(sys), sys.name);
    const json = JSON.stringify(sys);
    assert.ok(!/"(roll|rowRoll|targetMode)"|"dice"/.test(json), `tiri rimasti in ${sys.name}`);
  }
});

test('validazione: condizioni di visibilità', () => {
  const sys = { name: 'S', sections: [{ title: 'A', showIf: '@nope', fields: [{ key: 'x', type: 'number', showIf: '@x >' }] }] };
  const p = validateSystem(sys);
  assert.ok(p.some((m) => m.includes('incompleta')));
});

test('privilegi: conversione dal vecchio formato e riposi', () => {
  const old = normalizeFeature({ nome: 'Ispirazione bardica', note: 'd6', usi: '3/riposo lungo' });
  assert.equal(old.testo, 'd6');
  assert.equal(old.usi, 3);
  assert.equal(old.ricarica, 'Riposo lungo');
  const free = normalizeFeature({ nome: 'X', usi: 'a volontà' });
  assert.equal(free.usi, 0);
  assert.match(free.testo, /a volontà/);
  assert.equal(normalizeFeature({ usi: 2, usati: 9 }).usati, 2);

  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const values = { privilegi_classe: [
    { nome: 'Wild Magic', usi: 0, figli: [{ nome: 'Maree del Caos', usi: 1, usati: 1, ricarica: 'Riposo lungo' }] },
    { nome: 'Recupero', usi: 1, usati: 1, ricarica: 'Riposo breve' },
  ] };
  assert.deepEqual(Object.keys(resetFeatureUses(dnd, values, ['Riposo breve'])), ['privilegi_classe']);
  const long = resetFeatureUses(dnd, values, ['Riposo breve', 'Riposo lungo']).privilegi_classe;
  assert.equal(long[0].figli[0].usati, 0);
  assert.equal(long[1].usati, 0);
  assert.equal(new Engine(dnd, values).resolve('privilegi_classe'), 2);
});

test('validazione: formule nei titoli delle sezioni', () => {
  const sys = { name: 'T', sections: [{ title: 'A {concat(@x}', fields: [{ key: 'x', type: 'text' }] }] };
  assert.ok(validateSystem(sys).some((m) => m.includes('titolo')));
});

test('privilegi: contatori con massimo a formula e riposi', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const feat = { nome: 'Sorgente di Magia', contatori: [
    { nome: 'Punti Stregoneria', max: '@livello', usati: 3, ricarica: 'Riposo lungo', nota: 'Max 4' },
    { nome: 'Aggiuntivi', max: '2', usati: 1, ricarica: '' },
    { nome: 'Rotto', max: '@nope' },
  ], figli: [{ nome: 'Metamagia', testo: '- **Raddoppiato**' }] };
  const n = normalizeFeature(feat);
  assert.equal(n.contatori.length, 3);
  assert.equal(n.figli[0].aperto, true);
  const e = new Engine(dnd, { livello: 4, privilegi_classe: [feat] });
  assert.deepEqual(counterMax(e, n.contatori[0]), { ok: true, value: 4 });
  assert.equal(counterMax(e, n.contatori[1]).value, 2);
  assert.equal(counterMax(e, n.contatori[2]).ok, false);
  const after = resetFeatureUses(dnd, { privilegi_classe: [feat] }, ['Riposo breve', 'Riposo lungo']).privilegi_classe[0];
  assert.equal(after.contatori[0].usati, 0);
  assert.equal(after.contatori[1].usati, 1); // senza ricarica resta com'è
});

test('D&D 5e: caratteristica da incantatore automatica dalla classe', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const base = { int: 16, sag: 14, car: 18 };
  assert.equal(new Engine(dnd, { ...base, classe: 'Warlock' }).resolve('mod_inc'), 4);
  assert.equal(new Engine(dnd, { ...base, classe: 'chierico' }).resolve('mod_inc'), 2); // maiuscole indifferenti
  assert.equal(new Engine(dnd, { ...base, classe: 'Mago' }).resolve('mod_inc'), 3);
  assert.equal(new Engine(dnd, { ...base, classe: 'Lama Cinerea' }).resolve('mod_inc'), 3); // homebrew: Intelligenza
  assert.equal(new Engine(dnd, { ...base, classe: 'Mago', car_inc: 'Carisma' }).resolve('mod_inc'), 4); // scelta a mano
  assert.equal(new Engine(dnd, { ...base, multiclasse: true, classe: 'Mago', classe_2: 'Warlock' }).resolve('mod_inc_2'), 4);
});

test('D&D 5e: riposi con regole di classe', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const values = {
    classe: 'Stregone', multiclasse: true, classe_2: 'Warlock',
    slot_1: 2, slot2_1: 1, slot2_2: 1, pf: 3, pf_temp: 5, morte_ko: 1,
    privilegi_classe: [{ nome: 'Fonte', usi: 1, usati: 1, ricarica: 'Riposo breve' }],
  };
  const short = applyRest(dnd, values, 'breve');
  assert.deepEqual(Object.keys(short.changes).sort(), ['privilegi_classe', 'slot2_1', 'slot2_2']);
  assert.ok(short.labels.includes('slot del Warlock'));
  assert.equal('slot_1' in short.changes, false); // gli slot dello Stregone restano spesi

  const long = applyRest(dnd, values, 'lungo');
  for (const k of ['pf', 'pf_temp', 'morte_ko', 'slot_1', 'slot2_1']) assert.ok(k in long.changes, k);
  assert.equal(long.changes.pf, undefined); // undefined = PF al massimo

  // senza Warlock il riposo breve non tocca gli slot
  const noWarlock = applyRest(dnd, { classe: 'Mago', slot_1: 2 }, 'breve');
  assert.deepEqual(noWarlock.changes, {});
});

test('D&D 5e: slot e livelli di incantesimo in base a classe e livello', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const slots = (v, sfx = '') => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => new Engine(dnd, v).resolve(`slot${sfx}_${k}_max`));
  const get = (v, key) => new Engine(dnd, v).resolve(key);

  // incantatore completo
  assert.deepEqual(slots({ classe: 'Mago', livello: 5 }), [4, 3, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(get({ classe: 'Mago', livello: 5 }, 'liv_max_inc'), 3);
  assert.deepEqual(slots({ classe: 'Chierico', livello: 20 }), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  // mezzo incantatore: niente slot al 1° livello
  assert.deepEqual(slots({ classe: 'Paladino', livello: 1 }), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(slots({ classe: 'Paladino', livello: 5 }), [4, 2, 0, 0, 0, 0, 0, 0, 0]);
  // artefice: dal 1° livello, con trucchetti
  assert.deepEqual(slots({ classe: 'Artefice', livello: 1 }), [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  // terzo di incantatore (Cavaliere mistico): dal 3° livello
  assert.equal(get({ classe: 'Guerriero', livello: 2 }, 'liv_max_inc'), 0);
  assert.deepEqual(slots({ classe: 'Guerriero', livello: 7 }), [4, 2, 0, 0, 0, 0, 0, 0, 0]);
  // warlock: slot del patto tutti dello stesso livello, arcanum dall'11°
  assert.deepEqual(slots({ classe: 'Warlock', livello: 5 }), [0, 0, 2, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(slots({ classe: 'Warlock', livello: 11 }), [0, 0, 0, 0, 3, 0, 0, 0, 0]);
  assert.equal(get({ classe: 'Warlock', livello: 11 }, 'liv_max_inc'), 6);
  // classi senza incantesimi: nessuno slot (restano solo i trucchetti)
  assert.equal(get({ classe: 'Barbaro', livello: 10 }, 'tipo_inc'), 'nessuno');
  assert.deepEqual(slots({ classe: 'Monaco', livello: 10 }), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  // i trucchetti non hanno condizioni: si vedono sempre
  const groups = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e').sections.flatMap((s) => s.fields).filter((f) => f.groupBy).flatMap((f) => f.groups);
  assert.ok(groups.filter((g) => g.value === 0).every((g) => !g.showIf));
  // homebrew o vuota: tutto visibile come prima
  assert.deepEqual(slots({ classe: 'Lama Cinerea', livello: 3 }), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  assert.equal(get({}, 'liv_max_inc'), 9);
  // seconda classe con il suo livello
  assert.deepEqual(slots({ multiclasse: true, classe: 'Stregone', livello: 4, classe_2: 'Warlock', livello_2: 2 }, '2'), [2, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('D&D 5e: dadi vita per classe e recupero col riposo lungo', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const get = (v, key) => new Engine(dnd, v).resolve(key);
  assert.equal(get({ classe: 'Barbaro' }, 'tipo_dv'), 'd12');
  assert.equal(get({ classe: 'paladino' }, 'tipo_dv'), 'd10');
  assert.equal(get({ classe: 'Warlock' }, 'tipo_dv'), 'd8');
  assert.equal(get({ classe: 'Mago' }, 'tipo_dv'), 'd6');
  assert.equal(get({ classe: 'Lama Cinerea' }, 'tipo_dv'), 'd8'); // homebrew: valore scelto (predefinito d8)
  assert.equal(get({ classe: 'Lama Cinerea', dado_hb: 'd10' }, 'tipo_dv'), 'd10');
  assert.equal(get({ multiclasse: true, classe: 'Stregone', classe_2: 'Guerriero' }, 'tipo_dv_2'), 'd10');
  // totale = livello della classe
  assert.equal(get({ classe: 'Stregone', livello: 7 }, 'dv_max'), 7);
  assert.equal(get({ classe: 'Stregone', livello: 7 }, 'dv'), 7);

  // riposo lungo: tutti i dadi vita di ogni classe tornano pieni (undefined = pieno)
  const values = { classe: 'Stregone', livello: 7, dv: 1, multiclasse: true, classe_2: 'Warlock', livello_2: 1, dv_2: 0 };
  const { changes, labels } = applyRest(dnd, values, 'lungo');
  assert.ok('dv' in changes && changes.dv === undefined);
  assert.ok('dv_2' in changes && changes.dv_2 === undefined);
  assert.equal(new Engine(dnd, { ...values, ...changes, dv: undefined, dv_2: undefined }).resolve('dv'), 7);
  assert.ok(labels.includes('dadi vita'));
  assert.equal('dv' in applyRest(dnd, { classe: 'Mago', livello: 4 }, 'lungo').changes, false); // già pieni
  assert.equal('dv' in applyRest(dnd, { classe: 'Mago', livello: 4, dv: 1 }, 'breve').changes, false);
});

test('elenco incantesimi: lettura del CSV', () => {
  assert.deepEqual(parseCSV('\uFEFFa,b\n"x, y","riga 1\nriga 2"\n"con ""virgolette""",z\n'), [
    ['a', 'b'], ['x, y', 'riga 1\nriga 2'], ['con "virgolette"', 'z'],
  ]);
  const csv = 'name,classes,level,school,cast_time,range,duration,verbal,somatic,material,material_cost,description\n'
    + 'Fireball,"Sorcerer, Wizard",3,Evocation,1 Action,150 Feet,Instantaneous,1,1,1,bat guano,"A bright streak, then boom."\n'
    + 'Cure Wounds,"Bard, Cleric",1,Evocation,1 Action,Touch,Instantaneous,1,1,0,,Heal.\n'
    + 'Light,"Wizard",0,Evocation,1 Action,Touch,1 hour,1,0,1,,Glow.\n';
  const list = spellsFromCSV(csv);
  assert.equal(list.length, 3);
  assert.deepEqual({ ...list[0], description: undefined }, {
    name: 'Fireball', level: 3, school: 'Invocazione', castTime: '1 Action', range: '150 Feet', duration: 'Instantaneous',
    components: 'V, S, M (bat guano)', description: undefined, classes: ['sorcerer', 'wizard'],
  });
  assert.equal(list[2].components, 'V, M');
  // colonne in italiano e separatore ";"
  const it = spellsFromCSV('nome;livello;scuola;componenti\nPalla di fuoco;3;Invocazione;V, S, M');
  assert.deepEqual([it[0].name, it[0].level, it[0].school, it[0].components], ['Palla di fuoco', 3, 'Invocazione', 'V, S, M']);
  assert.throws(() => spellsFromCSV('titolo,livello\nx,1'), /colonna con il nome/);

  // ricerca: prima chi inizia con il testo, poi le classi del personaggio
  assert.deepEqual(searchSpells(list, 'cu').map((x) => x.name), ['Cure Wounds']);
  assert.deepEqual(searchSpells(list, 'i', ['Mago']), []); // almeno 2 lettere
  assert.deepEqual(searchSpells([...list, { name: 'Light Burst', classes: ['cleric'] }], 'li', ['Chierico']).map((x) => x.name), ['Light Burst', 'Light']);
});

test('elenco incantesimi: esportazione, unione e classi in italiano', () => {
  const mine = [
    { name: 'Palla di fuoco', level: 3, school: 'Invocazione', castTime: '1 azione', range: '45 m', duration: 'Istantanea', components: 'V, S, M (guano, zolfo)', description: 'Una scia luminosa,\npoi "bum".', classes: ['mago', 'stregone'] },
  ];
  // esporta e reimporta senza perdere niente (virgole, a capo, virgolette)
  assert.deepEqual(spellsFromCSV(spellsToCSV(mine)), mine);
  // "aggiungi solo i nuovi": la mia versione tradotta resta, arriva solo ciò che manca
  const incoming = [{ name: 'palla di fuoco', level: 3 }, { name: 'Dardo incantato', level: 1 }];
  const r = mergeSpells(mine, incoming);
  assert.equal(r.added, 1);
  assert.deepEqual(r.list.map((x) => x.name), ['Palla di fuoco', 'Dardo incantato']);
  assert.equal(r.list[0].range, '45 m');
  // classi scritte in italiano nell'elenco: il Mago le trova per prime
  const list = [{ name: 'Fuoco amico', classes: ['chierico'] }, { name: 'Fuoco fatuo', classes: ['mago'] }];
  assert.deepEqual(searchSpells(list, 'fuoco', ['Mago']).map((x) => x.name), ['Fuoco fatuo', 'Fuoco amico']);
});

test('valori inseriti a mano al posto del calcolo', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const base = { des: 14, sag: 12, livello: 1, percezione: 1 };
  assert.equal(new Engine(dnd, base).resolve('iniziativa'), 2);
  // iniziativa a mano (es. talento Allerta)
  assert.equal(new Engine(dnd, { ...base, _manuale: { iniziativa: 7 } }).resolve('iniziativa'), 7);
  // abilità a mano: la percezione passiva la segue
  const e = new Engine(dnd, { ...base, _manuale: { percezione: 6 } });
  assert.equal(e.resolve('percezione'), 6);
  assert.equal(e.resolve('perc_passiva'), 16);
  // modificatore a mano: lo usano abilità e tiri salvezza
  const m = new Engine(dnd, { ...base, _manuale: { des_mod: 5 } });
  assert.equal(m.resolve('des_mod'), 5);
  assert.equal(m.resolve('acrobazia'), 5);
  assert.equal(m.manual('des_mod'), 5);
  assert.equal(m.manual('iniziativa'), undefined);
});

test('immagini nei testi: riconoscimento delle righe e raccolta degli ID', () => {
  assert.deepEqual(IMG_LINE.exec('![Tabella dei bottini](img:i1abc)').slice(1, 3), ['Tabella dei bottini', 'i1abc']);
  assert.equal(IMG_LINE.test('testo ![x](img:i1) altro'), false); // solo su una riga a sé
  const values = {
    note: 'Prima\n![](img:iA)\nDopo',
    diario: [{ nome: 'S1', testo: '![mappa](img:iB)' }],
    privilegi_classe: [{ figli: [{ testo: 'vedi ![](img:iA)' }] }],
    altro: 42,
  };
  assert.deepEqual([...imageIdsIn(values)].sort(), ['iA', 'iB']);
});

test('schede di appunti: modello D&D e conteggio', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const f = dnd.sections.find((s) => s.id === 'appunti').fields[0];
  assert.equal(f.type, 'features');
  assert.equal(f.variant, 'notebook');
  assert.equal(f.legacyKey, 'note');
  assert.equal(dnd.sections.find((s) => s.id === 'diario').fields[0].variant, 'journal');
  const e = new Engine(dnd, { schede_note: [{ nome: 'PNG', testo: '' }, { nome: 'Luoghi', testo: '' }] });
  assert.equal(e.resolve('schede_note'), 2);
});

test('immagini nei testi: grandezza scritta nella riga', async () => {
  const { setImageSize } = await import('../js/images.js');
  const t = 'prima\n![Tabella](img:abc)\n![](img:xyz 40%)';
  assert.equal(IMG_LINE.exec('![Tabella](img:abc 50%)')[3], '50');
  assert.equal(IMG_LINE.exec('![Tabella](img:abc)')[3], undefined);
  assert.equal(setImageSize(t, 'abc', 50), 'prima\n![Tabella](img:abc 50%)\n![](img:xyz 40%)');
  assert.equal(setImageSize(t, 'xyz', null), 'prima\n![Tabella](img:abc)\n![](img:xyz)');
  assert.equal(setImageSize(t, 'abc', 3), 'prima\n![Tabella](img:abc 15%)\n![](img:xyz 40%)');
  assert.deepEqual([...imageIdsIn({ a: t })], ['abc', 'xyz']);
});

test('tabelle nei testi: lettura, scrittura e sostituzione', async () => {
  const { parseTable, tableToText, replaceTable } = await import('../js/tables.js');
  const t = parseTable(['| FOR | DES |', '|---|---|', '| 6 (-2) | 15 (+2) |', '| a \\| b |']);
  assert.equal(t.header, true);
  assert.deepEqual(t.rows, [['FOR', 'DES'], ['6 (-2)', '15 (+2)'], ['a | b', '']]);
  assert.equal(tableToText(t), '| FOR | DES |\n| --- | --- |\n| 6 (-2) | 15 (+2) |\n| a \\| b |  |');
  assert.equal(parseTable(['| x | y |']).header, false);
  const text = 'prima\n| a |\n| b |\nmezzo\n| c |\ndopo';
  assert.equal(replaceTable(text, 1, '| z |'), 'prima\n| a |\n| b |\nmezzo\n| z |\ndopo');
  assert.equal(replaceTable(text, 0, ''), 'prima\nmezzo\n| c |\ndopo');
  const { MAX_TABLE_ROWS, MAX_TABLE_COLS } = await import('../js/tables.js');
  const big = parseTable(Array.from({ length: 50 }, () => `|${' x |'.repeat(25)}`));
  assert.equal(big.rows.length, MAX_TABLE_ROWS);
  assert.equal(big.rows[0].length, MAX_TABLE_COLS);
});

test('punti ferita temporanei nel contatore e azzerati dal riposo lungo', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const fields = dnd.sections.flatMap((s) => s.fields);
  assert.equal(fields.find((f) => f.key === 'pf').temp, 'pf_temp');
  assert.equal(fields.find((f) => f.key === 'pf_temp').hidden, true);
  const r = applyRest(dnd, { pf_max: 20, pf: 5, pf_temp: 7 }, 'lungo');
  assert.ok('pf_temp' in r.changes && r.changes.pf_temp === undefined); // undefined = torna a 0
  assert.ok('pf' in r.changes);
});

test('dadi vita: un riquadro per tutte le classi, dado scelto per le homebrew', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const fields = dnd.sections.flatMap((s) => s.fields);
  const hd = fields.find((f) => f.type === 'hitdice');
  assert.equal(hd.rows.length, 2);
  const e = new Engine(dnd, { classe: 'Barbaro', multiclasse: true, classe_2: 'Cacciatore', dado_hb_2: 'd10' });
  assert.equal(e.resolve('tipo_dv'), 'd12');
  assert.equal(e.resolve('tipo_dv_2'), 'd10');
  assert.equal(e.visible(hd.rows[1].showIf), true);
  assert.ok(fields.filter((f) => /^(dv|dado_hb)/.test(f.key)).every((f) => f.hidden));
  // dado cambiato a mano anche per una classe nota: vale finché la classe resta quella
  const get = (v, k) => new Engine(dnd, v).resolve(k);
  assert.equal(get({ classe: 'Mago', dado_hb: 'd10', dado_hb_cls: 'Mago' }, 'tipo_dv'), 'd10');
  assert.equal(get({ classe: 'Barbaro', dado_hb: 'd10', dado_hb_cls: 'Mago' }, 'tipo_dv'), 'd12'); // classe cambiata
  assert.equal(new Engine(dnd, { classe: 'Mago', dado_hb: 'd10', dado_hb_cls: 'Mago' }).visible(hd.rows[0].changed), true);
  assert.equal(new Engine(dnd, { classe: 'Mago' }).visible(hd.rows[0].changed), false);
  // scelta uguale al dado della classe: non conta come modifica
  assert.equal(new Engine(dnd, { classe: 'Mago', dado_hb: 'd6', dado_hb_cls: 'Mago' }).visible(hd.rows[0].changed), false);
  // massimo scritto a mano (vuoto = livello della classe)
  assert.equal(get({ classe: 'Mago', livello: 5 }, 'dv'), 5);
  assert.equal(get({ classe: 'Mago', livello: 5, dv_tot: 7 }, 'dv'), 7);
  assert.equal(get({ multiclasse: true, classe_2: 'Ladro', livello_2: 2, dv_tot_2: 3 }, 'dv_2'), 3);
});

test('lingua inglese: ogni testo dell\'interfaccia ha la traduzione', async () => {
  const fs = await import('node:fs');
  const { EN } = await import('../js/i18n-en.js');
  const dir = new URL('../js/', import.meta.url);
  const files = [...fs.readdirSync(dir).map((f) => f), ...fs.readdirSync(new URL('views/', dir)).map((f) => `views/${f}`)]
    .filter((f) => f.endsWith('.js') && !f.startsWith('i18n'));
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (!(key in EN)) missing.push(`${f}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
  // i segnaposto {nome} restano uguali nella traduzione
  for (const [it, en] of Object.entries(EN)) {
    if (it.includes('{graffe}')) continue; // spiega la sintassi: qui {…} è testo, non un segnaposto
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');
    assert.equal(ph(en), ph(it), `segnaposto diversi in: ${it}`);
  }
  // le etichette visibili delle schede incluse sono tradotte
  const { BUILTIN_SYSTEMS } = await import('../js/systems.js');
  for (const s of BUILTIN_SYSTEMS) {
    for (const sec of s.sections) {
      if (sec.title && !/\{/.test(sec.title)) assert.ok(sec.title in EN, `titolo: ${sec.title}`);
      for (const f of sec.fields || []) if (!f.hidden && f.label && !/\{/.test(f.label)) assert.ok(f.label in EN, `etichetta: ${f.label}`);
    }
  }
});

test('lingua: i valori salvati restano in italiano', async () => {
  const { t, tValues, toStored } = await import('../js/i18n.js');
  // nei test (fuori dal browser) la lingua è l'italiano: nessuna traduzione
  assert.equal(t('Aggiungi riga'), 'Aggiungi riga');
  assert.equal(t('{n} incantesimi', { n: 3 }), '3 incantesimi');
  assert.equal(tValues('Privilegi di classe · Mago'), 'Privilegi di classe · Mago');
  assert.equal(toStored('Mago'), 'Mago');
});

test('slot incantesimo: numero cambiato a mano', () => {
  const dnd = BUILTIN_SYSTEMS.find((s) => s.id === 'dnd5e');
  const sec = dnd.sections.find((s) => s.id === 'magia');
  assert.ok(sec.editMax);
  const max = (v, k) => new Engine(dnd, v).resolve(`${k}_max`);
  assert.equal(max({ classe: 'Mago', livello: 1 }, 'slot_1'), 2);
  assert.equal(max({ classe: 'Mago', livello: 1, _manuale: { slot_1_max: 3 } }, 'slot_1'), 3);
  assert.equal(max({ classe: 'Mago', livello: 1, _manuale: { slot_1_max: 30 } }, 'slot_1'), 9); // tetto di 9 per livello
  // un livello non ancora sbloccato diventa visibile se gli dai degli slot
  const e = new Engine(dnd, { classe: 'Mago', livello: 1, _manuale: { slot_2_max: 1 } });
  const f2 = sec.fields.find((f) => f.key === 'slot_2');
  assert.equal(e.visible(f2.showIf), true);
  assert.equal(new Engine(dnd, { classe: 'Mago', livello: 1 }).visible(f2.showIf), false);
});
