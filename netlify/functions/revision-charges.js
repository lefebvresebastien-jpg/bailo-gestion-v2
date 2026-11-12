// Netlify Function — révisions programmées de la provision pour charges (12/11/2026).
//
// POST { leaseId, action:'declarer', revisionId, date:'YYYY-MM-DD' }
//   Appelé depuis l'espace locataire : le locataire indique la date de mise en
//   service de son contrat d'électricité. La révision passe de « attente » à
//   « programmee », avec une date d'effet au 1er du mois suivant. Le bailleur
//   est prévenu (message dans la messagerie + notification push).
//   Même principe de sécurité que tenant-messages.js : le leaseId (UUID
//   imprévisible) sert de jeton, vérifié avant toute opération ; la clé
//   service n'agit que sur CE bail.
//
// GET/POST ?secret=… (ou en-tête x-cron-secret) sans action
//   Applique toutes les révisions dont la date d'effet est atteinte (même
//   traitement que le cron quotidien alertes-bailleur.js).

const { aujourdhuiParis, premierDuMoisSuivant, estDateValide, appliquerRevisionsEchues } = require('../lib/charges-revisions');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;
const SITE_URL = process.env.URL || 'https://gestion.bailo.pro';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};
const rep = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

function sbHeaders(extra) {
  return Object.assign({ 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }, extra || {});
}
async function lireBail(leaseId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/leases?select=id,bailleur_id,data&id=eq.${leaseId}&limit=1`, { headers: sbHeaders() });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
async function ecrireBail(leaseId, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/leases?id=eq.${leaseId}`, {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ data })
  });
  return r.ok;
}

function fmtEuro(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}
function fmtDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function declarer(payload) {
  const { leaseId, revisionId, date } = payload;
  if (!/^[0-9a-f-]{36}$/i.test(leaseId || '')) return rep(404, { error: 'Bail introuvable' });
  if (!estDateValide(date)) return rep(400, { error: 'Date invalide' });

  const lease = await lireBail(leaseId);
  if (!lease) return rep(404, { error: 'Bail introuvable' });
  const data = lease.data || {};
  const f = data.formData || {};
  const rev = (f.chargesRevisions || []).find(r => r && r.id === revisionId);
  if (!rev) return rep(404, { error: 'Révision introuvable' });
  if (rev.status !== 'attente' || rev.rule !== 'evenement') {
    return rep(409, { error: 'Cette date a déjà été enregistrée.', revision: rev });
  }

  // Garde-fous : pas dans le futur, pas avant la création de la révision (−90 j de tolérance)
  const today = aujourdhuiParis();
  if (date > today) return rep(400, { error: 'La date ne peut pas être dans le futur.' });
  const min = new Date(new Date(rev.createdAt || today).getTime() - 90 * 86400000).toISOString().substring(0, 10);
  if (date < min) return rep(400, { error: 'Date trop ancienne, contactez votre bailleur.' });

  rev.eventDate = date;
  rev.declaredBy = 'locataire';
  rev.declaredAt = new Date().toISOString();
  rev.effectiveDate = premierDuMoisSuivant(date);
  rev.status = 'programmee';
  // Date d'effet déjà passée (déclaration tardive) : appliquer tout de suite
  appliquerRevisionsEchues(f, today);
  data.formData = f;
  if (!(await ecrireBail(leaseId, data))) return rep(500, { error: 'Enregistrement impossible, réessayez.' });

  const resume = `Mise en service du contrat d'électricité le ${fmtDate(date)}. `
    + `Nouvelle provision pour charges : ${fmtEuro(rev.newCharges)} au lieu de ${fmtEuro(rev.oldCharges)}, `
    + `à partir du ${fmtDate(rev.effectiveDate)}.`;

  // Message dans la messagerie du bail (visible côté bailleur) — best-effort
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        lease_id: leaseId, sender: 'Locataire', kind: 'Information',
        subject: "Mise en service de mon contrat d'électricité",
        body: resume, status: 'en-attente', replies: []
      })
    });
  } catch (e) { console.error('message révision charges', e.message); }

  // Notification push au bailleur de CE bail uniquement — best-effort
  try {
    await fetch(`${SITE_URL}/.netlify/functions/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: { user_id: lease.bailleur_id },
        title: '⚡ Charges : date de mise en service reçue',
        body: `${f.tenantName || 'Locataire'} — ${resume}`.slice(0, 180),
        url: 'https://gestion.bailo.pro'
      })
    });
  } catch (e) { console.error('push révision charges', e.message); }

  return rep(200, { ok: true, revision: rev });
}

async function appliquerTout() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/leases?select=id,data`, { headers: sbHeaders() });
  const leases = await r.json();
  const today = aujourdhuiParis();
  let n = 0;
  for (const lease of (Array.isArray(leases) ? leases : [])) {
    const data = lease.data || {};
    if (!data.formData || !Array.isArray(data.formData.chargesRevisions)) continue;
    const appliquees = appliquerRevisionsEchues(data.formData, today);
    if (appliquees.length && (await ecrireBail(lease.id, data))) n += appliquees.length;
  }
  return n;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!SERVICE_KEY) return rep(500, { error: 'Configuration serveur incomplète' });

  try {
    const params = event.queryStringParameters || {};
    const secret = (event.headers && event.headers['x-cron-secret']) || params.secret;
    if (secret === 'bailo-alertes-2026') {
      const n = await appliquerTout();
      return rep(200, { ok: true, appliquees: n });
    }
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      if (payload.action === 'declarer') return await declarer(payload);
      return rep(400, { error: 'action inconnue' });
    }
    return rep(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('revision-charges', e);
    return rep(500, { error: e.message });
  }
};
