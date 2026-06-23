-- Gestionale_LS_SOFFASS - Database Schema (PostgreSQL/Supabase)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TIPO DOCUMENTO ENUM
DO $$ BEGIN
  CREATE TYPE tipo_documento AS ENUM ('ENTRATA', 'USCITA');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- DOCUMENTI (bolle in entrata e uscita)
CREATE TABLE IF NOT EXISTS documenti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_documento NOT NULL,
  numero_bolla VARCHAR(50) NOT NULL,
  numero_documento VARCHAR(50),
  numero_ordine VARCHAR(50),
  picking VARCHAR(100),
  data_documento DATE NOT NULL,
  data_carico DATE,
  mittente TEXT,
  destinatario TEXT,
  causale_trasporto VARCHAR(100),
  vettore_nome TEXT,
  vettore_targa VARCHAR(50),
  codice_articolo VARCHAR(50) NOT NULL,
  descrizione_articolo TEXT NOT NULL,
  numero_packing_list VARCHAR(50),
  um VARCHAR(10) DEFAULT 'KG',
  quantita DECIMAL(12,3) NOT NULL,
  grammatura DECIMAL(8,2),
  altezza_bobina DECIMAL(8,1),
  diametro_bobina DECIMAL(8,1),
  numero_veli INTEGER,
  diametro_anima INTEGER,
  colli INTEGER DEFAULT 0,
  peso_totale DECIMAL(12,3),
  pallet INTEGER DEFAULT 0,
  note TEXT,
  pdf_path TEXT,
  ocr_raw_text TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(picking, numero_bolla)
);

-- DETTAGLIO BOLLE (rotelle/pallet individuali)
CREATE TABLE IF NOT EXISTS dettaglio_documenti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID REFERENCES documenti(id) ON DELETE CASCADE,
  partita_lotto VARCHAR(100),
  numero_rotelle INTEGER,
  peso DECIMAL(12,3),
  posizione INTEGER
);

-- GIACENZE (aggregate per articolo)
CREATE TABLE IF NOT EXISTS giacenze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice_articolo VARCHAR(50) NOT NULL,
  picking VARCHAR(100),
  descrizione_articolo TEXT NOT NULL,
  colli_totali INTEGER DEFAULT 0,
  peso_totale DECIMAL(12,3) DEFAULT 0,
  pallet_totali INTEGER DEFAULT 0,
  ultimo_aggiornamento TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(picking, codice_articolo)
);

-- MOVIMENTI (storico completo)
CREATE TABLE IF NOT EXISTS movimenti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID REFERENCES documenti(id),
  tipo tipo_documento NOT NULL,
  codice_articolo VARCHAR(50) NOT NULL,
  picking VARCHAR(100),
  descrizione_articolo TEXT,
  colli INTEGER NOT NULL,
  peso DECIMAL(12,3) NOT NULL,
  pallet INTEGER DEFAULT 0,
  data_movimento DATE NOT NULL,
  numero_bolla VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STATO DOCUMENTO ENUM
DO $$ BEGIN
  CREATE TYPE stato_documento AS ENUM (
    'uploaded', 'processing', 'extracted',
    'needs_review', 'ready_to_confirm', 'confirmed', 'error'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Aggiungi colonne stato ai documenti esistenti
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS stato stato_documento DEFAULT 'confirmed';
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(5,2);
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS confirmed_by UUID;
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS raw_document_id UUID;

-- Backfill documenti esistenti come confirmed
UPDATE documenti SET stato = 'confirmed', confirmed_at = COALESCE(confirmed_at, created_at) WHERE stato IS NULL;

-- DOCUMENTI_RAW (buffer temporaneo pre-conferma)
CREATE TABLE IF NOT EXISTS documenti_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_path TEXT NOT NULL,
  stato stato_documento DEFAULT 'uploaded',
  ocr_raw_text TEXT,
  ocr_confidence DECIMAL(5,2),
  dati_estratti JSONB,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVENT_LOG (audit trail)
CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID REFERENCES documenti_raw(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL,
  dettaglio JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDICI documenti_raw
CREATE INDEX IF NOT EXISTS idx_raw_stato ON documenti_raw(stato);
CREATE INDEX IF NOT EXISTS idx_raw_created ON documenti_raw(created_at);

-- INDICI event_log
CREATE INDEX IF NOT EXISTS idx_event_documento ON event_log(documento_id);
CREATE INDEX IF NOT EXISTS idx_event_created ON event_log(created_at);

-- INDICI (esistenti)
CREATE INDEX IF NOT EXISTS idx_documenti_numero_bolla ON documenti(numero_bolla);
CREATE INDEX IF NOT EXISTS idx_documenti_data ON documenti(data_documento);
CREATE INDEX IF NOT EXISTS idx_documenti_tipo ON documenti(tipo);
CREATE INDEX IF NOT EXISTS idx_documenti_picking ON documenti(picking);
CREATE INDEX IF NOT EXISTS idx_movimenti_data ON movimenti(data_movimento);
CREATE INDEX IF NOT EXISTS idx_movimenti_codice ON movimenti(codice_articolo);
CREATE INDEX IF NOT EXISTS idx_movimenti_picking ON movimenti(picking);
CREATE INDEX IF NOT EXISTS idx_giacenze_codice ON giacenze(codice_articolo);
CREATE INDEX IF NOT EXISTS idx_giacenze_picking ON giacenze(picking);

-- ROW LEVEL SECURITY
ALTER TABLE documenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE dettaglio_documenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE giacenze ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE documenti_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- POLICY: accesso completo per anon (server) e authenticated (admin)
DROP POLICY IF EXISTS "Accesso completo documenti" ON documenti;
CREATE POLICY "Accesso completo documenti"
  ON documenti FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Accesso completo dettaglio" ON dettaglio_documenti;
CREATE POLICY "Accesso completo dettaglio"
  ON dettaglio_documenti FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Accesso completo giacenze" ON giacenze;
CREATE POLICY "Accesso completo giacenze"
  ON giacenze FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Accesso completo movimenti" ON movimenti;
CREATE POLICY "Accesso completo movimenti"
  ON movimenti FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- RLS documenti_raw: INSERT e SELECT per authenticated, UPDATE solo service_role
DROP POLICY IF EXISTS "documenti_raw_insert" ON documenti_raw;
CREATE POLICY "documenti_raw_insert"
  ON documenti_raw FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "documenti_raw_select" ON documenti_raw;
CREATE POLICY "documenti_raw_select"
  ON documenti_raw FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "documenti_raw_update_service" ON documenti_raw;
CREATE POLICY "documenti_raw_update_service"
  ON documenti_raw FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "documenti_raw_delete_service" ON documenti_raw;
CREATE POLICY "documenti_raw_delete_service"
  ON documenti_raw FOR DELETE TO service_role USING (true);

-- RLS event_log: INSERT solo service_role, SELECT per authenticated
DROP POLICY IF EXISTS "event_log_insert_service" ON event_log;
CREATE POLICY "event_log_insert_service"
  ON event_log FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "event_log_select" ON event_log;
CREATE POLICY "event_log_select"
  ON event_log FOR SELECT TO authenticated USING (true);
