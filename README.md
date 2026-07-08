# LS SOFFASS WMS

Gestionale magazzino per gestione bolle, giacenze e movimenti pallet Soffass. Include OCR su PDF (Tesseract), import/export Excel, dashboard con riepilogo e autenticazione Supabase.

## Stack

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Vanilla JS (SPA), PWA con manifest |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL + Auth + RPC) |
| OCR | Tesseract.js + Tesseract CLI |
| PDF | pdf-to-img (poppler/wasm) |
| Excel | ExcelJS |
| Upload | Multer |

## Architettura

```
Gestionale_LS_SOFFASS/
├── server.js                  # Express server, cleanup scheduler
├── setup_db.js                # Setup schema Supabase
├── public/                    # Frontend SPA
│   ├── index.html
│   ├── manifest.json          # PWA manifest
│   ├── js/
│   │   ├── app.js             # Router SPA, auth, layout
│   │   ├── auth.js            # Login/register
│   │   ├── dashboard.js       # Riepilogo giacenze + movimenti
│   │   ├── uploadWizard.js    # Upload PDF → OCR → review → conferma
│   │   ├── giacenze.js        # Vista giacenze magazzino
│   │   ├── movimenti.js       # Storico movimenti
│   │   ├── importGiacenze.js  # Import Excel giacenze
│   │   └── export.js          # Export Excel (SOFFASS, giacenze, movimenti, documenti)
├── src/
│   ├── db/supabase.js         # Client Supabase (anon + admin)
│   ├── middleware/auth.js     # JWT middleware
│   ├── routes/
│   │   ├── auth.js            # POST /login, /register, GET /me
│   │   ├── documentiRaw.js    # Upload PDF, OCR, review, conferma (RPC confirm_document)
│   │   ├── documenti.js       # CRUD documenti confermati
│   │   ├── giacenze.js        # Giacenze + import Excel (generico + Soffass)
│   │   └── export.js          # Export Excel multi-foglio
│   └── services/
│       ├── ocrService.js      # Parsing testo OCR → dati strutturati
│       ├── pdfService.js      # Conversione PDF → immagini
│       ├── tesseractCliService.js  # OCR via CLI Tesseract
│       ├── tesseractService.js     # OCR via Tesseract.js
│       ├── sanitizationService.js  # Pulizia + normalizzazione dati
│       ├── validationService.js    # Validazione campi obbligatori
│       ├── duplicateService.js     # Controllo duplicati
│       ├── documentStateService.js # State machine documenti
│       ├── stateMachine.js         # Motore transizioni stato
│       └── magazzinoService.js     # Logica magazzino (movimenti, refresh giacenze)
```

### Flusso principale

1. **Upload** PDF bolletta → stato `uploaded`
2. **OCR** in background (Tesseract) → testo estratto → parsing in dati strutturati → stato `needs_review` o `ready_to_confirm`
3. **Review** utente modifica/corregge dati OCR → conferma
4. **Conferma** → RPC `confirm_document` su Supabase → crea record in `documenti` + `dettaglio_documenti` + movimento in `movimenti` + aggiorna `giacenze`
5. **Export** Excel multi-foglio (SOFFASS mensili, giacenze, movimenti, documenti)

## Setup

### Prerequisiti

- Node.js 18+
- Account Supabase con progetto attivo
- Tesseract CLI installato (per OCR via CLI)

### 1. Installa dipendenze

```bash
cd Gestionale_LS_SOFFASS
npm install
```

### 2. Configura variabili d'ambiente

Crea il file `.env` nella root:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PORT=3000
UPLOAD_DIR=./uploads
```

### 3. Setup database

Esegui lo schema SQL su Supabase:

```bash
# Opzione 1: Management API (se hai il token)
SUPABASE_MGMT_TOKEN=<token> node setup_db.js

# Opzione 2: Manuale
# 1. Vai su https://supabase.com/dashboard/project/<ref>/sql/new
# 2. Apri src/db/schema.sql
# 3. Incolla e clicca "Run"
```

### 4. Avvia

```bash
npm start
```

Il server parte su `http://localhost:3000`.

### Auth

La registrazione è limitata a un solo indirizzo email (hardcoded in `src/routes/auth.js`).

## API

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrazione |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/me` | Verifica sessione |
| POST | `/api/documenti/upload` | Upload PDF bolletta |
| POST | `/api/documenti/raw/:id/process` | Avvia OCR |
| GET | `/api/documenti/raw/:id` | Stato documento raw |
| PUT | `/api/documenti/raw/:id` | Modifica dati OCR |
| POST | `/api/documenti/raw/:id/confirm` | Conferma → documenti |
| GET | `/api/documenti` | Lista documenti |
| GET | `/api/giacenze` | Giacenze magazzino |
| GET | `/api/giacenze/riepilogo` | Dashboard riepilogo |
| POST | `/api/giacenze/import-excel` | Import Excel (generico + Soffass) |
| GET | `/api/export/soffass?anno=YYYY` | Export Excel SOFFASS |
| GET | `/api/export/giacenze` | Export giacenze |
| GET | `/api/export/movimenti` | Export movimenti |
| GET | `/api/export/documenti` | Export documenti |
| GET | `/api/health` | Health check |
