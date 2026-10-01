// Régénère netlify/functions/locataire-page.js à partir de locataire.html.
//
// À LANCER APRÈS CHAQUE MODIFICATION DE locataire.html :
//   node tools/build-locataire-page.js
//
// Pourquoi une copie embarquée : sur iOS, la PWA lit le manifest AVANT que le
// JavaScript s'exécute. Le lien <link rel="manifest"> doit donc contenir l'id
// du bail dès la réponse du serveur. Une Netlify Function ne peut pas lire
// les fichiers statiques du site (pas de fs.readFile) : le HTML est embarqué.
// Oublier de régénérer = les locataires reçoivent une ancienne version
// (c'est ce qui s'est produit entre le 14/07 et le 01/10/2026).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'locataire.html'), 'utf8');

const LINK = '<link rel="manifest" href="manifest-locataire.json" id="pwa-manifest">';
if (!html.includes(LINK)) throw new Error('Lien manifest introuvable dans locataire.html');
html = html.replace(LINK, '<link rel="manifest" href="MANIFEST_URL_PLACEHOLDER" id="pwa-manifest">');

const escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const out = `// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Source : locataire.html — régénérer avec : node tools/build-locataire-page.js
exports.handler = async (event) => {
  const leaseId = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!/^[0-9a-f-]{36}$/i.test(leaseId)) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Lien invalide' };
  }

  // Manifest sur le MÊME domaine que la page (sinon iOS l'ignore)
  const manifestUrl = '/.netlify/functions/manifest-locataire-dynamic?id=' + leaseId;

  const html = \`${escaped}\`.replace('MANIFEST_URL_PLACEHOLDER', manifestUrl);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: html
  };
};
`;
fs.writeFileSync(path.join(root, 'netlify/functions/locataire-page.js'), out);
console.log('locataire-page.js régénéré (' + out.length + ' octets)');
