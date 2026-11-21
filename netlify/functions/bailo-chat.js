// Assistant Bailo Gestion — relais vers l'API Anthropic.
//
// SÉCURITÉ (corrigé le 21/11/2026) : cette fonction acceptait n'importe quel
// appel, sans connexion, avec un texte libre : n'importe qui sur Internet
// pouvait utiliser la clé API de Bailo (et la faire facturer). Elle exige
// maintenant un jeton de session Bailo Gestion valide et borne la taille
// de ce qui est envoyé.
const GESTION_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const GESTION_ANON_KEY = process.env.SUPABASE_GESTION_ANON_KEY;

const MAX_MESSAGES = 12;
const MAX_CHARS = 4000;
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

async function verifyCaller(token) {
  if (!token || !GESTION_ANON_KEY) return null;
  try {
    const res = await fetch(GESTION_URL + '/auth/v1/user', {
      headers: { apikey: GESTION_ANON_KEY, Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.id ? user : null;
  } catch (e) { return null; }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return json(500, { error: 'Clé API non configurée' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const caller = await verifyCaller(auth.replace(/^Bearer\s+/i, ''));
  if (!caller) return json(401, { error: 'Connexion requise' });

  try {
    const body = JSON.parse(event.body || '{}');
    const system = typeof body.system === 'string' ? body.system.slice(0, MAX_CHARS) : '';
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_MESSAGES)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json(400, { error: 'Message manquant' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system, messages })
    });
    const data = await response.json();
    const reply = data.content && data.content[0] ? data.content[0].text : 'Désolé, réessayez.';
    return json(200, { reply });
  } catch (e) {
    return json(500, { error: 'Erreur de l\'assistant' });
  }
};
