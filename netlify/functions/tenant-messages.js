// Netlify Function — messagerie du portail locataire (messages + quittances).
//
// SÉCURITÉ/FIABILITÉ (créé le 14/07/2026) : locataire.html appelait
// directement db.from('messages') en client, avec la seule clé publique et
// aucune session Supabase Auth (le locataire n'a pas de compte, juste un
// lien contenant le leaseId). Depuis l'activation de RLS sur messages
// (10/07/2026, policy users_own filtrée par auth.uid()=leases.bailleur_id),
// ces appels étaient bloqués silencieusement : aucune quittance ni message
// visible, aucun envoi possible, aucun marquage lu. Même principe que
// get-lease.js/tenant-storage.js : le leaseId agit comme un jeton
// imprévisible, vérifié ici avant toute opération, puis la clé service
// (bypass RLS) est utilisée en restreignant explicitement chaque requête à
// CE lease_id uniquement.
//
// GET  ?leaseId=xxx&kind=Quittance                          → liste des quittances
// GET  ?leaseId=xxx&id=xxx                                   → une quittance précise (body complet)
// GET  ?leaseId=xxx&kinds=Renseignement,Incident,Information → messagerie
// POST { leaseId, action:'send', kind, subject, body }       → envoyer un message/incident
// POST { leaseId, action:'mark-read', ids:[...] }             → marquer des messages comme lus

const https = require('https');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;

function fetchJson(url, options, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function leaseExists(leaseId) {
  return !!(await leaseRow(leaseId));
}
// Renvoie { id, bailleur_id } ou null (12/11/2026 : bailleur_id pour cibler la notification)
async function leaseRow(leaseId) {
  if (!leaseId || !/^[0-9a-f-]{36}$/i.test(leaseId)) return null;
  const res = await fetchJson(
    SUPABASE_URL + '/rest/v1/leases?select=id,bailleur_id&id=eq.' + leaseId,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
  );
  return Array.isArray(res.body) && res.body[0] ? res.body[0] : null;
}

// Notification push au bailleur DE CE BAIL uniquement (12/11/2026).
// Avant : le portail locataire appelait send-push avec { role: 'bailleur' },
// ce qui notifiait TOUS les comptes bailleurs Bailo (fuite multi-clients).
async function pushBailleur(bailleurId, title, body) {
  if (!bailleurId) return;
  const site = process.env.URL || 'https://gestion.bailo.pro';
  try {
    await fetch(site + '/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: { user_id: bailleurId }, title, body: String(body || '').slice(0, 120), url: 'https://gestion.bailo.pro' })
    });
  } catch (e) { console.error('push bailleur', e.message); }
}

const ALLOWED_KINDS = ['Renseignement', 'Incident', 'Information', 'Quittance'];

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!SERVICE_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Configuration serveur incomplète' }) };

  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      const leaseId = q.leaseId;
      if (!(await leaseExists(leaseId))) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Bail introuvable' }) };
      }

      // Une quittance précise (body complet, pour affichage/impression)
      if (q.id) {
        const res = await fetchJson(
          SUPABASE_URL + '/rest/v1/messages?select=id,subject,body,created_at&id=eq.' + encodeURIComponent(q.id) + '&lease_id=eq.' + leaseId + '&limit=1',
          { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
        );
        const msg = Array.isArray(res.body) && res.body[0] ? res.body[0] : null;
        return { statusCode: msg ? 200 : 404, headers: cors, body: JSON.stringify(msg || { error: 'Introuvable' }) };
      }

      // Liste filtrée par kind unique (Quittance) ou plusieurs kinds (messagerie)
      let kindFilter = '';
      if (q.kind && ALLOWED_KINDS.includes(q.kind)) {
        kindFilter = '&kind=eq.' + encodeURIComponent(q.kind);
      } else if (q.kinds) {
        const kinds = q.kinds.split(',').map(k => k.trim()).filter(k => ALLOWED_KINDS.includes(k));
        if (kinds.length) kindFilter = '&kind=in.(' + kinds.join(',') + ')';
      }

      const res = await fetchJson(
        SUPABASE_URL + '/rest/v1/messages?select=id,sender,subject,body,kind,created_at,replies,status,incident_status&lease_id=eq.' + leaseId + kindFilter + '&order=created_at.asc',
        { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
      );
      return { statusCode: 200, headers: cors, body: JSON.stringify(Array.isArray(res.body) ? res.body : []) };
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const { leaseId, action } = payload;
      const lease = await leaseRow(leaseId);
      if (!lease) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Bail introuvable' }) };
      }

      if (action === 'send') {
        const kind = ALLOWED_KINDS.includes(payload.kind) ? payload.kind : 'Renseignement';
        const msgBody = {
          lease_id: leaseId,
          sender: 'Locataire',
          kind,
          subject: (payload.subject || '').toString().slice(0, 200),
          body: (payload.body || '').toString(),
          status: 'en-attente',
          replies: []
        };
        if (kind === 'Incident') msgBody.incident_status = 'en-attente';

        // Photos jointes (incident) : uniquement des fichiers déposés pour CE bail
        // via tenant-storage (attachOnly). 1re photo = pièce jointe du message,
        // suivantes = réponses du locataire portant chacune une photo.
        const prefix = SUPABASE_URL + '/storage/v1/object/public/documents/' + leaseId + '/incidents/';
        const photos = (Array.isArray(payload.photos) ? payload.photos : [])
          .filter(ph => ph && typeof ph.url === 'string' && ph.url.startsWith(prefix) && !ph.url.includes('..'))
          .slice(0, 5);
        if (photos.length) {
          msgBody.file_name = String(photos[0].name || 'photo.jpg').slice(0, 200);
          msgBody.file_type = String(photos[0].type || 'image/jpeg').slice(0, 60);
          msgBody.file_data = photos[0].url;
          const now = new Date().toISOString();
          msgBody.replies = photos.slice(1).map((ph, i) => ({
            sender: 'Locataire', body: '📷 Photo ' + (i + 2), created_at: now,
            file_data: ph.url, file_name: String(ph.name || 'photo.jpg').slice(0, 200), file_type: String(ph.type || 'image/jpeg').slice(0, 60)
          }));
        }

        const res = await fetchJson(
          SUPABASE_URL + '/rest/v1/messages',
          { method: 'POST', headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' } },
          JSON.stringify(msgBody)
        );
        if (res.status >= 300) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Échec envoi' }) };
        await pushBailleur(lease.bailleur_id,
          kind === 'Incident' ? '🚨 Incident déclaré — ' + msgBody.subject + (photos.length ? ' (' + photos.length + ' photo' + (photos.length > 1 ? 's' : '') + ')' : '') : '💬 Nouveau message locataire',
          msgBody.body);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
      }

      if (action === 'mark-read') {
        const ids = Array.isArray(payload.ids) ? payload.ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)) : [];
        if (!ids.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, updated: 0 }) };
        // Restreint explicitement à ce lease_id : évite qu'un id d'un autre
        // bail passé par erreur (ou malveillance) ne soit mis à jour.
        await fetchJson(
          SUPABASE_URL + '/rest/v1/messages?id=in.(' + ids.join(',') + ')&lease_id=eq.' + leaseId,
          { method: 'PATCH', headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' } },
          JSON.stringify({ status: 'lu-locataire' })
        );
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, updated: ids.length }) };
      }

      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'action inconnue' }) };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
