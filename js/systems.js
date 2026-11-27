// Modelli inclusi nell'app. Sono di sola lettura: per modificarli l'app ne
// crea una copia. Contengono solo nomi di statistiche e regole di calcolo,
// nessun testo dei manuali.

const DND_STATS = [
  ['for', 'Forza'], ['des', 'Destrezza'], ['cos', 'Costituzione'],
  ['int', 'Intelligenza'], ['sag', 'Saggezza'], ['car', 'Carisma'],
];

const DND_SKILLS = [
  ['acrobazia', 'Acrobazia', 'des'], ['addestrare', 'Addestrare animali', 'sag'],
  ['arcano', 'Arcano', 'int'], ['atletica', 'Atletica', 'for'],
  ['furtivita', 'Furtività', 'des'], ['indagare', 'Indagare', 'int'],
  ['inganno', 'Inganno', 'car'], ['intimidire', 'Intimidire', 'car'],
  ['intrattenere', 'Intrattenere', 'car'], ['intuizione', 'Intuizione', 'sag'],
  ['medicina', 'Medicina', 'sag'], ['natura', 'Natura', 'int'],
  ['percezione', 'Percezione', 'sag'], ['persuasione', 'Persuasione', 'car'],
  ['rapidita', 'Rapidità di mano', 'des'], ['religione', 'Religione', 'int'],
  ['sopravvivenza', 'Sopravvivenza', 'sag'], ['storia', 'Storia', 'int'],
];

const statShort = Object.fromEntries(DND_STATS.map(([k, l]) => [k, l.slice(0, 3)]));

// Sezione di privilegi: voci richiudibili con descrizione, usi e sotto-privilegi.
const featureSection = (id, title, tab, extra = {}) => ({
  id, title, tab, columns: 1, ...extra,
  fields: [{ key: id, label: '', type: 'features', placeholder: extra.placeholder }],
});

const inventoryColumns = (weightLabel) => [
  { key: 'oggetto', label: 'Oggetto', type: 'text', width: 3 },
  { key: 'note', label: 'Note', type: 'notes' },
  { key: 'qta', label: 'Qtà', type: 'number' },
  { key: 'peso', label: weightLabel, type: 'number', weight: true },
  { key: 'tot', label: 'Totale', type: 'computed', formula: '@row.qta * @row.peso', weight: true },
];

export const GENERIC = {
  id: 'generico',
  name: 'Generico',
  description: 'Una scheda neutra: caratteristiche, punti vita, inventario, capacità e note.',
  builtin: true,
  version: 2,
  sections: [
    {
      id: 'info', title: 'Personaggio', columns: 4,
      fields: [
        { key: 'ritratto', label: 'Ritratto', type: 'image', rowSpan: 2 },
        { key: 'giocatore', label: 'Giocatore', type: 'text' },
        { key: 'concetto', label: 'Concetto', type: 'text', placeholder: 'es. Mercenaria disillusa' },
        { key: 'livello', label: 'Livello', type: 'number', default: 1 },
      ],
    },
    {
      id: 'car', title: 'Caratteristiche', columns: 6, tiles: true,
      fields: [
        ['forza', 'Forza'], ['agilita', 'Agilità'], ['tempra', 'Tempra'],
        ['mente', 'Mente'], ['istinto', 'Istinto'], ['presenza', 'Presenza'],
      ].map(([key, label]) => ({ key, label, type: 'number', default: 2 })),
    },
    {
      id: 'stato', title: 'Stato', columns: 3,
      fields: [
        { key: 'pf', label: 'Punti vita', type: 'resource', max: '@pf_max', editableMax: true, emphasis: 'primary', span: 2 },
        { key: 'pf_max', label: 'Punti vita massimi', type: 'number', default: 10, hidden: true },
        { key: 'fato', label: 'Punti fato', type: 'dots', max: 5, default: 3 },
      ],
    },
    {
      id: 'inv', title: 'Inventario', columns: 4,
      fields: [
        { key: 'inventario', label: 'Oggetti', type: 'list', span: 4, scroll: true, columns: inventoryColumns('Peso') },
        { key: 'carico', label: 'Carico totale', type: 'computed', formula: 'sum(@inventario.tot)', sub: 'su {@forza * 5} trasportabili', weight: true },
      ],
    },
    featureSection('capacita', 'Capacità e privilegi', undefined, { placeholder: 'Nessuna capacità.' }),
    {
      id: 'note', title: 'Note', columns: 1,
      fields: [{ key: 'note', label: '', type: 'richtext', rows: 6, placeholder: 'Note e storia del personaggio… Tocca per scrivere.' }],
    },
  ],
};

const SCHOOLS = ['', 'Abiurazione', 'Ammaliamento', 'Divinazione', 'Evocazione', 'Illusione', 'Invocazione', 'Necromanzia', 'Trasmutazione'];
const SLOT_MAX = [4, 3, 3, 3, 3, 2, 2, 1, 1];
// Classi proposte nel campo Classe (si può anche scrivere una classe homebrew).
export const DND_CLASSES = ['Artefice', 'Barbaro', 'Bardo', 'Chierico', 'Druido', 'Guerriero', 'Ladro', 'Mago', 'Monaco', 'Paladino', 'Ranger', 'Stregone', 'Warlock'];
// Caratteristica da incantatore per classe (Guerriero e Ladro: Cavaliere mistico e Mistificatore arcano).
const CASTING = {
  Intelligenza: ['Artefice', 'Mago', 'Guerriero', 'Ladro'],
  Saggezza: ['Chierico', 'Druido', 'Ranger', 'Monaco'],
  Carisma: ['Bardo', 'Paladino', 'Stregone', 'Warlock'],
};
const isClass = (key, list) => list.map((c) => `@${key} == "${c}"`).join(' || ');
// Nome della caratteristica scelta in automatico dalla classe (Intelligenza se non è riconosciuta).
const autoAbility = (key) => `if(${isClass(key, CASTING.Saggezza)}, "Saggezza", if(${isClass(key, CASTING.Carisma)}, "Carisma", "Intelligenza"))`;
// Dado vita per classe; per le classi homebrew lo sceglie il giocatore.
const HIT_DIE = {
  d12: ['Barbaro'],
  d10: ['Guerriero', 'Paladino', 'Ranger'],
  d8: ['Artefice', 'Bardo', 'Chierico', 'Druido', 'Ladro', 'Monaco', 'Warlock'],
  d6: ['Mago', 'Stregone'],
};
function hitDiceFields(n) {
  const sfx = n === 1 ? '' : `_${n}`;
  const cls = n === 1 ? 'classe' : 'classe_2';
  const lvl = n === 1 ? 'livello' : 'livello_2';
  const known = isClass(cls, Object.values(HIT_DIE).flat());
  const die = Object.entries(HIT_DIE).reduceRight((rest, [d, list]) => `if(${isClass(cls, list)}, "${d}", ${rest})`, `@dado_hb${sfx}`);
  const name = n === 1
    ? '{if(@multiclasse, concat(" · ", if(@classe == "", "1ª classe", @classe)), "")}'
    : '{concat(" · ", if(@classe_2 == "", "2ª classe", @classe_2))}';
  const multi = n === 1 ? '' : '@multiclasse && ';
  return [
    { key: `tipo_dv${sfx}`, label: 'Dado vita', type: 'computed', hidden: true, formula: die },
    // rimasti / totale (= livello della classe); il riposo lungo li recupera tutti
    { key: `dv${sfx}`, label: `Dadi vita${name} ({@tipo_dv${sfx}})`, type: 'resource', max: `@${lvl}`, emphasis: 'compact', showIf: n === 1 ? undefined : '@multiclasse' },
    { key: `dado_hb${sfx}`, label: `Dado vita${name}`, type: 'select', options: ['d6', 'd8', 'd10', 'd12'], default: 'd8', showIf: `${multi}@${cls} != "" && !(${known})` },
  ];
}

const slotKeys = (n) => SLOT_MAX.map((_, i) => `slot${n === 1 ? '' : n}_${i + 1}`);


// ---- slot incantesimo per classe e livello (regole 2014) ------------------
// Tabella dell'incantatore completo: per ogni livello da incantatore (0–20) gli
// slot di 1°…9° livello. Mezzi incantatori e terzi di incantatore usano la
// stessa tabella con un livello da incantatore ridotto.
const FULL_CASTER = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const SPELLCASTER_TYPE = {
  pieno: ['Bardo', 'Chierico', 'Druido', 'Mago', 'Stregone'],
  mezzo: ['Paladino', 'Ranger'],
  artefice: ['Artefice'],
  terzo: ['Guerriero', 'Ladro'], // Cavaliere mistico e Mistificatore arcano
  patto: ['Warlock'],
  nessuno: ['Barbaro', 'Monaco'],
};

// Campi di appoggio (nascosti) e formule degli slot per la classe n (1 o 2).
function casterFields(n) {
  const sfx = n === 1 ? '' : `_${n}`;
  const cls = n === 1 ? 'classe' : 'classe_2';
  const L = `min(@${n === 1 ? 'livello' : 'livello_2'}, 20)`;
  const tipo = `@tipo_inc${sfx}`;
  const typeFormula = Object.entries(SPELLCASTER_TYPE).reduceRight(
    (rest, [name, list]) => `if(${isClass(cls, list)}, "${name}", ${rest})`, '"libero"');
  // Magia del patto: livello degli slot e quanti sono
  const pactLevel = `if(${L} < 1, 0, if(${L} < 3, 1, if(${L} < 5, 2, if(${L} < 7, 3, if(${L} < 9, 4, 5)))))`;
  const pactCount = `if(${L} < 1, 0, if(${L} < 2, 1, if(${L} < 11, 2, if(${L} < 17, 3, 4))))`;
  const arcanum = `if(${L} >= 17, 9, if(${L} >= 15, 8, if(${L} >= 13, 7, if(${L} >= 11, 6, 0))))`;
  const column = (k) => FULL_CASTER.map((row) => row[k - 1] || 0).join(', ');
  return {
    hidden: [
      // "libero" = classe homebrew o non indicata: tutto visibile, come una scheda libera
      { key: `tipo_inc${sfx}`, label: 'Tipo di incantatore', type: 'computed', hidden: true, formula: typeFormula },
      {
        key: `liv_inc${sfx}`, label: 'Livello da incantatore', type: 'computed', hidden: true,
        formula: `if(${tipo} == "pieno", ${L}, if(${tipo} == "mezzo", if(${L} < 2, 0, ceil(${L} / 2)), if(${tipo} == "artefice", ceil(${L} / 2), if(${tipo} == "terzo", if(${L} < 3, 0, ceil(${L} / 3)), 0))))`,
      },
      {
        key: `liv_max_inc${sfx}`, label: 'Livello massimo degli incantesimi', type: 'computed', hidden: true,
        formula: `if(${tipo} == "libero", 9, if(${tipo} == "patto", max(${pactLevel}, ${arcanum}), pick(@liv_inc${sfx}, ${FULL_CASTER.map((r) => r.length).join(', ')})))`,
      },
    ],
    slotMax: (k) => `if(${tipo} == "libero", ${SLOT_MAX[k - 1]}, if(${tipo} == "patto", if(${pactLevel} == ${k}, ${pactCount}, 0), pick(@liv_inc${sfx}, ${column(k)})))`,
    groups: [
      { value: 0, label: 'Trucchetti' }, // sempre visibili, per ogni classe
      ...SLOT_MAX.map((_, i) => ({ value: i + 1, label: `Livello ${i + 1}`, showIf: `@liv_max_inc${sfx} >= ${i + 1}` })),
    ],
    sectionShowIf: n === 1 ? undefined : '@multiclasse',
  };
}

// Sezioni da incantatore per una classe. Con il multiclasse ogni classe ha
// caratteristica, CD, slot ed elenco propri: gli slot non sono condivisi.
function spellcasting(n) {
  const sfx = n === 1 ? '' : `_${n}`;
  const cls = n === 1
    ? '{if(@multiclasse, concat(" · ", if(@classe == "", "1ª classe", @classe)), "")}'
    : '{concat(" · ", if(@classe_2 == "", "2ª classe", @classe_2))}';
  const mod = `mod_inc${sfx}`;
  const clsKey = n === 1 ? 'classe' : 'classe_2';
  const abil = `if(@car_inc${sfx} == "Automatica", ${autoAbility(clsKey)}, @car_inc${sfx})`;
  const caster = casterFields(n);
  // Una sola sezione per classe, su 9 colonne: in alto i valori da incantatore
  // (3 + 2 + 2 + 2), poi gli slot usati di ogni livello, poi l'elenco.
  return {
    id: `magia${sfx}`, title: `Incantesimi${cls}`, tab: 'Incantesimi', columns: 9, showIf: caster.sectionShowIf,
    fields: [
      ...caster.hidden,
      {
        key: `car_inc${sfx}`, label: 'Caratteristica', type: 'select', options: ['Automatica', 'Intelligenza', 'Saggezza', 'Carisma'], default: 'Automatica', span: 3, tile: true,
        sub: `{if(@this == "Automatica", concat("dalla classe: ", ${autoAbility(clsKey)}), "")}`,
      },
      { key: mod, label: 'Modificatore', type: 'computed', signed: true, span: 2, tile: true, formula: `if(${abil} == "Intelligenza", @int_mod, if(${abil} == "Saggezza", @sag_mod, @car_mod))` },
      { key: `cd_inc${sfx}`, label: 'CD tiro salvezza', type: 'computed', span: 2, tile: true, formula: `8 + @comp + @${mod}` },
      { key: `att_inc${sfx}`, label: 'Bonus attacco', type: 'computed', signed: true, span: 2, tile: true, formula: `@comp + @${mod}` },
      // slot: quanti pallini dipende da classe e livello; si vedono solo i livelli sbloccati
      ...SLOT_MAX.map((_, i) => {
        const key = `slot${n === 1 ? '' : n}_${i + 1}`;
        return { key, label: `Slot ${i + 1}°`, type: 'dots', max: caster.slotMax(i + 1), showIf: `@${key}_max > 0` };
      }),
      {
        // divisi per livello (trucchetti, 1°…9°), ogni riga su una linea che scorre di lato
        key: `incantesimi${sfx}`, label: '', type: 'list',
        groupBy: 'liv', groups: caster.groups, scroll: true,
        itemLabel: ['conosciuto', 'conosciuti'], countCheck: { key: 'prep', label: 'preparati' }, countExclude: { key: 'sempre', label: 'sempre' }, addLabel: 'Aggiungi',
        emptyText: 'Nessun incantesimo a questo livello: i livelli compaiono man mano che si sbloccano.',
        columns: [
          {
            key: 'nome', label: 'Nome', type: 'text', width: 3,
            // se è stato importato un elenco di incantesimi, scrivendo il nome compaiono i suggerimenti
            lookup: {
              source: 'incantesimi', classes: [clsKey],
              fill: { liv: 'level', scuola: 'school', tempo: 'castTime', gittata: 'range', componenti: 'components', durata: 'duration', note: 'description' },
              keep: ['note'],
            },
          },
          { key: 'note', label: 'Descrizione', type: 'notes' },
          { key: 'liv', label: 'Livello', type: 'number' },
          { key: 'scuola', label: 'Scuola', type: 'select', options: SCHOOLS, width: 2 },
          { key: 'tempo', label: 'Tempo di lancio', type: 'text', width: 2 },
          { key: 'gittata', label: 'Gittata', type: 'text', width: 2 },
          { key: 'componenti', label: 'Componenti', type: 'text', width: 2 },
          { key: 'durata', label: 'Durata', type: 'text', width: 2 },
          { key: 'prep', label: 'Prep.', type: 'checkbox' },
          // sempre conosciuti/preparati (es. incantesimi di dominio o di sottoclasse): non contano nei totali
          { key: 'sempre', label: 'Sempre', type: 'checkbox', title: 'Sempre conosciuto/preparato (es. da sottoclasse): non conta nei totali' },
        ],
      },
    ],
  };
}

export const DND5E = {
  id: 'dnd5e',
  name: 'D&D 5ª edizione',
  theme: 'fantasy', // titoli e numeri con un carattere graziato
  // Cosa recupera ogni riposo (menu ⋯ della scheda). Gli usi dei privilegi si
  // recuperano in base alla loro ricarica, senza bisogno di regole qui.
  rests: {
    breve: [
      // Magia del patto: il Warlock recupera gli slot con un riposo breve
      { if: '@classe == "Warlock"', reset: slotKeys(1), label: 'slot del Warlock' },
      { if: '@multiclasse && @classe_2 == "Warlock"', reset: slotKeys(2), label: 'slot del Warlock' },
    ],
    lungo: [
      { reset: ['pf', 'pf_temp', 'morte_ok', 'morte_ko'], label: 'punti ferita' },
      { reset: ['dv', 'dv_2'], label: 'dadi vita' }, // tutti i dadi vita di ogni classe
      { reset: [...slotKeys(1), ...slotKeys(2)], label: 'slot incantesimo' },
    ],
  },
  description: 'Caratteristiche, competenze, tiri salvezza, attacchi, incantesimi con slot (anche multiclasse), privilegi e inventario.',
  builtin: true,
  version: 2,
  sections: [
    {
      id: 'info', title: 'Personaggio', tab: 'Principale', columns: 4,
      fields: [
        { key: 'ritratto', label: 'Ritratto', type: 'image', rowSpan: 2 },
        { key: 'classe', label: 'Classe', type: 'text', suggestions: DND_CLASSES, placeholder: 'Scegli o scrivi (homebrew)' },
        { key: 'livello', label: 'Livello', type: 'number', default: 1 },
        { key: 'livello_tot', label: 'Livello del personaggio', type: 'computed', formula: '@livello + if(@multiclasse, @livello_2, 0)', showIf: '@multiclasse' },
        { key: 'classe_2', label: 'Seconda classe', type: 'text', suggestions: DND_CLASSES, placeholder: 'Scegli o scrivi (homebrew)', showIf: '@multiclasse' },
        { key: 'livello_2', label: 'Livello seconda classe', type: 'number', default: 1, showIf: '@multiclasse' },
        // Si attiva dal menu ⋯ della scheda, non è mostrata nella griglia.
        { key: 'multiclasse', label: 'Multiclasse', type: 'checkbox', menu: true, menuOff: 'Aggiungi seconda classe (multiclasse)', menuOn: 'Rimuovi seconda classe' },
        { key: 'specie', label: 'Razza', type: 'text' },
        { key: 'background', label: 'Background', type: 'text' },
        { key: 'allineamento', label: 'Allineamento', type: 'select', options: ['', 'Legale buono', 'Neutrale buono', 'Caotico buono', 'Legale neutrale', 'Neutrale', 'Caotico neutrale', 'Legale malvagio', 'Neutrale malvagio', 'Caotico malvagio'] },
        { key: 'px', label: 'Punti esperienza', type: 'number' },
        { key: 'ispirazione', label: 'Ispirazione', type: 'checkbox' },
      ],
    },
    {
      id: 'caratteristiche', title: 'Caratteristiche', tab: 'Principale', columns: 6,
      fields: DND_STATS.map(([key, label]) => ({ key, label, type: 'stat', default: 10, mod: 'floor((@this - 10) / 2)' })),
    },
    {
      id: 'combattimento', title: 'Combattimento', tab: 'Principale', columns: 5, tiles: true,
      fields: [
        { key: 'ca', label: 'Classe armatura', type: 'number', default: 10 },
        { key: 'iniziativa', label: 'Iniziativa', type: 'computed', formula: '@des_mod', signed: true },
        { key: 'velocita', label: 'Velocità', type: 'text', default: '9 m' },
        { key: 'comp', label: 'Bonus competenza', type: 'computed', formula: '2 + floor((@livello_tot - 1) / 4)', signed: true },
        { key: 'perc_passiva', label: 'Percezione passiva', type: 'computed', formula: '10 + @percezione', sub: '10 {if(@percezione < 0, "−", "+")} {abs(@percezione)}' },
      ],
    },
    {
      id: 'pf', title: 'Punti ferita', tab: 'Principale', columns: 3,
      fields: [
        // il massimo si cambia direttamente nel contatore (il campo pf_max resta per le formule)
        { key: 'pf', label: 'Punti ferita', type: 'resource', max: '@pf_max', editableMax: true, span: 2, emphasis: 'primary' },
        { key: 'pf_max', label: 'PF massimi', type: 'number', default: 10, hidden: true },
        { key: 'pf_temp', label: 'PF temporanei', type: 'number' },
        ...hitDiceFields(1),
        ...hitDiceFields(2),
        // un solo contatore a pallini per successi e fallimenti (i valori restano in morte_ok / morte_ko)
        { key: 'tiri_morte', label: 'Tiri contro morte', type: 'deathsaves', success: 'morte_ok', fail: 'morte_ko', span: 2 },
        { key: 'morte_ok', label: 'Tiri contro morte: successi', type: 'dots', max: 3, hidden: true },
        { key: 'morte_ko', label: 'Tiri contro morte: fallimenti', type: 'dots', max: 3, hidden: true },
      ],
    },
    {
      id: 'salvezza', title: 'Tiri salvezza', tab: 'Principale', columns: 3,
      fields: DND_STATS.map(([k, label]) => ({
        key: `ts_${k}`, label, type: 'skill', levels: 1, signed: true, formula: `@${k}_mod + @this * @comp`,
      })),
    },
    {
      id: 'abilita', title: 'Abilità', tab: 'Principale', columns: 3,
      fields: DND_SKILLS.map(([key, label, stat]) => ({
        key, label: `${label} (${statShort[stat]})`, type: 'skill', levels: 2, signed: true, formula: `@${stat}_mod + @this * @comp`,
      })),
    },
    {
      id: 'attacchi', title: 'Attacchi', tab: 'Principale', columns: 1,
      fields: [{
        key: 'attacchi', label: 'Armi e attacchi', type: 'list', scroll: true,
        columns: [
          { key: 'nome', label: 'Nome', type: 'text', width: 3 },
          { key: 'colpire', label: 'Per colpire', type: 'text', width: 1 },
          { key: 'danni', label: 'Danni', type: 'text', width: 2 },
          { key: 'note', label: 'Note', type: 'text', width: 3 },
        ],
      }],
    },
    featureSection('privilegi_razza', 'Privilegi di razza{if(@specie == "", "", concat(" · ", @specie))}', 'Privilegi'),
    featureSection('privilegi_background', 'Privilegi di background{if(@background == "", "", concat(" · ", @background))}', 'Privilegi'),
    featureSection('privilegi_classe', 'Privilegi di classe{if(@classe == "", "", concat(" · ", @classe))}', 'Privilegi'),
    featureSection('privilegi_classe_2', 'Privilegi di classe{concat(" · ", if(@classe_2 == "", "2ª classe", @classe_2))}', 'Privilegi', { showIf: '@multiclasse' }),
    featureSection('privilegi_altri', 'Talenti e altri privilegi', 'Privilegi'),
    {
      id: 'equip', title: 'Equipaggiamento', tab: 'Equipaggiamento', columns: 4,
      fields: [
        { key: 'inventario', label: 'Inventario', type: 'list', span: 4, scroll: true, columns: inventoryColumns('Peso (kg)') },
        { key: 'carico', label: 'Peso trasportato', type: 'computed', formula: 'sum(@inventario.tot)', sub: 'capacità {@for * 7.5} kg', weight: true },
      ],
    },
    {
      id: 'monete', title: 'Monete', tab: 'Equipaggiamento', columns: 5, tiles: true, customizable: true, // nomi e tagli scelti dal giocatore
      fields: [
        { key: 'mr', label: 'Rame (mr)', type: 'number' },
        { key: 'ma', label: 'Argento (ma)', type: 'number' },
        { key: 'me', label: 'Electrum (me)', type: 'number' },
        { key: 'mo', label: 'Oro (mo)', type: 'number' },
        { key: 'mp', label: 'Platino (mp)', type: 'number' },
      ],
    },
    spellcasting(1),
    spellcasting(2),
    // ---- tab Storia: chi è il personaggio ----
    {
      id: 'aspetto', title: 'Aspetto', tab: 'Storia', columns: 6,
      fields: [
        { key: 'eta', label: 'Età', type: 'text' },
        { key: 'altezza', label: 'Altezza', type: 'text', placeholder: 'es. 1,75 m' },
        { key: 'peso_pg', label: 'Peso', type: 'text', placeholder: 'es. 70 kg' },
        { key: 'occhi', label: 'Occhi', type: 'text' },
        { key: 'capelli', label: 'Capelli', type: 'text' },
        { key: 'pelle', label: 'Carnagione', type: 'text' },
        { key: 'aspetto', label: 'Descrizione', type: 'richtext', rows: 3, span: 6, placeholder: 'Come appare, segni particolari, abbigliamento… Tocca per scrivere.' },
      ],
    },
    {
      id: 'personalita', title: 'Personalità', tab: 'Storia', columns: 2,
      fields: [
        { key: 'tratti', label: 'Tratti caratteriali', type: 'richtext', rows: 3 },
        { key: 'ideali', label: 'Ideali', type: 'richtext', rows: 3 },
        { key: 'legami', label: 'Legami', type: 'richtext', rows: 3 },
        { key: 'difetti', label: 'Difetti', type: 'richtext', rows: 3 },
      ].map((f) => ({ ...f, span: 1 })),
    },
    {
      id: 'storia', title: 'Storia del personaggio', tab: 'Storia', columns: 1,
      fields: [{ key: 'biografia', label: '', type: 'richtext', rows: 6, placeholder: 'Da dove viene, cosa ha vissuto, cosa cerca… Tocca per scrivere.' }],
    },
    {
      id: 'alleati', title: 'Alleati e organizzazioni', tab: 'Storia', columns: 1,
      fields: [{ key: 'alleati', label: '', type: 'richtext', rows: 3, placeholder: 'Persone, gilde, fazioni con cui hai legami… Tocca per scrivere.' }],
    },
    // ---- tab Note: per giocare ----
    {
      id: 'appunti', title: 'Appunti', tab: 'Note', columns: 1,
      fields: [{ key: 'schede_note', label: '', type: 'features', variant: 'notebook', legacyKey: 'note', placeholder: 'Nessuna scheda. Creane una per ogni argomento: PNG, luoghi, indizi, tabelle…', textPlaceholder: 'Nomi, indizi, cose da ricordare… Tocca per scrivere.' }],
    },
    {
      id: 'diario', title: 'Diario delle sessioni', tab: 'Note', columns: 1,
      fields: [{ key: 'diario', label: '', type: 'features', variant: 'journal', placeholder: 'Nessuna sessione annotata. Le nuove voci compaiono in cima.' }],
    },
  ],
};

export const BUILTIN_SYSTEMS = [DND5E, GENERIC];
