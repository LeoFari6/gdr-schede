# Schede GdR

Schede personaggio per **D&D 5ª edizione** e una **scheda generica**, pensate per giocare
dal vivo al tavolo (i dadi si tirano veri: l'app non ha tiri digitali).
Una web app statica, senza server e senza dipendenze: si apre nel browser, funziona
offline e si installa sul telefono come un'app.

## Cosa fa

- **D&D 5ª edizione:** caratteristiche e modificatori, tiri salvezza, abilità con competenza e
  maestria, combattimento, attacchi, inventario e monete.
  - **Classe:** si sceglie dall'elenco (le 13 classi) oppure si scrive per una classe homebrew. La
    caratteristica da incantatore si imposta da sola in base alla classe.
  - **Slot e livelli di incantesimo** seguono la tabella della classe (regole 2014); i trucchetti
    restano sempre visibili. Con una classe homebrew si vede tutto.
  - **Dadi vita** per classe (d6–d12 in base alla classe), con un contatore separato per la
    seconda classe se si multiclassa.
  - **Riposi:** *Riposo breve* recupera gli slot del Warlock e gli usi "riposo breve"; *Riposo lungo*
    riporta i PF al massimo, azzera PF temporanei e tiri contro morte, recupera tutti gli slot, tutti
    i dadi vita e gli usi.
  - **Multiclasse:** dal menu ⋯ della scheda scegli *Aggiungi seconda classe*. Il bonus di
    competenza usa il livello totale e la tab *Incantesimi* si divide in due blocchi, uno per
    classe, ognuno con caratteristica, CD, bonus di attacco, slot ed elenco propri (gli slot
    non sono condivisi).
  - **Incantesimi divisi per livello** (trucchetti, 1°–9°), ognuno richiudibile con il conteggio
    di conosciuti e preparati. Ogni incantesimo sta su una riga che scorre di lato (scuola,
    tempo di lancio, gittata, componenti, durata, descrizione), con il nome sempre visibile.
  - **Privilegi:** sezioni per razza, background, ciascuna classe (la seconda compare col
    multiclasse) e talenti. Ogni privilegio (e sotto-privilegio) si apre e si chiude, ha una
    descrizione con **grassetto**, *corsivo* ed elenchi, un contatore degli usi a rotellina con
    la ricarica (riposo breve, lungo, alba) e una tabella di contatori propri (es. Punti
    Stregoneria, col massimo anche a formula come `@livello`). *Riposo breve* e *Riposo lungo*
    nel menu ⋯ recuperano usi e contatori.
  - **Storia:** aspetto (età, altezza, peso, occhi, capelli, carnagione e descrizione),
    personalità, storia del personaggio, alleati e organizzazioni.
  - **Note:** appunti divisi in schede (PNG, luoghi, indizi… si aggiungono, si rinominano, si
    eliminano, si aprono e si chiudono, e il testo si scrive direttamente) e diario delle sessioni
    (le voci nuove in cima, con la data; quelle chiuse mostrano un'anteprima).
  - Testi formattati: si leggono impaginati e un tocco apre la modifica; si scrive con
    `**grassetto**`, `*corsivo*`, righe `- ` per gli elenchi, `# ` per i titoli e `---` per una
    linea di separazione.
  - **Immagini nei testi:** "Aggiungi immagine" mentre scrivi (appunti, storia, diario, privilegi);
    vengono ridotte e salvate a parte nel browser, si aprono a schermo intero con un tocco e
    sono incluse nei file esportati. Con ⤢ sull'immagine se ne sceglie la grandezza (piccola,
    media, grande, intera o col cursore).
- **Generico:** caratteristiche, punti vita, inventario, capacità e note.
- **Valori a mano.** Ogni valore calcolato (iniziativa, competenza, modificatori, abilità, CD…)
  si tocca e si può scrivere a mano; "Automatico" torna al calcolo. I valori a mano sono
  sottolineati con il colore della scheda.
- **Monete personalizzabili.** Con ⚙ nella sezione Monete si rinominano i tagli e si tengono
  solo quelli che servono (fino a 5).
- **Note a comparsa.** Oggetti dell'inventario, incantesimi e privilegi hanno un pulsante
  📄: la nota si apre in una finestra a comparsa. Il pulsante si colora quando la nota c'è.
- **Peso e ingombro facoltativi.** Sono disattivati di default; si attivano per ogni
  personaggio dal menu ⋯ della scheda (*Attiva peso e ingombro*).
- **Modelli modificabili.** Nella home le schede incluse (D&D 5e in evidenza, Generico) sono
  separate dai tuoi modelli. Duplica un modello incluso e adattalo nell'editor visuale
  (anteprima in tempo reale, controllo degli errori, modalità JSON). Le formule
  (`floor((@forza - 10) / 2)`, `sum(@inventario.peso)`…) si aggiornano mentre scrivi; campi
  e sezioni possono essere visibili solo a una condizione (`@multiclasse`).
- **Portabile.** Salvataggio automatico nel browser; esporta e importa personaggi (con il loro
  modello incluso) o un backup completo in JSON. Per ora non si importano modelli da soli.
  Stampa / PDF.
- **Elenco incantesimi (schede D&D).** Dal menu ⋯ della scheda o dal pulsante nella tab
  Incantesimi si apre l'elenco: si cerca, si filtra per livello, si modifica ogni incantesimo a
  mano (es. per tradurlo), se ne aggiungono di nuovi, si importa un proprio file CSV
  (sostituendo o aggiungendo solo i nuovi) e lo si esporta. Scrivendo il nome nella scheda
  compaiono i suggerimenti e la riga si compila da sola. L'elenco resta salvato solo sul
  dispositivo: l'app non contiene testi dei manuali.
- **Mobile first.** Layout adattivo, tema chiaro/scuro, installabile (PWA) e utilizzabile offline.

## Avvio in locale

Serve un server statico qualsiasi: i moduli ES non si caricano da `file://`.

```bash
python3 -m http.server 8080
# oppure
npx serve .
```

Poi apri <http://localhost:8080>.

## Test

```bash
npm test     # usa il test runner integrato di Node (≥ 18), nessuna dipendenza
```

I test coprono il parser delle formule, il motore della scheda (multiclasse, visibilità
condizionale) e la validità dei modelli inclusi.

## Struttura

```
index.html              pagina unica
css/style.css           stile (tema chiaro/scuro, mobile, stampa)
js/app.js               avvio e routing (#/, #/c/<id>, #/t/<id>)
js/formula.js           parser di formule (senza eval)
js/engine.js            motore della scheda: valori derivati, riferimenti, validazione
js/systems.js           modelli inclusi
js/store.js             salvataggio in localStorage, import/export
js/sheet-render.js      disegno della scheda a partire dal modello
js/views/               home, scheda personaggio, editor dei modelli
sw.js, manifest.webmanifest   uso offline e installazione
docs/FORMATO_MODELLI.md formato JSON dei modelli
tests/                  test con node:test
```

## Creare un modello

Il modo più rapido è duplicare *Generico* dalla home e modificarlo nell'editor.
Il formato completo, con tutti i tipi di campo e la sintassi delle formule, è descritto in
[docs/FORMATO_MODELLI.md](docs/FORMATO_MODELLI.md).

## Idee per il futuro

- Sincronizzazione tra dispositivi
- Condivisione di un personaggio tramite link
- Galleria di modelli della community
- Note di sessione e diario del personaggio

## Note legali

I modelli inclusi contengono solo nomi di statistiche e regole di calcolo, nessun testo dei
manuali. Dungeons & Dragons è un marchio di Wizards of the Coast. Questo progetto non è
affiliato né approvato da Wizards of the Coast.

Licenza: [MIT](LICENSE).
