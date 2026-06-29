const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const leaseId = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!leaseId) {
    return { statusCode: 400, body: 'ID manquant' };
  }

  // Lire locataire.html
  const htmlPath = path.join(process.cwd(), 'locataire.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Remplacer le lien manifest statique par l'URL de la fonction dynamique
  // Cette substitution se fait COTE SERVEUR donc iOS voit directement le bon href
  html = html.replace(
    '<link rel="manifest" href="manifest-locataire.json" id="pwa-manifest">',
    '<link rel="manifest" href="/.netlify/functions/manifest-locataire-dynamic?id=' + leaseId + '" id="pwa-manifest">'
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
