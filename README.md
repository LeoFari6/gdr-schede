# Schede GdR

Schede personaggio per **D&D 5ª edizione** e **Cyberpunk RED**, pensate per giocare
dal vivo al tavolo. C'è anche un tiro di dadi digitale, per quando servono.
Una web app statica, senza server e senza dipendenze: si apre nel browser, funziona
offline e si installa sul telefono come un'app.

## Cosa fa

- **D&D 5ª edizione:** caratteristiche e modificatori, tiri salvezza, abilità con competenza e
  maestria, combattimento, attacchi, inventario e monete.
  - **Classe:** si sceglie dall'elenco (le 13 classi) oppure si scrive per una classe homebrew. La
    caratteristica da incantatore si imposta da sola in base alla classe.
  - **Slot e livelli di incantesimo** seguono la tabella della classe (regole 2014); i trucchetti
    restano sempre visibili. Con una classe homebrew si vede tutto. Con "Numero di slot" nella
    sezione Incantesimi si cambia a mano quanti slot ha ogni livello (vuoto = automatico).
  - **Dadi vita** in un solo riquadro, una riga per classe: il dado (d6–d12) in evidenza, il nome
    della classe e i dadi rimasti. Il dado si cambia toccandolo (di base è quello della classe; cambiando
    classe torna quello della nuova) e il numero massimo si può scrivere a mano (vuoto = livello).
  - **Sali / Scendi di livello:** dal menu ⋯ della scheda. In multiclasse si sceglie la classe. Salendo
    si sceglie se tirare il dado vita (scrivendo il risultato) o prendere la media, + mod. COS; con una
    classe dell'elenco compare un riepilogo animato (competenza, dadi vita, slot, nuovi livelli di
    incantesimo, aumento dei punteggi di caratteristica). Scendendo si tolgono i PF presi a quel
    livello (l'app li ricorda; se non li conosce propone la media).
  - **Riposi:** *Riposo breve* recupera gli slot del Warlock e gli usi "riposo breve"; *Riposo lungo*
    riporta i PF al massimo, azzera PF temporanei e tiri contro morte, recupera tutti gli slot, tutti
    i dadi vita e gli usi. Nel riposo breve si possono spendere
    dadi vita (quanti per classe e la somma del tiro; ogni dado aggiunge il mod. COS). Dopo il riposo
    compare un riepilogo con cosa è stato recuperato
    (valori prima e dopo).
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
  - **Tabelle nei testi:** "Tabella" mentre scrivi (privilegi, appunti, storia, diario) apre una
    griglia dove si aggiungono righe e colonne, con l'intestazione facoltativa; la tabella si
    modifica poi con ✎. Nel testo è scritta come righe `| FOR | DES |`.
  - **Immagini nei testi:** "Aggiungi immagine" mentre scrivi (appunti, storia, diario, privilegi);
    vengono ridotte e salvate a parte nel browser, si aprono a schermo intero con un tocco e
    sono incluse nei file esportati. Con ⤢ sull'immagine se ne sceglie la grandezza (piccola,
    media, grande, intera o col cursore).
- **Cyberpunk RED:** ruolo con abilità di ruolo e rango, le 10 statistiche, tutte le abilità divise per
  categoria (livello 0–10, base = statistica + livello), punti ferita calcolati da COR e VOL con la
  condizione (leggermente / gravemente ferito, morente), tiro salvezza contro morte, umanità ed EMP
  attuale, punti fortuna, armatura (SP di testa e corpo che si consuma), armi con il tiro calcolato,
  ferite critiche, cyberware con la perdita di umanità, equipaggiamento, netrunning (per i Netrunner),
  lifepath, appunti e diario.
- **Tira i dadi.** Il pulsante con il dado in alto nella scheda: tocchi i dadi da aggiungere (anche
  di tipi diversi, es. 2d20 + 1d6, fino a 20 in tutto), un modificatore; i dadi rotolano e si fermano sul risultato, con il totale e gli ultimi tiri. Sul d20
  il 20 naturale si colora di verde e l'1 di rosso scuro. Toccando uno o più dadi tirati li selezioni e con
  "Ritira" li rilanci (il totale si aggiorna).
- **Valori a mano.** Ogni valore calcolato (iniziativa, competenza, modificatori, abilità, CD…)
  si tocca e si può scrivere a mano; "Automatico" torna al calcolo. I valori a mano sono
  sottolineati con il colore della scheda.
- **Monete personalizzabili.** Con ⚙ nella sezione Monete si rinominano i tagli e si tengono
  solo quelli che servono (fino a 5).
- **Ritratto ritagliabile.** Scegliendo l'immagine del personaggio si apre il ritaglio: zoom (cursore,
  rotellina o due dita) e trascinamento. "Ritaglia" permette di rifarlo dall'immagine originale.
- **Emoji negli oggetti.** A sinistra del nome di ogni oggetto dell'inventario si può mettere
  un'emoji (dall'elenco o scritta a mano).
- **Note a comparsa.** Oggetti dell'inventario, incantesimi e privilegi hanno un pulsante
  📄: la nota si apre in una finestra a comparsa. Il pulsante si colora quando la nota c'è.
- **Peso e ingombro facoltativi.** Sono disattivati di default; si attivano per ogni
  personaggio dal menu ⋯ della scheda (*Attiva peso e ingombro*).
- **Due schede incluse.** D&D 5ª edizione (in evidenza nella home) e Cyberpunk RED. Non si creano
  né si modificano altri modelli di scheda: si usano solo quelli inclusi nell'app.
- **Portabile.** Salvataggio automatico nel browser; esporta e importa personaggi o un backup
  completo in JSON.
  Stampa / PDF.
- **Elenco incantesimi (schede D&D).** Dal menu ⋯ della scheda o dal pulsante nella tab
  Incantesimi si apre l'elenco: si cerca, si filtra per livello, si modifica ogni incantesimo a
  mano (es. per tradurlo), se ne aggiungono di nuovi, si importa un proprio file CSV
  (sostituendo o aggiungendo solo i nuovi) e lo si esporta. Scrivendo il nome nella scheda
  compaiono i suggerimenti e la riga si compila da sola. L'elenco resta salvato solo sul
  dispositivo: l'app non contiene testi dei manuali.
- **Italiano e inglese.** Il pulsante IT / EN in alto nella home cambia la lingua (la prima volta
  segue quella del browser). Si traducono interfaccia e schede incluse; i dati salvati restano
  gli stessi, quindi un personaggio si apre uguale in entrambe le lingue. I testi scritti da te
  restano come li hai scritti.
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
js/app.js               avvio e routing (#/, #/c/<id>)
js/formula.js           parser di formule (senza eval)
js/engine.js            motore della scheda: valori derivati, riferimenti, validazione
js/systems.js           le schede incluse (D&D 5e, Cyberpunk RED)
js/store.js             salvataggio in localStorage, import/export
js/i18n.js              lingua (italiano / inglese); js/i18n-en.js le traduzioni
js/sheet-render.js      disegno della scheda a partire dal modello
js/views/               home, scheda personaggio, elenco incantesimi
sw.js, manifest.webmanifest   uso offline e installazione
tests/                  test con node:test
```

## Idee per il futuro

- Sincronizzazione tra dispositivi
- Condivisione di un personaggio tramite link
- Note di sessione e diario del personaggio

## Note legali

I modelli inclusi contengono solo nomi di statistiche e regole di calcolo, nessun testo dei
manuali. Dungeons & Dragons è un marchio di Wizards of the Coast. Questo progetto non è
affiliato né approvato da Wizards of the Coast.

Licenza: [MIT](LICENSE).
