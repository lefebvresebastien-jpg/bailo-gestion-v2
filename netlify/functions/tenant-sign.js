// Enregistrement des signatures locataire / garant (bail + état des lieux).
//
// POURQUOI (01/10/2026) : le locataire et le garant n'ont pas de session
// Supabase. Depuis le durcissement RLS de juillet, les écritures directes
// db.from('leases').update(...) faites depuis contrat*.html / locataire.html
// sont filtrées par les policies : 0 ligne modifiée, SANS erreur → la page
// affichait « signature enregistrée » alors que rien n'était sauvegardé.
// On ne touche PAS aux policies (source de nombreux problèmes) : cette
// fonction écrit avec la clé service, mais de façon strictement bornée :
//   - un seul bail (leaseId au format UUID, doit exister) ;
//   - uniquement les champs de signature en liste blanche ;
//   - une signature déjà présente n'est JAMAIS écrasée ;
//   - la signature du bailleur n'est jamais modifiable par ici.
//
// POST { leaseId, formData: { sig_locataire, sig_locataire_at, sig_garant,
//        sig_garant_at, annexChecks, annexesValidatedAt },
//        edlSign: { locataire, locataireAt, locataireExit, locataireExitAt } }
const https = require('https');

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;

const FD_SIGS = { sig_locataire: 'sig_locataire_at', sig_garant: 'sig_garant_at' };
const FD_FREE = ['annexChecks', 'annexesValidatedAt']; // cases d'annexes cochées : modifiables
const EDL_SIGS = { locataire: 'locataireAt', locataireExit: 'locataireExitAt' };
const MAX_SIG_LEN = 600000; // ~450 Ko d'image PNG

function fetchJson(url, options, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: options.method || 'GET', headers: options.headers
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function isSig(v) {
  return typeof v === 'string' && v.startsWith('data:image/png;base64,') && v.length < MAX_SIG_LEN;
}
function isDate(v) {
  return typeof v === 'string' && v.length < 40 && !isNaN(Date.parse(v));
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  const reply = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!SERVICE_KEY) return reply(500, { error: 'Configuration serveur incomplète' });

  try {
    const body = JSON.parse(event.body || '{}');
    const leaseId = String(body.leaseId || '');
    if (!/^[0-9a-f-]{36}$/i.test(leaseId)) return reply(400, { error: 'Bail invalide' });

    const auth = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY };
    const cur = await fetchJson(SUPABASE_URL + '/rest/v1/leases?select=id,data&id=eq.' + leaseId, { headers: auth });
    const lease = Array.isArray(cur.body) ? cur.body[0] : null;
    if (!lease) return reply(404, { error: 'Bail introuvable' });

    const data = lease.data || {};
    const fd = data.formData || {};
    const inFd = (body.formData && typeof body.formData === 'object') ? body.formData : {};
    const inEdl = (body.edlSign && typeof body.edlSign === 'object') ? body.edlSign : {};
    const saved = [];

    // Signatures du bail : posées une seule fois
    Object.keys(FD_SIGS).forEach(k => {
      if (!isSig(inFd[k])) return;
      if (k === 'sig_garant' && !fd.guarantorName) return; // pas de garant prévu au bail
      if (fd[k]) return; // déjà signé : on n'écrase jamais
      fd[k] = inFd[k];
      fd[FD_SIGS[k]] = isDate(inFd[FD_SIGS[k]]) ? inFd[FD_SIGS[k]] : new Date().toISOString();
      saved.push(k);
    });
    // Cases d'annexes (seulement accompagnées d'une signature locataire nouvelle ou existante)
    if (inFd.annexChecks && typeof inFd.annexChecks === 'object' && !Array.isArray(inFd.annexChecks)) {
      const clean = {};
      Object.keys(inFd.annexChecks).slice(0, 20).forEach(k => {
        if (/^chk-[a-z-]{1,30}$/.test(k)) clean[k] = !!inFd.annexChecks[k];
      });
      fd.annexChecks = clean;
      if (isDate(inFd.annexesValidatedAt)) fd.annexesValidatedAt = inFd.annexesValidatedAt;
    }

    // Signatures d'état des lieux : posées une seule fois
    const edl = Object.assign({}, data.edlSign || {});
    Object.keys(EDL_SIGS).forEach(k => {
      if (!isSig(inEdl[k])) return;
      if (edl[k]) return;
      edl[k] = inEdl[k];
      edl[EDL_SIGS[k]] = isDate(inEdl[EDL_SIGS[k]]) ? inEdl[EDL_SIGS[k]] : new Date().toISOString();
      saved.push('edl_' + k);
    });

    if (!saved.length) {
      const already = Object.keys(FD_SIGS).some(k => isSig(inFd[k]) && fd[k]) || Object.keys(EDL_SIGS).some(k => isSig(inEdl[k]) && edl[k]);
      return reply(already ? 409 : 400, { error: already ? 'Ce document est déjà signé.' : 'Aucune signature valide reçue.' });
    }

    data.formData = fd;
    data.edlSign = edl;
    const up = await fetchJson(SUPABASE_URL + '/rest/v1/leases?id=eq.' + leaseId, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, auth)
    }, JSON.stringify({ data: data, updated_at: new Date().toISOString() }));
    if (up.status >= 300) return reply(500, { error: 'Échec enregistrement', detail: up.body });

    return reply(200, { ok: true, saved: saved, data: data });
  } catch (e) {
    return reply(500, { error: e.message });
  }
};
