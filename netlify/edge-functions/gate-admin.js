// Verrouillage temporaire complet de Bailo Gestion, le temps de vérifier
// en profondeur l'isolation des données entre comptes (incident du
// 10-11/07/2026). Bloque tout sauf les fonctions Netlify (cron, webhooks).

const USERNAME = 'bailo';
const PASSWORD = 'ChangeMoi2026!'; // À changer par Sébastien après activation

export default async (request, context) => {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/.netlify/functions/')) {
    return context.next();
  }

  const auth = request.headers.get('authorization');
  const expected = 'Basic ' + btoa(`${USERNAME}:${PASSWORD}`);

  if (auth !== expected) {
    return new Response('Authentification requise — accès Bailo Gestion temporairement restreint.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Bailo Gestion - Verrouillage temporaire"' },
    });
  }

  return context.next();
};

export const config = { path: '/*' };
