const https = require('https');
const fs = require('fs');
const path = require('path');

async function setupSupabase() {
  const sql = fs.readFileSync(path.join(__dirname, 'src', 'db', 'schema.sql'), 'utf8');
  const projectRef = 'aflilhayyaqjftaruulq';
  
  // Opzione 1: Usa il token di management API
  const mgmtToken = process.env.SUPABASE_MGMT_TOKEN;
  
  if (mgmtToken) {
    console.log('Tentativo creazione tramite Management API...');
    const response = await fetch(https://api.supabase.com/v1/projects//database/query, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + mgmtToken
      },
      body: JSON.stringify({ query: sql })
    });
    const result = await response.text();
    console.log('Risultato:', result);
  } else {
    console.log('=== ISTRUZIONI ===');
    console.log('1. Vai su: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('2. Apri il file: src/db/schema.sql');
    console.log('3. Copia TUTTO il contenuto e incollalo nell\\'editor SQL');
    console.log('4. Clicca "Run" o premi Ctrl+Enter');
    console.log('');
    console.log('Oppure genera un Management API Token:');
    console.log('1. Vai su: https://supabase.com/dashboard/account/tokens');
    console.log('2. Genera un token');
    console.log('3. Esegui: =\"il_tuo_token\"; node setup_db.js');
  }
}

setupSupabase().catch(console.error);
