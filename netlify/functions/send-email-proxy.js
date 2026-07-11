// Proxy Netlify → Resend, réservé aux utilisateurs Bailo Gestion connectés.
//
// SÉCURITÉ (corrigé le 11/07/2026) : cette fonction acceptait auparavant une
// clé Resend fournie directement par l'appelant, sans aucune vérification —
// n'importe qui sur Internet pouvait s'en servir comme relais d'envoi
// d'email au nom de noreply@bailo.pro. Elle utilise maintenant SA PROPRE clé
// Resend (variable d'environnement serveur) et exige un jeton de session
// Supabase valide avant d'accepter d'envoyer quoi que ce soit.
const https = require('https');

const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_ANON_KEY = process.env.SUPABASE_GESTION_ANON_KEY; // clé publique (publishable), pas la clé service

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

async function verifyCaller(accessToken) {
  if (!accessToken || !GESTION_ANON_KEY) return null;
  const res = await fetchJson(GESTION_URL + '/auth/v1/user', {
    headers: { 'apikey': GESTION_ANON_KEY, 'Authorization': 'Bearer ' + accessToken }
  });
  return (res.status === 200 && res.body && res.body.id) ? res.body : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }};
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const user = await verifyCaller(token);
    if (!user) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Authentification requise' }) };
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'RESEND_API_KEY non configurée côté serveur' }) };
    }

    const body = JSON.parse(event.body);
    const { to, subject, html, text } = body;

    const payload = JSON.stringify({
      from: 'Bailo Pro <noreply@bailo.pro>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || `<p>${text}</p>`
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    return {
      statusCode: result.status,
      headers: cors,
      body: result.body
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
