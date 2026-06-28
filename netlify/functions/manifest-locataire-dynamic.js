exports.handler = async (event) => {
  const leaseId = event.queryStringParameters && event.queryStringParameters.id;
  
  const startUrl = leaseId 
    ? '/locataire.html?id=' + leaseId
    : '/locataire.html';

  const manifest = {
    name: "Mon Espace Locataire — Bailo",
    short_name: "Mon Bail",
    description: "Votre espace locataire Bailo — bail, quittances, messages",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#3b5bdb",
    orientation: "portrait-primary",
    icons: [
      {
        src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' fill='%233b5bdb' rx='36'/><text y='.85em' font-size='140' x='16'>🏠</text></svg>",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any maskable"
      },
      {
        src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' fill='%233b5bdb' rx='96'/><text y='.85em' font-size='380' x='40'>🏠</text></svg>",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ],
    categories: ["lifestyle", "utilities"]
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify(manifest)
  };
};
