// Netlify Function — Récupère le lien de téléchargement du document signé via l'API SignWell
const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const docId = event.queryStringParameters && event.queryStringParameters.docId;
  if (!docId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'docId manquant' }) };
  if (!SIGNWELL_API_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Cle SignWell manquante cote serveur' }) };

  try {
    const resp = await fetch('https://api.signwell.com/v1/documents/' + docId + '/completed_pdf', {
      headers: { 'X-Api-Key': SIGNWELL_API_KEY }
    });

    if (!resp.ok) {
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ error: 'SignWell API error', status: resp.status }) };
    }

    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/pdf' },
      body: base64,
      isBase64Encoded: true
    };
  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
