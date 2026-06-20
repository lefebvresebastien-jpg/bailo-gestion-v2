// Envoie une notification push aux abonnements correspondants.
// Appel : POST { target: { user_id? , lease_id?, role? }, title, body, url }
// - lease_id : notifie le(s) abonnement(s) locataire de ce bail
// - user_id  : notifie l'abonnement bailleur correspondant
// Si aucun des deux n'est fourni mais role='bailleur', notifie tous les
// abonnements bailleur (utile pour Sébastien, propriétaire unique du compte).

const webpush = require('web-push');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdHV5c21ueHNvbWxoZ3ZidHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDAyOTUsImV4cCI6MjA5MjI3NjI5NX0.ekmk4ujs0H1UfuDopnd_RNop1obgZgRM3ilj0yzqgM0';

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    const { target = {}, title, body, url } = payload;

    const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
    const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:contact@bailo.pro';

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Clés VAPID manquantes' }) };
    }
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

    // Construire la requête de sélection des abonnements concernés
    let query = 'push_subscriptions?select=id,endpoint,p256dh,auth';
    if (target.lease_id) {
      query += `&lease_id=eq.${encodeURIComponent(target.lease_id)}&role=eq.locataire`;
    } else if (target.user_id) {
      query += `&user_id=eq.${encodeURIComponent(target.user_id)}&role=eq.bailleur`;
    } else if (target.role === 'bailleur') {
      query += `&role=eq.bailleur`;
    } else {
      return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'target invalide (lease_id, user_id ou role requis)' }) };
    }

    const subsRes = await sbFetch(query);
    const subs = await subsRes.json();

    if (!subs || !subs.length) {
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, sent: 0, info: 'Aucun abonnement trouvé pour cette cible' }) };
    }

    const notifPayload = JSON.stringify({
      title: title || 'Bailo Gestion',
      body: body || '',
      icon: 'https://bailo.pro/bailo_gestion_mascotte.png',
      url: url || 'https://gestion.bailo.pro'
    });

    let sent = 0;
    const expiredIds = [];
    const errors = [];

    for (const sub of subs) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      try {
        await webpush.sendNotification(subscription, notifPayload);
        sent++;
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          // Abonnement expiré/invalide → on le nettoie
          expiredIds.push(sub.id);
        } else {
          errors.push({ id: sub.id, error: e.message });
        }
      }
    }

    // Nettoyage des abonnements expirés
    if (expiredIds.length) {
      const idsFilter = expiredIds.map(id => `"${id}"`).join(',');
      await sbFetch(`push_subscriptions?id=in.(${idsFilter})`, { method: 'DELETE' });
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, sent, expired_cleaned: expiredIds.length, errors })
    };

  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
