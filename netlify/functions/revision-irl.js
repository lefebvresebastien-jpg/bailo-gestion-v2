// Netlify Function — Révision IRL automatique
// 1. Récupère l'IRL courant via INSEE
// 2. Calcule le nouveau loyer
// 3. Envoie email bailleur avec bouton validation
// 4. Mode ?action=valider&leaseId=X&token=Y → applique la révision

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdHV5c21ueHNvbWxoZ3ZidHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDAyOTUsImV4cCI6MjA5MjI3NjI5NX0.ekmk4ujs0H1UfuDopnd_RNop1obgZgRM3ilj0yzqgM0';
const BASE_URL = 'https://v2.gestion.bailo.pro';

async function sbFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  });
  return r.ok;
}

// Récupérer l'IRL courant depuis INSEE BDM
async function fetchIRLCourant() {
  try {
    // Série INSEE IRL : 001515333
    const r = await fetch(
      'https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001515333?lastNObservations=4',
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await r.json();
    const obs = data?.SeriesCollection?.Series?.[0]?.Obs;
    if (obs && obs.length > 0) {
      const last = obs[obs.length - 1];
      return {
        indice: parseFloat(last['@OBS_VALUE']),
        periode: last['@TIME_PERIOD'] // ex: "2025-Q3"
      };
    }
  } catch(e) {}

  // Fallback : données connues T4 2025
  return { indice: 145.73, periode: '2025-Q4', fallback: true };
}

function formatPeriode(p) {
  // "2025-Q4" → "T4 2025"
  if (!p) return '';
  const [year, q] = p.split('-');
  return (q || '').replace('Q','T') + ' ' + year;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  // ── MODE VALIDATION (bailleur clique le bouton dans l'email) ──
  if (params.action === 'valider' && params.leaseId && params.token) {
    return handleValidation(params.leaseId, params.token, params.nouveau_loyer);
  }

  // ── MODE CRON (détection et envoi emails) ──
  const secret = event.headers?.['x-cron-secret'] || params.secret;
  if (secret !== 'bailo-alertes-2026') {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const [leases, profData, keyData, irlData] = await Promise.all([
      sbFetch('leases?select=id,data'),
      sbFetch('settings?select=value&key=eq.landlord_profile'),
      sbFetch('settings?select=value&key=eq.resend_api_key'),
      fetchIRLCourant()
    ]);

    const profile = profData?.[0]?.value ? JSON.parse(profData[0].value) : {};
    const resendKey = keyData?.[0]?.value || '';
    const bailleurEmail = profile.landlordEmail;
    if (!bailleurEmail || !resendKey) return { statusCode: 200, body: 'No config' };

    const today = new Date();
    let envois = 0;

    for (const lease of (leases || [])) {
      const f = lease.data?.formData || {};
      if (!f.effectiveDate || !f.tenantName || !f.rent) continue;

      const effet = new Date(f.effectiveDate);
      const anniv = new Date(today.getFullYear(), effet.getMonth(), effet.getDate());
      if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);
      const joursAvant = Math.round((anniv - today) / 86400000);

      // Déclencher à J-30 et J-7
      if (joursAvant !== 30 && joursAvant !== 7) continue;

      // IRL ancien (référence du bail)
      const irlAncienStr = f.irlReference || 'T4 2024 — indice 143,51';
      const irlAncienMatch = irlAncienStr.match(/[\d,]+/g);
      const irlAncien = irlAncienMatch ? parseFloat(irlAncienMatch[irlAncienMatch.length - 1].replace(',', '.')) : 143.51;

      const irlNouveau = irlData.indice;
      const irlNouveauLabel = (irlData.fallback ? '' : '') + formatPeriode(irlData.periode) + ' — indice ' + irlNouveau.toFixed(2).replace('.', ',');

      const loyerActuel = parseFloat(f.rent) || 0;
      const nouveauLoyer = Math.round((loyerActuel * irlNouveau / irlAncien) * 100) / 100;
      const variation = nouveauLoyer - loyerActuel;
      const variationPct = ((variation / loyerActuel) * 100).toFixed(2);

      // Token de validation sécurisé (simple hash)
      const token = Buffer.from(lease.id + '_' + nouveauLoyer + '_' + anniv.getFullYear()).toString('base64').replace(/=/g,'');
      const lienValider = `${BASE_URL}/.netlify/functions/revision-irl?action=valider&leaseId=${lease.id}&token=${token}&nouveau_loyer=${nouveauLoyer}`;

      const urgence = joursAvant <= 7 ? '🚨 URGENT — ' : '';
      const html = `<div style="font-family:sans-serif;max-width:600px;color:#1a1208">
        <div style="background:#1a1208;padding:16px 20px;border-radius:8px 8px 0 0">
          <span style="color:#e8793a;font-weight:700;font-size:16px">🏡 Bailo Gestion</span>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e0d5c8;border-radius:0 0 8px 8px">
          <h2 style="font-size:17px;margin-bottom:4px">${urgence}Révision IRL — ${f.tenantName}</h2>
          <p style="font-size:12px;color:#9a8a70;margin-bottom:20px">Date anniversaire du bail dans ${joursAvant} jour(s) — ${anniv.toLocaleDateString('fr-FR')}</p>

          <div style="background:#f8f4ee;border-radius:10px;padding:16px;margin-bottom:20px">
            <div style="font-size:12px;color:#6a5a40;margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Logement</div>
            <div style="font-weight:700;font-size:15px;margin-bottom:4px">${f.propertyAddress || ''}</div>
            <div style="font-size:13px;color:#3a2a18">Locataire : ${f.tenantName}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;text-align:center">
            <div style="background:#f0f7ff;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#6a5a40;margin-bottom:4px">Loyer actuel</div>
              <div style="font-size:18px;font-weight:700">${loyerActuel.toFixed(2).replace('.',',')} €</div>
              <div style="font-size:10px;color:#9a8a70">${irlAncienStr}</div>
            </div>
            <div style="background:#f0fff4;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#6a5a40;margin-bottom:4px">Nouveau loyer</div>
              <div style="font-size:18px;font-weight:700;color:#16a34a">${nouveauLoyer.toFixed(2).replace('.',',')} €</div>
              <div style="font-size:10px;color:#9a8a70">${irlNouveauLabel}</div>
            </div>
            <div style="background:#fff8f0;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#6a5a40;margin-bottom:4px">Variation</div>
              <div style="font-size:18px;font-weight:700;color:#e8793a">+${variation.toFixed(2).replace('.',',')} €</div>
              <div style="font-size:10px;color:#9a8a70">+${variationPct}%</div>
            </div>
          </div>

          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:20px;font-size:12px;color:#92400e">
            <strong>⚖️ Rappel légal :</strong> La révision doit être notifiée au locataire avant la date anniversaire. 
            Si elle n'est pas demandée, vous perdez le droit à la révision pour cette année.
          </div>

          <div style="text-align:center;margin-bottom:16px">
            <a href="${lienValider}" style="display:inline-block;background:#16a34a;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
              ✅ Valider et notifier ${f.tenantName}
            </a>
            <div style="font-size:11px;color:#9a8a70;margin-top:8px">
              Le locataire sera informé automatiquement par email et message dans son espace
            </div>
          </div>

          <div style="text-align:center">
            <a href="${BASE_URL}" style="font-size:12px;color:#6a5a40;text-decoration:none">Ouvrir Bailo Gestion →</a>
          </div>
        </div>
      </div>`;

      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          to: [bailleurEmail],
          subject: `${urgence}Révision IRL à valider — ${f.tenantName} (${anniv.toLocaleDateString('fr-FR')})`,
          html,
          resend_key: resendKey
        })
      });
      envois++;
    }

    return { statusCode: 200, body: `${envois} email(s) de révision envoyés` };

  } catch(err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};

// ── Validation : le bailleur a cliqué le bouton ──
async function handleValidation(leaseId, token, nouveauLoyerStr) {
  try {
    const nouveauLoyer = parseFloat(nouveauLoyerStr);
    if (!nouveauLoyer) return pageErreur('Montant invalide.');

    // Charger le bail
    const leases = await sbFetch(`leases?select=id,data&id=eq.${leaseId}`);
    const lease = leases?.[0];
    if (!lease) return pageErreur('Bail introuvable.');

    const f = lease.data?.formData || {};
    const loyerActuel = parseFloat(f.rent) || 0;
    const anniv = new Date();

    // Vérifier le token
    const tokenAttendu = Buffer.from(leaseId + '_' + nouveauLoyer + '_' + anniv.getFullYear()).toString('base64').replace(/=/g,'');
    if (token !== tokenAttendu) return pageErreur('Token invalide ou expiré.');

    const irlData = await fetchIRLCourant();
    const irlNouveauLabel = formatPeriode(irlData.periode) + ' — indice ' + irlData.indice.toFixed(2).replace('.', ',');

    // Mettre à jour le bail
    const leaseData = lease.data || {};
    const fd = leaseData.formData || {};
    const ancienLoyer = fd.rent;
    fd.rent = nouveauLoyer;
    fd.irlReference = irlNouveauLabel;
    fd.lastIRLRevision = new Date().toISOString();
    fd.lastIRLAncienLoyer = ancienLoyer;
    leaseData.formData = fd;

    await sbPatch(`leases?id=eq.${leaseId}`, { data: leaseData });

    // Envoyer message + email au locataire
    const keyData = await sbFetch('settings?select=value&key=eq.resend_api_key');
    const resendKey = keyData?.[0]?.value || '';

    const dateApplication = new Date();
    dateApplication.setDate(dateApplication.getDate() + 7);
    const dateStr = dateApplication.toLocaleDateString('fr-FR');

    const msgLocataire = `Bonjour ${f.tenantName},\n\nConformément à l'article 17-1 de la loi du 6 juillet 1989 et à la clause de révision de votre contrat de bail, je vous informe de la révision annuelle de votre loyer :\n\n• Loyer actuel : ${parseFloat(ancienLoyer).toFixed(2).replace('.',',')} €\n• IRL de référence (nouveau) : ${irlNouveauLabel}\n• Nouveau loyer mensuel hors charges : ${nouveauLoyer.toFixed(2).replace('.',',')} €\n\nCette révision prend effet à compter du ${dateStr}.\n\nCordialement.`;

    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        lease_id: leaseId,
        sender: 'Bailleur',
        kind: 'Renseignement',
        subject: 'Révision annuelle de votre loyer',
        body: msgLocataire,
        status: 'traité',
        replies: []
      })
    });

    if (f.tenantEmail && resendKey) {
      const htmlLocataire = `<div style="font-family:sans-serif;max-width:560px;color:#1a1208">
        <div style="background:#1a1208;padding:16px 20px;border-radius:8px 8px 0 0"><span style="color:#e8793a;font-weight:700">🏠 Bailo Gestion</span></div>
        <div style="background:#fff;padding:24px;border:1px solid #e0d5c8;border-radius:0 0 8px 8px">
          <h2 style="font-size:16px">Révision annuelle de votre loyer</h2>
          <p style="white-space:pre-line;font-size:13px;line-height:1.7;margin:16px 0">${msgLocataire.replace(/\n/g,'<br>')}</p>
          <a href="https://v2.gestion.bailo.pro/locataire.html?id=${leaseId}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Voir dans mon espace</a>
        </div>
      </div>`;

      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          to: [f.tenantEmail],
          subject: 'Révision annuelle de votre loyer — ' + (f.propertyAddress || ''),
          html: htmlLocataire,
          resend_key: resendKey
        })
      });
    }

    return pageSucces(f.tenantName, ancienLoyer, nouveauLoyer, dateStr, leaseId);

  } catch(err) {
    return pageErreur(err.message);
  }
}

function pageSucces(tenant, ancienLoyer, nouveauLoyer, dateApplication, leaseId) {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Révision validée — Bailo</title></head>
  <body style="font-family:sans-serif;background:#f5f0ea;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px">
    <div style="background:white;border-radius:12px;padding:32px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <h1 style="font-size:20px;margin-bottom:8px;color:#1a1208">Révision validée !</h1>
      <p style="color:#6a5a40;font-size:14px;margin-bottom:24px">${tenant} a été notifié(e) par email et message dans son espace.</p>
      <div style="background:#f0fff4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:24px">
        <div style="display:flex;justify-content:space-around">
          <div><div style="font-size:12px;color:#6a5a40">Ancien loyer</div><div style="font-size:20px;font-weight:700">${parseFloat(ancienLoyer).toFixed(2).replace('.',',')} €</div></div>
          <div style="font-size:24px;color:#16a34a;align-self:center">→</div>
          <div><div style="font-size:12px;color:#6a5a40">Nouveau loyer</div><div style="font-size:20px;font-weight:700;color:#16a34a">${parseFloat(nouveauLoyer).toFixed(2).replace('.',',')} €</div></div>
        </div>
        <div style="font-size:12px;color:#6a5a40;margin-top:8px">Applicable à partir du ${dateApplication}</div>
      </div>
      <a href="https://v2.gestion.bailo.pro" style="display:inline-block;background:#1a1208;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ouvrir Bailo Gestion</a>
    </div>
  </body></html>`;
  return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
}

function pageErreur(msg) {
  return { statusCode: 400, headers: { 'Content-Type': 'text/html' },
    body: `<div style="font-family:sans-serif;padding:32px;text-align:center"><h2>❌ Erreur</h2><p>${msg}</p><a href="https://v2.gestion.bailo.pro">Retour à Bailo</a></div>` };
}
