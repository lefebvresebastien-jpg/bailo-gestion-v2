// Netlify Function — envoi d'un bail à SignWell pour signature électronique.
//
// SÉCURITÉ (corrigé le 15/07/2026, retour client Kevin Olivier) : contrat.html
// appelait directement l'API SignWell (www.signwell.com/api/v1/documents/)
// depuis le navigateur, avec la clé API SignWell codée en dur dans le code
// source JS — visible par quiconque inspecte la page, permettant d'utiliser
// le compte SignWell de Bailo (envoyer/lire des documents) sans aucune
// limite. Déplacé côté serveur : le client envoie maintenant les infos du
// bail avec son token Supabase, cette fonction vérifie qu'il est bien le
// bailleur du bail concerné avant d'appeler SignWell avec la clé (env).

const https = require('https');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const ANON_KEY = process.env.SUPABASE_GESTION_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;
const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY;

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

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!ANON_KEY || !SERVICE_KEY || !SIGNWELL_API_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Configuration serveur incomplète' }) };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Non authentifié' }) };

    const userRes = await fetchJson(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token }
    });
    if (userRes.status !== 200 || !userRes.body?.id) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Session invalide' }) };
    }
    const callerId = userRes.body.id;

    const payload = JSON.parse(event.body || '{}');
    const { leaseId, docName, subject, message, signers, fileHtml } = payload;
    if (!leaseId || !fileHtml || !Array.isArray(signers) || !signers.length) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Paramètres manquants' }) };
    }

    // Vérifie que l'appelant est bien le bailleur de ce bail avant d'envoyer quoi que ce soit
    const svcHeaders = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };
    const leaseRes = await fetchJson(
      SUPABASE_URL + '/rest/v1/leases?id=eq.' + encodeURIComponent(leaseId) + '&select=id,bailleur_id,data',
      { headers: svcHeaders }
    );
    const lease = Array.isArray(leaseRes.body) ? leaseRes.body[0] : null;
    if (!lease || lease.bailleur_id !== callerId) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Accès refusé à ce bail' }) };
    }

    const swRes = await fetchJson(
      'https://www.signwell.com/api/v1/documents/',
      { method: 'POST', headers: { 'X-Api-Key': SIGNWELL_API_KEY, 'Content-Type': 'application/json' } },
      JSON.stringify({
        name: docName,
        subject: subject,
        message: message,
        test_mode: false, with_signature_page: true, apply_signing_order: true, reminders: true, language: 'fr',
        recipients: signers.map((s, i) => ({ id: 'signer' + (i + 1), name: s.name, email: s.email, order: s.order })),
        files: [{ name: (docName || 'document') + '.html', file_base64: Buffer.from(fileHtml, 'utf-8').toString('base64') }],
        redirect_url: 'https://v2.gestion.bailo.pro'
      })
    );

    if (swRes.status < 200 || swRes.status >= 300) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: swRes.body?.message || swRes.body?.error || 'Erreur SignWell' }) };
    }

    // Mise à jour du bail côté serveur (plus fiable qu'une écriture client)
    const newData = Object.assign({}, lease.data, {
      signwellDocId: swRes.body.id,
      signwellSentAt: new Date().toISOString(),
      signwellSigners: signers
    });
    await fetchJson(
      SUPABASE_URL + '/rest/v1/leases?id=eq.' + encodeURIComponent(leaseId),
      { method: 'PATCH', headers: Object.assign({}, svcHeaders, { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }) },
      JSON.stringify({ data: newData })
    );

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, id: swRes.body.id }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
