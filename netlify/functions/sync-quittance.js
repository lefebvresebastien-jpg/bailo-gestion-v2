// Synchronise une quittance générée dans Gestion vers la table
// quittances_sync (base Chantier/Finance), pour qu'elle apparaisse dans le
// Récap fiscal de Bailo Finance.
//
// PROBLÈME RÉSOLU (11/07/2026) : même piège que checkPlan() — Gestion et
// Chantier/Finance sont deux systèmes Auth séparés avec des user_id
// différents pour la même personne. Si on stockait l'user_id Gestion dans
// bailleur_id, la policy RLS de Finance (qui compare à SON PROPRE auth.uid,
// celui du système Chantier/Finance) ne matcherait jamais — même le vrai
// propriétaire ne verrait jamais ses quittances dans le Récap fiscal.
// Cette fonction résout ça en retrouvant le bon user_id (celui de
// Chantier/Finance) via l'email, la clé commune entre les deux bases.
const https = require('https');

const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_ANON_KEY = process.env.SUPABASE_GESTION_ANON_KEY;
const CHANTIER_URL = 'https://hvkguyddmhqbvarujlyr.supabase.co';
const CHANTIER_SERVICE_KEY = process.env.SUPABASE_CHANTIER_SERVICE_KEY;

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: payload ? { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data || 'null') }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token || !GESTION_ANON_KEY) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Authentification requise' }) };
    }

    // Identifier l'appelant Gestion, récupérer son email
    const userRes = await request('GET', GESTION_URL + '/auth/v1/user', {
      apikey: GESTION_ANON_KEY, Authorization: 'Bearer ' + token
    });
    const email = userRes.status === 200 ? userRes.body?.email : null;
    if (!email || !CHANTIER_SERVICE_KEY) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Session invalide' }) };
    }

    // Retrouver le user_id CÔTÉ CHANTIER/FINANCE correspondant à cet email
    const adminRes = await request('GET',
      CHANTIER_URL + '/auth/v1/admin/users?email=' + encodeURIComponent(email),
      { apikey: CHANTIER_SERVICE_KEY, Authorization: 'Bearer ' + CHANTIER_SERVICE_KEY }
    );
    const chantierUser = adminRes.body?.users?.[0] || (Array.isArray(adminRes.body) ? adminRes.body[0] : null);
    if (!chantierUser?.id) {
      // Pas de compte Chantier/Finance pour cet email : on ne bloque pas la
      // génération de la quittance côté Gestion, on renonce juste à la sync.
      return { statusCode: 200, headers: cors, body: JSON.stringify({ synced: false, reason: 'no_chantier_account' }) };
    }

    const body = JSON.parse(event.body);
    const row = {
      id: body.leaseId + '_' + body.month,
      lease_id: body.leaseId,
      bailleur_id: chantierUser.id,
      tenant_name: body.tenantName || '',
      month: body.month,
      rent: body.rent,
      charges: body.charges
    };

    const syncRes = await request('POST',
      CHANTIER_URL + '/rest/v1/quittances_sync?on_conflict=id',
      {
        apikey: CHANTIER_SERVICE_KEY,
        Authorization: 'Bearer ' + CHANTIER_SERVICE_KEY,
        Prefer: 'resolution=merge-duplicates'
      },
      row
    );

    return { statusCode: 200, headers: cors, body: JSON.stringify({ synced: syncRes.status < 300 }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ synced: false, error: e.message }) };
  }
};
