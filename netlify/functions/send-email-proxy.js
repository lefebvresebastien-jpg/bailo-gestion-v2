// Proxy Netlify → Supabase Edge Function send-email
// Contourne les restrictions d'auth Supabase sur les Edge Functions
const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }};
  }

  try {
    const body = JSON.parse(event.body);
    const { to, subject, html, text, resend_key } = body;

    if (!resend_key) {
      return { statusCode: 400, body: JSON.stringify({ error: 'resend_key manquante' }) };
    }

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
          'Authorization': `Bearer ${resend_key}`,
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
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: result.body
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
