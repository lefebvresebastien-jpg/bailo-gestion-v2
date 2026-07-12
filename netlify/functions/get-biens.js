const https = require('https');

const CHANTIER_URL = 'https://hvkguyddmhqbvarujlyr.supabase.co';
const CHANTIER_SERVICE = process.env.SUPABASE_CHANTIER_SERVICE_KEY;
const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_SERVICE = process.env.SUPABASE_GESTION_SERVICE_KEY;

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, path: u.pathname + u.search, headers, method: 'GET' };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve([]); } });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token manquant' }) };
  if (!CHANTIER_SERVICE || !GESTION_SERVICE) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Variables env manquantes' }) };

  try {
    const user = await fetchJson(CHANTIER_URL + '/auth/v1/user', {
      'apikey': CHANTIER_SERVICE, 'Authorization': 'Bearer ' + token
    });
    if (!user || !user.email) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token invalide' }) };

    const subs = await fetchJson(
      CHANTIER_URL + '/rest/v1/subscriptions?select=modules&user_id=eq.' + user.id + '&limit=1',
      { 'apikey': CHANTIER_SERVICE, 'Authorization': 'Bearer ' + CHANTIER_SERVICE }
    );
    const modules = (Array.isArray(subs) && subs[0] && Array.isArray(subs[0].modules))
      ? subs[0].modules : ['gestion', 'chantier', 'finance'];
    if (!modules.includes('gestion')) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Abonnement Gestion requis' }) };
    }

    // SÉCURITÉ (corrigé le 12/07/2026) : cette fonction renvoyait auparavant
    // TOUS les biens de TOUS les clients Gestion, sans filtre par
    // propriétaire — n'importe quel client avec le module Gestion actif
    // voyait les biens de tout le monde. Gestion et Chantier ont des
    // systèmes Auth séparés (deux bases Supabase distinctes), donc il faut
    // d'abord retrouver le bon user_id côté Gestion via l'email (clé
    // commune entre les deux bases), puis filtrer strictement dessus.
    const gestionUsersResp = await fetchJson(
      GESTION_URL + '/auth/v1/admin/users?per_page=1000',
      { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
    );
    const gestionUsers = gestionUsersResp.users || (Array.isArray(gestionUsersResp) ? gestionUsersResp : []);
    const gestionUser = gestionUsers.find(u => u.email?.toLowerCase() === user.email.toLowerCase());
    if (!gestionUser?.id) {
      // Pas de compte Gestion pour cet email : aucun bien à renvoyer.
      return { statusCode: 200, headers: cors, body: JSON.stringify({ properties: [], units: [] }) };
    }
    const gestionUserId = gestionUser.id;

    const properties = await fetchJson(
      GESTION_URL + '/rest/v1/properties?select=id,name,address&bailleur_id=eq.' + gestionUserId + '&order=name',
      { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
    );
    const propertyIds = (Array.isArray(properties) ? properties : []).map(p => p.id);
    let units = [];
    if (propertyIds.length) {
      const idsFilter = propertyIds.map(id => '"' + id + '"').join(',');
      units = await fetchJson(
        GESTION_URL + '/rest/v1/units?select=id,label,type,property_id&property_id=in.(' + idsFilter + ')',
        { 'apikey': GESTION_SERVICE, 'Authorization': 'Bearer ' + GESTION_SERVICE }
      );
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({
      properties: Array.isArray(properties) ? properties : [],
      units: Array.isArray(units) ? units : []
    })};
  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
