# Formato dei modelli

Un modello è un oggetto JSON che descrive la scheda di un gioco. Puoi modificarlo
dall'editor visuale oppure dalla scheda **JSON** dell'editor.

```json
{
  "id": "m_abc123",
  "name": "Il mio gioco",
  "description": "A cosa serve questo modello",
  "version": 1,
  "sections": [
    {
      "id": "car",
      "title": "Caratteristiche",
      "tab": "Principale",
      "columns": 6,
      "fields": [
        { "key": "forza", "label": "Forza", "type": "stat", "default": 10,
          "mod": "floor((@this - 10) / 2)" }
      ]
    }
  ]
}
```

## Riposi

Il modello può dire cosa recuperano **Riposo breve** e **Riposo lungo** (menu ⋯ della scheda).
Ogni regola riporta al valore iniziale i campi in `reset`, solo se la condizione `if` è vera:

```json
"rests": {
  "breve": [{ "if": "@classe == \"Warlock\"", "reset": ["slot_1", "slot_2"], "label": "slot del Warlock" }],
  "lungo": [{ "reset": ["pf", "pf_temp"], "label": "punti ferita" }]
}
```

Con `restore` una risorsa recupera solo una parte (una formula), senza superare il massimo:

```json
{ "restore": [{ "key": "punti_magia", "amount": "floor(@livello / 2)" }], "label": "punti magia" }
```

Gli usi e i contatori dei privilegi si recuperano da soli in base alla loro ricarica.

## Sezioni

| Proprietà | Significato |
|---|---|
| `title` | Titolo mostrato sulla scheda. Le parti tra `{graffe}` sono formule, es. `Incantesimi {@classe}` |
| `tab` | Nome della scheda (tab) in cui compare. Le sezioni con la stessa `tab` sono raggruppate. Facoltativo |
| `columns` | Colonne della griglia, da 1 a 9 (su telefono diventano 2–3) |
| `tiles` | `true`: tutti i campi della sezione diventano tessere (valore grande e centrato) |
| `customizable` | `true`: il giocatore può rinominare e nascondere i campi della sezione (pulsante ⚙) |
| `fields` | Elenco dei campi |
| `showIf` | Formula: la sezione è visibile solo se il risultato è vero (es. `@multiclasse`). Facoltativo |

## Campi: proprietà comuni

| Proprietà | Significato |
|---|---|
| `key` | **Chiave unica** usata nelle formule (`@key`). Lettere, numeri e `_`; non può iniziare con un numero |
| `label` | Etichetta visibile; le parti tra `{graffe}` sono formule, es. `Dadi vita ({@tipo_dv})` |
| `type` | Tipo di campo (vedi sotto) |
| `span` | Quante colonne occupa |
| `default` | Valore iniziale |
| `showIf` | Formula: il campo è visibile solo se il risultato è vero |
| `tile` | `true`: il campo è mostrato come tessera |
| `hidden` | `true`: il campo non si mostra ma si può usare nelle formule (valori di appoggio) |
| `weight` | `true` se il campo riguarda peso/ingombro: viene nascosto quando il personaggio ha il peso disattivato |
| `sub` | Testo secondario sotto il valore; le parti tra `{graffe}` sono formule |

## Tipi di campo

| `type` | Descrizione | Proprietà specifiche | Nelle formule |
|---|---|---|---|
| `text` | Testo su una riga | `placeholder`, `suggestions` (elenco di proposte: si sceglie o si scrive liberamente) | `@key` → testo |
| `textarea` | Testo lungo | `rows`, `placeholder` | `@key` → testo |
| `richtext` | Testo formattato: si legge impaginato, un tocco apre la modifica con la barra grassetto / corsivo / elenco | `rows`, `placeholder` | `@key` → testo |
| `number` | Numero | | `@key` |
| `stat` | Caratteristica con modificatore | `mod` (formula, `@this` = valore) | `@key`, `@key_mod` |
| `computed` | Valore calcolato in sola lettura | `formula`, `signed` | `@key` |
| `skill` | Abilità con livelli di competenza (pallini) | `formula` (`@this` = livello), `levels`, `signed` | `@key` = bonus, `@key_level` |
| `resource` | Attuale / massimo con barra (PF, sanità…) | `max` (numero o formula) | `@key` = attuale, `@key_max` |
| `dots` | Pallini cliccabili | `max` (numero) | `@key` |
| `checkbox` | Casella | `menu` (se `true` non compare nella griglia ma come voce del menu ⋯ della scheda; testi facoltativi `menuOff` / `menuOn`) | `@key` → 1 o 0 |
| `select` | Scelta da elenco | `options` (array di testi) | `@key` → testo |
| `list` | Tabella con righe aggiungibili | `columns` | `@key` = numero di righe, `@key.colonna` = elenco valori |
| `features` | Privilegi: voci richiudibili con descrizione (`**grassetto**`, righe `- ` come elenco), usi con ricarica e un livello di sotto-privilegi | `placeholder` (testo quando è vuota), `variant: "journal"` (diario: solo titolo e testo, voci nuove in cima con la data) | `@key` = numero di privilegi |
| `image` | Immagine (ridimensionata e salvata nella scheda) | | — |

### Colonne delle liste

```json
{ "key": "inventario", "type": "list", "label": "Inventario",
  "columns": [
    { "key": "oggetto", "label": "Oggetto", "type": "text", "width": 3 },
    { "key": "note", "label": "Note", "type": "notes" },
    { "key": "qta", "label": "Qtà", "type": "number" },
    { "key": "peso", "label": "Peso", "type": "number", "weight": true },
    { "key": "tot", "label": "Totale", "type": "computed", "formula": "@row.qta * @row.peso", "weight": true }
  ],
  "default": [ { "oggetto": "Corda", "qta": 1, "peso": 2 } ]
}
```

Opzioni della lista:

| Proprietà | Significato |
|---|---|
| `groupBy` | Chiave di una colonna: le righe vengono divise in gruppi richiudibili secondo quel valore (la colonna non si mostra) |
| `groups` | Elenco dei gruppi, es. `[[0, "Trucchetti"], [1, "Livello 1"]]` |
| `itemLabel` | Nome delle righe nel conteggio, es. `["incantesimo", "incantesimi"]` |
| `countCheck` | Conta anche le righe con una casella spuntata, es. `{ "key": "prep", "label": "preparati" }` |
| `addLabel` | Testo del pulsante di aggiunta in ogni gruppo |
| `scroll` | `true`: ogni riga resta su una linea e la tabella scorre di lato, con la prima colonna fissa |

Tipi di colonna: `text`, `number`, `checkbox`, `computed` (con `formula`, dove si usa
`@row.colonna`), `select` (con `options`), `notes` (un pulsante che apre la nota in una
finestra a comparsa). `width` è la larghezza relativa; `weight: true` nasconde la colonna
quando il peso è disattivato.

## Formule

| Elemento | Esempio |
|---|---|
| Numeri, testi | `3`, `2.5`, `"Mago"` |
| Riferimenti | `@forza`, `@forza_mod`, `@pf_max`, `@inventario.peso`, `@row.qta` |
| `@this` | Il campo stesso. Nella formula "propria" di un campo (`mod`, `formula` di un'abilità, `sub`) è il valore grezzo |
| Aritmetica | `+ - * / % ^` (divisione per zero = 0) |
| Confronti | `== != < > <= >=` (con testi, `==` ignora maiuscole) |
| Logica | `&& || !` |
| Funzioni | `floor ceil round abs min max clamp(x, lo, hi) sum count avg if(cond, vero, falso) concat(testi…)` |

Esempi:

```text
2 + floor((@livello - 1) / 4)                         bonus di competenza D&D
@des_mod + @this * @comp                              abilità con competenza/maestria
if(@car_inc == "Saggezza", @sag_mod, @int_mod)        scelta della caratteristica
sum(@inventario.tot)                                  peso totale
@livello + if(@multiclasse, @livello_2, 0)            livello totale con multiclasse
```

## File esportati

I file `.json` esportati hanno questa forma:

```json
{ "format": "gdr-schede", "formatVersion": 1, "type": "character", "character": { … }, "system": { … } }
```

`type` può essere `character` (personaggio con il suo modello), `system` (solo modello) o
`backup` (tutto). Per ora l'app importa solo `character` e `backup`; i file `system` si possono
esportare ma non importare.

I valori inseriti a mano al posto di quelli calcolati stanno in `character.values._manuale`
(es. `{ "iniziativa": 7, "des_mod": 4 }`); le personalizzazioni delle sezioni in
`character.values._sezioni`.

I valori del personaggio sono salvati per chiave in `character.values`: se modifichi un
modello, i valori dei campi esistenti restano; quelli di campi rimossi vengono conservati
e ricompaiono se ricrei un campo con la stessa chiave.

### Privilegi (`features`)

Ogni voce è salvata così:

```json
{ "nome": "Sorgente di Magia", "testo": "…", "usi": 0, "usati": 0, "ricarica": "", "aperto": true,
  "contatori": [
    { "nome": "Punti Stregoneria", "max": "@livello", "usati": 1, "ricarica": "Riposo lungo", "nota": "…" }
  ],
  "figli": [ { "nome": "Metamagia", "testo": "…", "usi": 0, "aperto": true, "contatori": [] } ] }
```

`max` di un contatore è un numero o una formula. `ricarica` è uno fra `""`, `"Riposo breve"`, `"Riposo lungo"`, `"Alba"`, `"Altro"`. Le voci delle
vecchie liste (`{ nome, note, usi: "2/riposo lungo" }`) vengono convertite automaticamente.
