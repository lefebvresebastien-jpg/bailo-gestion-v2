const https = require('https');

const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_SERVICE = process.env.SUPABASE_GESTION_SERVICE_KEY;

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, path: u.pathname + u.search, headers, method: 'GET' };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const leaseId = event.queryStringParameters && event.queryStringParameters.id;
  if (!leaseId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id manquant' }) };
  if (!GESTION_SERVICE) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Config serveur manquante' }) };

  try {
    // Lire le bail avec la service key (bypass RLS)
    const leases = await fetchJson(
      GESTION_URL + '/rest/v1/leases?id=eq.' + encodeURIComponent(leaseId) + '&limit=1',
      { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE, 'Accept': 'application/json' }
    );
    const lease = Array.isArray(leases) && leases[0] ? leases[0] : null;
    if (!lease) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Bail introuvable' }) };

    // Lire settings bailleur
    const settings = await fetchJson(
      GESTION_URL + '/rest/v1/settings?key=in.(landlord_profile,compteurs_config)&select=key,value',
      { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
    );

    return { statusCode: 200, headers: cors, body: JSON.stringify({ lease, settings: settings || [] }) };
  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
