-- RPC: confirm_document
-- Transazione atomica: crea documento + movimento + aggiorna giacenza in un unico passo
CREATE OR REPLACE FUNCTION confirm_document(
  p_raw_id UUID,
  p_dati JSONB,
  p_ocr_raw_text TEXT,
  p_ocr_confidence DECIMAL,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id UUID;
  v_picking TEXT;
  v_colli NUMERIC;
  v_peso NUMERIC;
  v_pallet NUMERIC;
  v_esistente RECORD;
  v_nuovo_colli NUMERIC;
  v_nuovo_peso NUMERIC;
  v_nuovo_pallet NUMERIC;
  v_dettaglio JSONB;
  v_item JSONB;
  v_idx INT;
BEGIN
  -- 1. Estrai dati
  v_picking := COALESCE(p_dati->>'picking', p_dati->>'numero_ordine');
  v_colli := COALESCE((p_dati->>'colli')::NUMERIC, 0);
  v_peso := COALESCE((p_dati->>'peso_totale')::NUMERIC, (p_dati->>'quantita')::NUMERIC, 0);
  v_pallet := COALESCE((p_dati->>'pallet')::NUMERIC, 0);

  -- 2. Crea documento
  INSERT INTO documenti (
    tipo, numero_bolla, numero_documento, numero_ordine, numero_packing_list,
    picking, data_documento, data_carico, causale_trasporto,
    mittente, destinatario,
    codice_articolo, descrizione_articolo, um, quantita,
    colli, peso_totale, pallet, note,
    ocr_raw_text, stato, confirmed_at, confirmed_by, raw_document_id,
    created_by
  ) VALUES (
    (p_dati->>'tipo')::tipo_documento,
    p_dati->>'numero_bolla',
    p_dati->>'numero_documento',
    p_dati->>'numero_ordine',
    p_dati->>'numero_packing_list',
    v_picking,
    (p_dati->>'data_documento')::DATE,
    NULLIF(p_dati->>'data_carico', '')::DATE,
    p_dati->>'causale_trasporto',
    p_dati->>'mittente',
    p_dati->>'destinatario',
    p_dati->>'codice_articolo',
    p_dati->>'descrizione_articolo',
    COALESCE(p_dati->>'um', 'KG'),
    COALESCE((p_dati->>'quantita')::NUMERIC, 0),
    v_colli, v_peso, v_pallet,
    p_dati->>'note',
    p_ocr_raw_text,
    'confirmed', NOW(), p_user_id, p_raw_id,
    p_user_id
  )
  RETURNING id INTO v_doc_id;

  -- 3. Crea movimento
  INSERT INTO movimenti (
    documento_id, tipo, codice_articolo, descrizione_articolo,
    colli, peso, pallet, data_movimento, numero_bolla, picking
  ) VALUES (
    v_doc_id,
    (p_dati->>'tipo')::tipo_documento,
    p_dati->>'codice_articolo',
    p_dati->>'descrizione_articolo',
    v_colli, v_peso, v_pallet,
    (p_dati->>'data_documento')::DATE,
    p_dati->>'numero_bolla',
    v_picking
  );

  -- 4. Aggiorna giacenza
  SELECT * INTO v_esistente FROM giacenze
    WHERE codice_articolo = p_dati->>'codice_articolo'
    AND (v_picking IS NOT NULL AND picking = v_picking OR v_picking IS NULL AND picking IS NULL);

  IF p_dati->>'tipo' = 'ENTRATA' THEN
    v_nuovo_colli := v_colli;
    v_nuovo_peso := v_peso;
    v_nuovo_pallet := v_pallet;
  ELSE
    v_nuovo_colli := -v_colli;
    v_nuovo_peso := -v_peso;
    v_nuovo_pallet := -v_pallet;
  END IF;

  IF v_esistente.id IS NOT NULL THEN
    UPDATE giacenze SET
      colli_totali = GREATEST(0, colli_totali + v_nuovo_colli),
      peso_totale = GREATEST(0, peso_totale + v_nuovo_peso),
      pallet_totali = GREATEST(0, pallet_totali + v_nuovo_pallet),
      ultimo_aggiornamento = NOW()
    WHERE id = v_esistente.id;
  ELSE
    INSERT INTO giacenze (
      codice_articolo, descrizione_articolo, picking,
      colli_totali, peso_totale, pallet_totali
    ) VALUES (
      p_dati->>'codice_articolo',
      p_dati->>'descrizione_articolo',
      v_picking,
      GREATEST(0, v_nuovo_colli),
      GREATEST(0, v_nuovo_peso),
      GREATEST(0, v_nuovo_pallet)
    );
  END IF;

  -- 5. Crea dettaglio se presente
  v_dettaglio := p_dati->'dettaglio';
  IF jsonb_typeof(v_dettaglio) = 'array' AND jsonb_array_length(v_dettaglio) > 0 THEN
    v_idx := 1;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_dettaglio)
    LOOP
      INSERT INTO dettaglio_documenti (
        documento_id, partita_lotto, numero_rotelle, peso, posizione
      ) VALUES (
        v_doc_id,
        v_item->>'partita_lotto',
        COALESCE((v_item->>'numero_rotelle')::INT, 0),
        COALESCE((v_item->>'peso')::NUMERIC, 0),
        v_idx
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- 6. Log evento
  INSERT INTO event_log (documento_id, evento, dettaglio, created_by)
  VALUES (p_raw_id, 'confirmed', jsonb_build_object('documento_id', v_doc_id), p_user_id);

  RETURN jsonb_build_object('id', v_doc_id, 'message', 'Documento confermato');
END;
$$;
