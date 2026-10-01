// Upload de fichiers par le bailleur connecté (DPE, pièces jointes...).
//
// Depuis la fermeture de la policy storage.objects ouverte (13/07/2026),
// l'upload direct depuis le navigateur vers le bucket 'documents' peut être
// refusé par RLS. Cette fonction vérifie le jeton de session Supabase du
// bailleur, puis dépose le fichier avec la clé service dans SON dossier
// uniquement : <user_id>/<dossier>/<horodatage>_<nom>.
//
// POST { folder, fileName, fileType, fileBase64 }  (Authorization: Bearer <access_token>)
const https = require('https');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const ANON_KEY = process.env.SUPABASE_GESTION_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;
const MAX_BYTES = 4.5 * 1024 * 1024; // limite de taille des requêtes Netlify (~6 Mo en base64)

function fetchJson(url, options, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function verifyCaller(token) {
  if (!token || !ANON_KEY) return null;
  const res = await fetchJson(SUPABASE_URL + '/auth/v1/user', {
    headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + token }
  });
  return (res.status === 200 && res.body && res.body.id) ? res.body : null;
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SERVICE_KEY || !ANON_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Configuration serveur incomplète' }) };

  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    const user = await verifyCaller(auth.replace(/^Bearer\s+/i, ''));
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Authentification requise' }) };

    const { folder, fileName, fileType, fileBase64 } = JSON.parse(event.body || '{}');
    if (!fileName || !fileBase64) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Fichier manquant' }) };

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > MAX_BYTES) return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'Fichier trop lourd (4,5 Mo max)' }) };

    const safeFolder = String(folder || 'divers').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'divers';
    const safeName = String(fileName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const path = user.id + '/' + safeFolder + '/' + Date.now() + '_' + safeName;

    const up = await fetchJson(SUPABASE_URL + '/storage/v1/object/documents/' + path, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': fileType || 'application/octet-stream',
        'Content-Length': buffer.length
      }
    }, buffer);
    if (up.status >= 300) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Échec upload', detail: up.body }) };
    }

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({ ok: true, path, url: SUPABASE_URL + '/storage/v1/object/public/documents/' + path })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
