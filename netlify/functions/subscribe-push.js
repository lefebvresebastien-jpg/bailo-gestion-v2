// Enregistre (ou met à jour) un abonnement push dans Supabase.
// Appelée par le frontend après que l'utilisateur a accepté les
// notifications et que le navigateur a généré son abonnement.

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdHV5c21ueHNvbWxoZ3ZidHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDAyOTUsImV4cCI6MjA5MjI3NjI5NX0.ekmk4ujs0H1UfuDopnd_RNop1obgZgRM3ilj0yzqgM0';

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
      },
      body: ''
    };
  }

  const headers = {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  };

  try {
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body);
      // payload: { user_id, role, lease_id, subscription: { endpoint, keys: { p256dh, auth } } }
      const sub = payload.subscription;
      if (!sub || !sub.endpoint || !sub.keys) {
        return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Abonnement invalide' }) };
      }

      const row = {
        user_id: payload.user_id || null,
        role: payload.role,
        lease_id: payload.lease_id || null,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: 'POST',
        headers,
        body: JSON.stringify(row)
      });

      if (!res.ok) {
        const err = await res.text();
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err }) };
      }

      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      const payload = JSON.parse(event.body);
      const endpoint = payload.endpoint;
      if (!endpoint) {
        return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'endpoint manquant' }) };
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) {
        const err = await res.text();
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err }) };
      }
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
