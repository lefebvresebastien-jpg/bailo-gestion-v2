// Vérifie le plan d'abonnement (Solo/Duo/Pro) de l'utilisateur Gestion connecté.
//
// PROBLÈME RÉSOLU (11/07/2026) : Gestion (base nltuysmnxsomlhgvbtwz) et
// Chantier/Finance (base hvkguyddmhqbvarujlyr, où vit la table subscriptions)
// sont deux systèmes Supabase Auth SÉPARÉS — un même utilisateur y a deux
// user_id différents. Le code client comparait l'un à l'autre, ce qui ne
// pouvait jamais correspondre, ET interrogeait subscriptions sans aucune
// session pour ce projet (donc bloqué par RLS de toute façon). Cette
// fonction contourne les deux problèmes : elle vérifie l'identité de
// l'appelant via son token Gestion, récupère son EMAIL (le seul point
// commun entre les deux bases), puis interroge subscriptions avec la clé
// service (bypass RLS), filtré par email plutôt que par user_id.
const https = require('https');

const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_ANON_KEY = process.env.SUPABASE_GESTION_ANON_KEY;
const CHANTIER_URL = 'https://hvkguyddmhqbvarujlyr.supabase.co';
const CHANTIER_SERVICE_KEY = process.env.SUPABASE_CHANTIER_SERVICE_KEY;

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } };
  }

  const fallback = { plan: 'free', active: false, modules: [] };

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token || !GESTION_ANON_KEY) {
      console.log('check-plan: token ou GESTION_ANON_KEY manquant', { hasToken: !!token, hasAnonKey: !!GESTION_ANON_KEY });
      return { statusCode: 200, headers: cors, body: JSON.stringify(fallback) };
    }

    const userRes = await fetchJson(GESTION_URL + '/auth/v1/user', {
      apikey: GESTION_ANON_KEY, Authorization: 'Bearer ' + token
    });
    console.log('check-plan: userRes status', userRes.status, 'body', JSON.stringify(userRes.body).slice(0,200));
    const email = userRes.status === 200 ? userRes.body?.email : null;
    if (!email || !CHANTIER_SERVICE_KEY) {
      console.log('check-plan: email ou CHANTIER_SERVICE_KEY manquant', { email, hasServiceKey: !!CHANTIER_SERVICE_KEY });
      return { statusCode: 200, headers: cors, body: JSON.stringify(fallback) };
    }

    const subRes = await fetchJson(
      CHANTIER_URL + '/rest/v1/subscriptions?email=eq.' + encodeURIComponent(email) + '&select=plan,active,modules,trial,expires_at&limit=1',
      { apikey: CHANTIER_SERVICE_KEY, Authorization: 'Bearer ' + CHANTIER_SERVICE_KEY }
    );
    console.log('check-plan: subRes status', subRes.status, 'body', JSON.stringify(subRes.body).slice(0,300));
    const sub = Array.isArray(subRes.body) && subRes.body[0] ? subRes.body[0] : null;
    if (!sub) {
      return { statusCode: 200, headers: cors, body: JSON.stringify(fallback) };
    }

    const trialValide = sub.trial && sub.expires_at && new Date(sub.expires_at) > new Date();
    const active = sub.active === true || trialValide;

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        plan: sub.plan || 'free',
        active,
        modules: sub.modules || []
      })
    };
  } catch(e) {
    console.log('check-plan: exception', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify(fallback) };
  }
};
