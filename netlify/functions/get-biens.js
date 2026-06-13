const https = require('https');

// Clés Supabase
const CHANTIER_URL = 'https://hvkguyddmhqbvarujlyr.supabase.co';
const CHANTIER_SERVICE = process.env.SUPABASE_CHANTIER_SERVICE_KEY || '';
const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_SERVICE = process.env.SUPABASE_GESTION_SERVICE_KEY || '';

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 1. Récupérer le token Chantier depuis Authorization header
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };

  try {
    // 2. Vérifier le token et récupérer l'email via Chantier Auth
    const user = await fetchJson(CHANTIER_URL + '/auth/v1/user', {
      'apikey': CHANTIER_SERVICE,
      'Authorization': 'Bearer ' + token
    });
    if (!user || !user.email) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token invalide' }) };
    const email = user.email;

    // 3. Vérifier que l'utilisateur a un abonnement incluant Gestion
    const subs = await fetchJson(
      CHANTIER_URL + '/rest/v1/subscriptions?select=modules,active&email=eq.' + encodeURIComponent(email) + '&limit=1',
      { 'apikey': CHANTIER_SERVICE, 'Authorization': 'Bearer ' + CHANTIER_SERVICE }
    );
    const sub = Array.isArray(subs) ? subs[0] : null;
    const modules = sub && sub.modules ? sub.modules : [];
    if (!modules.includes('gestion')) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Abonnement Gestion requis', modules }) };
    }

    // 4. Récupérer l'user_id Gestion par email
    const gestionUsers = await fetchJson(
      GESTION_URL + '/auth/v1/admin/users?email=' + encodeURIComponent(email),
      { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
    );
    const gestionUserId = gestionUsers && gestionUsers.users && gestionUsers.users[0]
      ? gestionUsers.users[0].id : null;
    if (!gestionUserId) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur Gestion non trouvé' }) };

    // 5. Récupérer les properties + units
    const [properties, units] = await Promise.all([
      fetchJson(
        GESTION_URL + '/rest/v1/properties?select=id,name,address&bailleur_id=eq.default&order=name',
        { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
      ),
      fetchJson(
        GESTION_URL + '/rest/v1/units?select=id,label,type,property_id',
        { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
      )
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        properties: Array.isArray(properties) ? properties : [],
        units: Array.isArray(units) ? units : []
      })
    };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
