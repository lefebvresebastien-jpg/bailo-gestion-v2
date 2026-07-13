// Netlify Function — accès Storage pour le portail locataire.
//
// SÉCURITÉ (créé le 13/07/2026) : le portail locataire (locataire.html /
// locataire-page.js) n'a pas de session Supabase Auth — il n'utilise que le
// leaseId comme identifiant. Auparavant, ceci s'appuyait sur une policy
// storage.objects grande ouverte (bucket_id/qual = true) pour permettre au
// locataire de lire/uploader ses documents, ce qui exposait TOUS les
// documents de TOUS les baux à quiconque connaissait le nom du bucket.
//
// Cette fonction vérifie que le leaseId fourni correspond bien à un bail
// réel (même principe que get-lease.js : le leaseId agit comme un jeton
// imprévisible), puis effectue l'opération Storage avec la clé service
// (bypass RLS) restreinte au dossier de CE bail uniquement.
//
// GET  ?leaseId=xxx                → liste les documents (table messages, kind=Document)
// POST { leaseId, fileName, fileType, fileBase64, category } → upload un document

const https = require('https');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;

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
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function leaseExists(leaseId) {
  if (!leaseId || !/^[0-9a-f-]{36}$/i.test(leaseId)) return false;
  const res = await fetchJson(
    SUPABASE_URL + '/rest/v1/leases?select=id&id=eq.' + leaseId,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
  );
  return Array.isArray(res.body) && res.body.length > 0;
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!SERVICE_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Configuration serveur incomplète' }) };

  try {
    if (event.httpMethod === 'GET') {
      const leaseId = event.queryStringParameters && event.queryStringParameters.leaseId;
      if (!(await leaseExists(leaseId))) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Bail introuvable' }) };
      }
      const res = await fetchJson(
        SUPABASE_URL + '/rest/v1/messages?select=id,subject,body,file_name,file_data,created_at,sender&lease_id=eq.' + leaseId + '&kind=eq.Document&order=created_at.desc',
        { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
      );
      return { statusCode: 200, headers: cors, body: JSON.stringify(Array.isArray(res.body) ? res.body : []) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { leaseId, fileName, fileType, fileBase64, category } = body;
      if (!(await leaseExists(leaseId))) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Bail introuvable' }) };
      }
      if (!fileName || !fileBase64) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Fichier manquant' }) };
      }

      const safeName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = leaseId + '/docs/' + Date.now() + '_' + safeName;
      const buffer = Buffer.from(fileBase64, 'base64');

      const uploadRes = await fetchJson(
        SUPABASE_URL + '/storage/v1/object/documents/' + path,
        {
          method: 'POST',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type': fileType || 'application/octet-stream'
          }
        },
        buffer
      );
      if (uploadRes.status >= 300) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Échec upload', detail: uploadRes.body }) };
      }

      const publicUrl = SUPABASE_URL + '/storage/v1/object/public/documents/' + path;

      await fetchJson(
        SUPABASE_URL + '/rest/v1/messages',
        {
          method: 'POST',
          headers: {
            'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          }
        },
        JSON.stringify({
          lease_id: leaseId,
          sender: 'Locataire',
          kind: 'Document',
          subject: category || 'Autre',
          body: fileName,
          file_name: fileName,
          file_type: fileType || '',
          file_data: publicUrl,
          status: 'traité',
          replies: []
        })
      );

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, url: publicUrl }) };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
