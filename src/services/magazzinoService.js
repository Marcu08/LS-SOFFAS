async function creaMovimento(supabase, doc, picking) {
  const pKey = picking || doc.picking || null;
  const { error } = await supabase.from("movimenti").insert([{
    documento_id: doc.id, tipo: doc.tipo, codice_articolo: doc.codice_articolo,
    descrizione_articolo: doc.descrizione_articolo, colli: doc.colli || 0,
    peso: doc.peso_totale || doc.quantita || 0, pallet: doc.pallet || 0,
    data_movimento: doc.data_documento, numero_bolla: doc.numero_bolla,
    picking: pKey,
  }]);
  return error;
}

async function aggiornaGiacenze(supabase, doc, picking) {
  const colli = doc.colli || 0;
  const peso = parseFloat(doc.peso_totale || doc.quantita || 0);
  const pallet = doc.pallet || 0;
  const pKey = picking || doc.picking || null;

  let q = supabase.from("giacenze").select("*").eq("codice_articolo", doc.codice_articolo);
  if (pKey) { q = q.eq("picking", pKey); } else { q = q.is("picking", null); }
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    const nc = doc.tipo === "ENTRATA" ? existing.colli_totali + colli : Math.max(0, existing.colli_totali - colli);
    const np = doc.tipo === "ENTRATA" ? parseFloat(existing.peso_totale) + peso : Math.max(0, parseFloat(existing.peso_totale) - peso);
    const npa = doc.tipo === "ENTRATA" ? existing.pallet_totali + pallet : Math.max(0, existing.pallet_totali - pallet);
    const { error } = await supabase.from("giacenze").update({
      colli_totali: nc, peso_totale: Math.round(np * 1000) / 1000, pallet_totali: npa,
      ultimo_aggiornamento: new Date().toISOString()
    }).eq("id", existing.id);
    return error;
  }

  const { error } = await supabase.from("giacenze").insert([{
    codice_articolo: doc.codice_articolo, descrizione_articolo: doc.descrizione_articolo,
    picking: pKey,
    colli_totali: doc.tipo === "ENTRATA" ? colli : 0,
    peso_totale: doc.tipo === "ENTRATA" ? peso : 0,
    pallet_totali: doc.tipo === "ENTRATA" ? pallet : 0,
  }]);
  return error;
}

async function refreshGiacenze(supabase, codArt, descr, picking) {
  let q = supabase.from("documenti").select("tipo, colli, peso_totale, pallet").eq("codice_articolo", codArt);
  if (picking) q = q.eq("picking", picking);
  const { data: docs } = await q;

  let tc = 0, tp = 0, tpa = 0;
  if (docs) docs.forEach((d) => {
    if (d.tipo === "ENTRATA") { tc += d.colli || 0; tp += parseFloat(d.peso_totale || 0); tpa += d.pallet || 0; }
    else { tc -= d.colli || 0; tp -= parseFloat(d.peso_totale || 0); tpa -= d.pallet || 0; }
  });

  let gq = supabase.from("giacenze").select("id").eq("codice_articolo", codArt);
  if (picking) { gq = gq.eq("picking", picking); } else { gq = gq.is("picking", null); }
  const { data: existing } = await gq.maybeSingle();

  if (existing) {
    const { error } = await supabase.from("giacenze").update({
      colli_totali: Math.max(0, tc), peso_totale: Math.max(0, Math.round(tp * 1000) / 1000),
      pallet_totali: Math.max(0, tpa), ultimo_aggiornamento: new Date().toISOString()
    }).eq("id", existing.id);
    return error;
  }

  const { error } = await supabase.from("giacenze").insert([{
    codice_articolo: codArt, descrizione_articolo: descr, picking: picking || null,
    colli_totali: Math.max(0, tc), peso_totale: Math.max(0, tp), pallet_totali: Math.max(0, tpa),
  }]);
  return error;
}

module.exports = { creaMovimento, aggiornaGiacenze, refreshGiacenze };