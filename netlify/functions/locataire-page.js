const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const leaseId = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!leaseId) {
    return { statusCode: 400, body: 'ID manquant' };
  }

  // Sur Netlify, le dossier publish est /var/task
  let html;
  const candidates = [
    path.join('/var/task', 'locataire.html'),
    path.join(process.cwd(), 'locataire.html'),
    path.join(__dirname, '..', '..', 'locataire.html'),
    path.join(__dirname, '../../locataire.html'),
  ];
  
  for (const p of candidates) {
    try { html = fs.readFileSync(p, 'utf8'); break; } catch(e) {}
  }
  
  if (!html) {
    return { statusCode: 500, body: 'locataire.html introuvable. Paths tried: ' + candidates.join(', ') };
  }

  // Injecter le manifest avec le bon start_url COTE SERVEUR
  const manifestUrl = 'https://v2.gestion.bailo.pro/.netlify/functions/manifest-locataire-dynamic?id=' + leaseId;
  html = html.replace(
    '<link rel="manifest" href="manifest-locataire.json" id="pwa-manifest">',
    '<link rel="manifest" href="' + manifestUrl + '" id="pwa-manifest">'
  );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: html
  };
};
