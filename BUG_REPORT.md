# Bug Report - Gestionale LS SOFFASS

Generato il: 23/06/2026
Audit tecnico completo del codice esistente.

---

## 1. PROBLEMA ARCHITETTURALE: Mancanza del campo `picking`

### Gravità: CRITICA
### File: `src/db/schema.sql`, `src/routes/documenti.js`, `src/routes/giacenze.js`, `src/routes/export.js`

Il campo `picking` non esiste in nessuna tabella. L'intera applicazione è costruita attorno a `codice_articolo` come chiave primaria di giacenza, ma il requisito domanda che `picking` sia il riferimento principale.

**Impatto:**
- Le giacenze sono aggregate per `codice_articolo` invece che per `picking`
- La logica duplicati usa `numero_bolla + codice_articolo` invece di `picking`
- Non c'è modo di raggruppare documenti per picking

**Necessario:**
- Aggiungere `picking` alle tabelle `documenti`, `movimenti`, `giacenze`
- Rendere UNIQUE su `documenti` come `(picking, numero_bolla)` invece di `(numero_bolla, codice_articolo)`
- Aggregare giacenze per `picking` (o per `picking + codice_articolo`)

---

## 2. DUPLICATI BASATI SU `numero_bolla + codice_articolo`

### Gravità: ALTA
### File: `src/routes/documenti.js` (righe 17-24, 41-46)

**Problema:**
```js
.eq("numero_bolla", ocrData.numero_bolla)
.eq("codice_articolo", ocrData.codice_articolo)
```
La logica duplicati cerca corrispondenza su `numero_bolla + codice_articolo`. Ma sulla stessa bolla possono esserci più articoli, e lo stesso articolo può apparire su più bolle. Questo produce falsi positivi e falsi negativi.

Inoltre, il constraint UNIQUE sullo schema SQL è anch'esso `(numero_bolla, codice_articolo)`, il che impedisce legittimamente di avere più righe con stesso articolo su bolle diverse (se per errore hanno stesso numero bolla).

**Raccomandazione:** La chiave univoca deve diventare `(picking, numero_bolla)`.

---

## 3. GIACENZE TRACCIATE PER `codice_articolo` SOLO

### Gravità: ALTA
### File: `src/routes/documenti.js` (funzioni `aggiornaGiacenze`, `refreshGiacenze`)

Le funzioni `aggiornaGiacenze()` e `refreshGiacenze()` operano esclusivamente su `codice_articolo`. La tabella `giacenze` ha `codice_articolo` come UNIQUE.

**Problemi:**
- Se lo stesso articolo è in picking diversi, le quantità vengono sommate incorrettamente
- Una USCITA potrebbe scalare giacenza di un articolo che era in un picking diverso
- La funzione `refreshGiacenze()` ricalcola da zero scorrendo TUTTI i documenti con quel `codice_articolo`, ignorando i picking

---

## 4. CLASSIFICAZIONE ENTRATA/USCITA: ESTRAPOLAZIONE FRAGILE

### Gravità: ALTA
### File: `src/services/ocrService.js` (righe 117-125)

```js
classifyDocument(text) {
  if (/logistic\s*solution/i.test(d)) return { tipo: "ENTRATA", ... };
  if (/logistic\s*solution/i.test(m)) return { tipo: "USCITA", ... };
  return { tipo: "ENTRATA", motivazione: "Default" };
}
```

**Problemi:**
1. **Default a ENTRATA** - Se l'OCR non trova "Logistic Solution" nel destinatario (es. OCR sporco), classifica sempre ENTRATA. Questo è pericoloso: un'USCITA non riconosciuta crea giacenze errate.
2. **Regex senza contesto** - La regex `DESTINATARIO\s*MERCI[\s\S]{0,400}?` cattura fino a 400 caratteri dopo l'intestazione. Se il testo OCR è sporco, può catturare la sezione sbagliata.
3. **Fallback a ENTRATA** senza chiedere conferma all'utente.

**Raccomandazione:** La classificazione deve avvenire esclusivamente sui campi:
- `LUOGO SPEDIZIONE` contiene riferimento Logistic Solution → USCITA
- `DESTINATARIO MERCI` contiene riferimento Logistic Solution → ENTRATA

E se l'OCR non riesce a determinarlo, il sistema deve richiedere selezione manuale obbligatoria.

---

## 5. INCONSISTENZE TRA DOCUMENTI, MOVIMENTI, GIACENZE

### Gravità: ALTA

### 5a. `refreshGiacenze` NON usa i movimenti
**File:** `src/routes/documenti.js` (righe 117-130)

`refreshGiacenze()` rilegge tutti i `documenti` con quel `codice_articolo` e ricalcola le giacenze. Ma:
- Non usa la tabella `movimenti` come source of truth
- Non considera i `movimenti` che potrebbero essere stati creati manualmente (non c'è un endpoint per crearli)
- Se un documento viene cancellato e poi ripristinato, i movimenti associati vengono cancellati e ricreati (riga 71)

### 5b. `peso_totale` salvato in modo incoerente
**File:** `src/routes/documenti.js` (riga 59)

```js
peso_totale: doc.peso_totale || doc.quantita || 0,
```

Se `peso_totale` è 0, viene sostituito con `doc.quantita`. Ma se l'utente inserisce 0 intenzionalmente, viene ignorato. Inoltre, se `quantita` è un numero e `peso_totale` è null, il movimento registra `peso` come `quantita`, creando confusione tra quantità e peso nei report Excel.

### 5c. `aggiornaGiacenze` usa `peso_totale || quantita`
**File:** `src/routes/documenti.js` (riga 105)

Stessa logica ambigua: `parseFloat(doc.peso_totale || doc.quantita || 0)`. Se `peso_totale = 0`, usa `quantita`, che potrebbe essere un valore completamente diverso (es. metri lineari vs kg).

### 5d. Movimenti non hanno `numero_documento` né `numero_ordine`
**File:** `src/routes/documenti.js` (righe 95-101)

La funzione `creaMovimento` salva solo `numero_bolla`, non `numero_documento` né `numero_ordine`. Collegamento impossibile tra movimenti e documenti completi.

---

## 6. ASSENZA DI TRANSAZIONI DATABASE

### Gravità: ALTA
### File: `src/routes/documenti.js` (righe 66-93)

**Niente transazioni.** Il salvataggio avviene in 4+ chiamate separate a Supabase:
1. `insert/update documenti`
2. `delete movimenti` (in caso di update)
3. `insert movimenti`
4. `delete dettaglio` (in caso di update)
5. `insert dettaglio`
6. `aggiornaGiacenze/refreshGiacenze`

Se una qualsiasi delle chiamate dopo la prima fallisce, il database rimane in uno stato inconsistente: documento salvato ma senza movimento/giacenza, o movimento cancellato ma non ricreato.

Supabase (PostgreSQL) supporta transazioni SQL, ma il codice usa la REST API che non ha transazioni atomiche. Servirebbe `supabase.rpc()` per chiamare funzioni SQL che eseguono transazioni lato server.

---

## 7. REGEX OCR FRAGILI

### Gravità: MEDIA
### File: `src/services/ocrService.js`

### 7a. Estrazione numero bolla (righe 25-34)

```js
let bolla = ex(/(?:BOLLA|bolla|Bolla|golla)[\s:.]*(\d{7,15})/i);
```

**Fragilità:**
- La regex cerca "golla" (tipico errore OCR per "bolla") ma non copre altre varianti
- Il fallback prende il primo numero di 10 cifre nel testo, che potrebbe essere un numero di telefono, ordine, o documento
- Sulla seconda pagina (packing list) cerca `\b(\d{10})\b` ma la bolla potrebbe essere di 8, 9, 11, 12 cifre

### 7b. Estrazione data (riga 41)

```js
data_documento: ex(/DATA\s*(?:USCITA\s*MERCI|DOCUMENTO)\s*[_:.\s]*(\d{2}\/\d{2}\/\d{4})/i),
```

**Fragilità:**
- Assume formato `dd/MM/yyyy` sempre
- Se l'OCR riconosce male i separatori (es. "26-03-2026" o "26 03 2026"), non matcha
- CamScanner produce testi sporchi: "DATA USCITA MERCI 26/03/2026" o "DATA DOCUMENTO 26/03/2026" ma con caratteri OCR-incerti

### 7c. Estrazione articolo concatenato (riga 61)

```js
const artLine = text.match(/(\w{6,18})\s+(\d{4,10})\s+(.{3,80}?)\s+(?:KG|LT|MT|PZ)[\s.]+([\d.,]+)/i);
```

**Fragilità:**
- Assume che il codice articolo sia diviso in due parti da spazi (es. "300652N280A 1257007")
- Il quantifier `{3,80}` per la descrizione è troppo ampio e può catturare testo oltre il previsto
- L'assunzione che l'unità di misura sia sempre "KG|LT|MT|PZ" esclude unità come "MQ", "ML", "NR"
- Se l'OCR unisce le parole (tipico di CamScanner), il match fallisce completamente

### 7d. Estrazione dettaglio packing list (righe 96-112)

```js
if (parts.length >= 4 && /^[A-Z0-9]{6,}/i.test(parts[0])) {
```

**Fragilità:**
- Assume che la partita/lotto sia il primo campo, seguita da almeno 4 token separati da spazi
- Un codice come "300652N280A1257007" matcha, MA se la riga contiene spazi extra o è spezzata, non matcha
- Lo stop è su "Totale" — se l'OCR non riconosce "Totale" a causa di caratteri sporchi, il parsing continua su righe non pertinenti

### 7e. Estrazione mittente/destinatario (righe 52-56)

```js
const locMatch = text.match(/(?:LUOGO\s*SPEDIZIONE|que\s*\w+)[\s\S]{0,5}?(Soffass[^\n]{10,80}?)(?:\s*CPT|\s*DESTINATARIO|\n\s*\n|$)/i);
const destMatch = text.match(/DESTINATARIO\s*MERCI[\s\S]{0,200}?(Soffass[^\n]{2,80}?)(?:\s*Via|\s*\d{2,}|$)/i);
```

**Fragilità:**
- Cerca "que\s*\w+" per "LUOGO SPEDIZIONE" quando OCR sbaglia — potrebbe matchare testo completamente diverso
- I lookahead `(?:\s*CPT|\s*DESTINATARIO|\n\s*\n|$)` potrebbero non funzionare se il layout è diverso
- Il quantifier `{10,80}` per il nome Soffass è fragile: se l'indirizzo è più corto o più lungo, fallisce

### 7f. Estrazione vettore (riga 83)

```js
const vt = text.match(/VETTORE\s*\d*[\s\S]{0,80}?(M\.K\.[^\n]+)/i);
```

**Fragilità:**
- Hard-coded per matchare "M.K." — funziona solo per quel vettore specifico
- Se il vettore è diverso (es. "BRT", "SDA", "GLS"), non matcha nulla

### 7g. Estrazione totale colli/peso (riga 87)

```js
const tot = text.match(/Totale\s*(?:Pos\.)?\s*(\d+)\s+(\d+)\s+([\d.,]+)/i);
```

**Fragilità:**
- Assume formato "Totale Pos. XX YY ZZZ.ZZ" con esattamente 3 numeri
- Se l'OCR aggiunge spazi o caratteri extra, non matcha

---

## 8. GESTIONE PDF MULTIPAGINA

### Gravità: MEDIA
### File: `src/services/pdfService.js`, `src/services/ocrService.js`

**Analisi:**
- `pdfService.js` usa `pdftoppm` che gestisce correttamente PDF multipagina, generando `page-1.png`, `page-2.png`, ecc.
- `tesseractService.js` processa tutte le pagine in sequenza e unisce i testi con marker `=== PAGE N ===`
- La funzione `parseDocument` cerca dati su tutte le pagine

**Problemi:**
1. **Nessuna gestione separata per pagina** - I dati della prima pagina (DDT) e della seconda (Packing List) vengono mischiati. Se l'ordine delle pagine è invertito o se ci sono più di 2 pagine, il parsing fallisce.
2. **Dettaglio con split sbagliato** (riga 98) - Il dettaglio cerca qualsiasi riga tra "Partita Lotto" e "Totale", potenzialmente su qualsiasi pagina.
3. **File temporanei** - Le immagini vengono pulite nel `finally` block (riga 16), ma se il processo OCR fallisce, la directory potrebbe non essere pulita correttamente.
4. **Nessun limite di pagine** - Un PDF con 100 pagine genererebbe 100 immagini PNG a 300 DPI, consumando centinaia di MB e potenzialmente esaurendo la memoria.

---

## 9. IMPORT PDF MULTIPLO ASSENTE

### Gravità: MEDIA

Non esiste alcun endpoint per il caricamento massivo di PDF. L'unico endpoint è `/api/documenti/upload` che accetta un singolo file.

**Necessario per import massivo:**
- Endpoint che accetti array di file o ZIP con PDF
- Elaborazione in coda (per evitare timeout su Render)
- Report riepilogativo con esiti (successi/fallimenti per ogni PDF)

---

## 10. PROBLEMI DI SICUREZZA

### Gravità: MEDIA

### 10a. `sb_publishable_` (anon key) nell'env
**File:** `.env`

La chiave anonima di Supabase è pubblica per definizione (è il client-side key). Questo è normale per un'app PWA, ma:
- Se qualcuno ruba la chiave e la URL, può leggere/ scrivere sui dati (le RLS policy permettono a tutti gli utenti autenticati di fare tutto)
- Le RLS policy concedono accesso completo a TUTTI gli utenti autenticati, senza distinzione di ruolo

### 10b. Secret hard-coded
**File:** `.env`

`SESSION_SECRET=ls-soffass-wms-secret-2026` è un secret debole e hard-coded. Non viene nemmeno usato nel codice (non c'è `express-session`).

### 10c. Multer senza limiti di sicurezza
**File:** `server.js` (riga 33)

`multer` permette upload di qualsiasi file con estensione `.pdf` (controllato solo lato client). Un utente malevolo potrebbe caricare file non-PDF rinominati come `.pdf`.

---

## 11. PROBLEMI VARI

### Gravità: BASSA/MEDIA

### 11a. `peso_totale` con `step="1"` nel frontend
**File:** `public/js/ingresso.js` (riga 94)

`<input type="number" step="1" id="f-peso_totale">` costringe a numeri interi, ma i pesi hanno spesso decimali (es. 14.900 kg → l'OCR estrae 14.9). L'utente deve modificare manualmente.

### 11b. Codice articolo concatenato fragile
**File:** `src/services/ocrService.js` (riga 63)

`data.codice_articolo = artLine[1].trim() + artLine[2].trim();` — se l'OCR mette uno spazio in mezzo al codice (es. "300652N280 A1257007"), la concatenazione è errata.

### 11c. Package.json con dipendenze inutilizzate
**File:** `package.json`

`bcryptjs`, `pdf2pic`, `sharp`, `uuid` sono installati ma non utilizzati nel codice (si usa `pdftoppm` invece di `pdf2pic`/`sharp`, e `gen_random_uuid()` di PostgreSQL invece di `uuid`).

### 11d. Middleware auth.js usa `.then()/.catch()` invece di async/await
**File:** `src/middleware/auth.js` (righe 8-21)

Uso di Promise chain in un middleware che potrebbe essere async/await per consistenza con il resto del codice.

### 11e. Gestione errori OCR asincrona
**File:** `src/routes/documenti.js` (righe 27-29)

Quando l'OCR fallisce, la risposta è comunque 200 con `message: "PDF caricato, OCR fallito"`. Il frontend lo tratta come successo parziale. Non c'è un vero codice di errore HTTP.

### 11f. Assenza di logging strutturato
Nessun logger. Solo `console.error` sparsi. Su Render.com non ci sarà modo di tracciare errori in produzione.

---

## 12. RIEPILOGO PRIORITÀ

| # | Problema | Gravità | Azione Richiesta |
|---|----------|---------|------------------|
| 1 | Mancanza campo `picking` | CRITICA | Aggiungere a DB, routes, export |
| 2 | Duplicati su `bolla+articolo` | ALTA | Cambiare in `picking+bolla` |
| 3 | Giacenze per `codice_articolo` | ALTA | Tracciare per `picking` |
| 4 | Classificazione ENTRATA/USCITA | ALTA | Usare solo luoghi spedizione/destinazione, non euristiche |
| 5 | Inconsistenze doc/mov/giac | ALTA | Allineamento dati, movimenti come source of truth |
| 6 | Transazioni assenti | ALTA | Usare RPC PostgreSQL o funzione SQL |
| 7 | Regex OCR fragili | MEDIA | Rafforzare regex, gestire formati CamScanner |
| 8 | Multi-pagina senza controllo | MEDIA | Validazione pagine, limite massimo pagine |
| 9 | Import massivo assente | MEDIA | Nuovo endpoint per batch/ZIP |
| 10 | Sicurezza | MEDIA | RLS più granulari, validazione file upload |
| 11 | Problemi minori | BASSA | Step decimali, dipendenze inutili, logging |

---

## 13. NOTE TECNICHE

### Struttura database attuale (riassunto)

```
documenti
  id UUID PK
  tipo ENUM(ENTRATA, USCITA)
  numero_bolla VARCHAR(50) NOT NULL
  codice_articolo VARCHAR(50) NOT NULL
  UNIQUE(numero_bolla, codice_articolo)  ← PROBLEMA: dovrebbe includere picking

giacenze
  codice_articolo VARCHAR(50) NOT NULL UNIQUE  ← PROBLEMA: dovrebbe essere per picking

movimenti
  documento_id UUID → documenti.id
  codice_articolo VARCHAR(50) NOT NULL  ← PROBLEMA: manca picking

dettaglio_documenti
  documento_id UUID → documenti.id ON DELETE CASCADE
```

### Flusso salvataggio attuale (non atomico)

```
POST /api/documenti/save
  1. INSERT/UPDATE documenti
  2. DELETE movimenti (se update)
  3. INSERT movimenti
  4. DELETE dettaglio (se update)
  5. INSERT dettaglio
  6. aggiornaGiacenze / refreshGiacenze
  7. Se un passo fallisce → STATO INCONSISTENTE
```

### Classificazione ENTRATA/USCITA attuale

```
classifyDocument(text):
  se "logistic solution" in DESTINATARIO → ENTRATA
  se "logistic solution" in LUOGO SPEDIZIONE → USCITA
  default → ENTRATA (PERICOLOSO)
```

### Regex OCR principali (da rifare)

| Campo | Regex | Problema |
|-------|-------|----------|
| numero_bolla | `(?:BOLLA\|bolla\|Bolla\|golla)[\s:.]*(\d{7,15})` | Copre solo varianti base |
| data | `\d{2}\/\d{2}\/\d{4}` | Assume formato fisso |
| articolo | `(\w{6,18})\s+(\d{4,10})\s+(.{3,80}?)\s+(?:KG\|LT\|MT\|PZ)[\s.]+([\d.,]+)` | Troppe assunzioni |
| dettaglio PL | split su spazi, >=4 token | Fragile con OCR sporco |
| mittente/dest | .{0,200}?Soffass[^\n]{2,80}? | Lunghezza fissa arbitraria |
| vettore | M\.K\.[^\n]+ | Hard-coded per un vettore |
