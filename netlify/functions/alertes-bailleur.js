// Netlify Function — Alertes bailleur quotidiennes
// Appelée par pg_cron tous les matins à 8h
// SÉCURITÉ/FIABILITÉ (corrigé le 14/07/2026) : cette fonction utilisait
// uniquement la clé anonyme, sans session utilisateur. Depuis l'activation
// de RLS sur leases/settings (10/07/2026, filtrée par auth.uid()=bailleur_id),
// un appel avec la seule clé anon ne peut plus rien lire (auth.uid() est NULL
// côté serveur) — cette fonction tournait donc sans erreur mais ne trouvait
// jamais aucun bail, et n'envoyait donc plus aucune alerte depuis le 10/07.
// Remplacée par la clé service_role (contourne légitimement RLS pour cet
// automatisme système), lue depuis une variable d'environnement.

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_GESTION_SERVICE_KEY;

async function sbFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  return r.json();
}

exports.handler = async (event) => {
  // Sécurité : vérifier le secret
  const secret = event.headers['x-cron-secret'] || event.queryStringParameters?.secret;
  if (secret !== 'bailo-alertes-2026') {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  if (!SERVICE_KEY) {
    console.error('SUPABASE_GESTION_SERVICE_KEY manquante');
    return { statusCode: 500, body: 'Configuration serveur incomplète' };
  }

  try {
    // Charger baux + profil bailleur + resend key
    const [leases, profData, keyData] = await Promise.all([
      sbFetch('leases?select=id,data'),
      sbFetch('settings?select=value&key=eq.landlord_profile'),
      sbFetch('settings?select=value&key=eq.resend_api_key')
    ]);

    const profile = profData?.[0]?.value ? JSON.parse(profData[0].value) : {};
    const resendKey = keyData?.[0]?.value || '';
    const bailleurEmail = profile.landlordEmail;

    if (!bailleurEmail || !resendKey) {
      return { statusCode: 200, body: 'No email or resend key configured' };
    }

    const today = new Date();
    const alertes = [];

    (leases || []).forEach(lease => {
      const f = lease.data?.formData || {};
      if (!f.tenantName) return;
      const nom = f.tenantName;
      const adresse = (f.propertyAddress || '').split(',')[0];

      // 1. Révision IRL — 30 et 7 jours avant
      if (f.effectiveDate) {
        const effet = new Date(f.effectiveDate);
        const anniv = new Date(today.getFullYear(), effet.getMonth(), effet.getDate());
        if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);
        const j = Math.round((anniv - today) / 86400000);
        if (j === 30 || j === 7) {
          alertes.push({
            urgence: j <= 7 ? 'URGENT' : 'INFO',
            icon: '📊',
            titre: `Révision IRL dans ${j} jour(s) — ${nom}`,
            detail: `Le bail du logement ${adresse} arrive à sa date anniversaire le ${anniv.toLocaleDateString('fr-FR')}. Pensez à calculer et notifier la révision de loyer (IRL ref : ${f.irlReference || 'à vérifier'}).`,
            lien: `https://v2.gestion.bailo.pro/#leases`
          });
        }
      }

      // 2. Fin de bail — 90, 60, 30 jours avant
      if (f.effectiveDate && f.duration) {
        const effet = new Date(f.effectiveDate);
        const dureeAns = f.duration.includes('3 ans') ? 3 : f.duration.includes('2 ans') ? 2 : 1;
        const fin = new Date(effet);
        fin.setFullYear(fin.getFullYear() + dureeAns);
        const j = Math.round((fin - today) / 86400000);
        if (j === 90 || j === 60 || j === 30) {
          alertes.push({
            urgence: j <= 30 ? 'URGENT' : 'ATTENTION',
            icon: '📅',
            titre: `Fin de bail dans ${j} jour(s) — ${nom}`,
            detail: `Le bail du logement ${adresse} se termine le ${fin.toLocaleDateString('fr-FR')}. Préavis bailleur : ${f.noticePeriodLandlord || '6 mois'}. Préavis locataire : ${f.noticePeriodTenant || '3 mois'}.`,
            lien: `https://v2.gestion.bailo.pro/#leases`
          });
        }
      }

      // 3. Assurance — 30 et 14 jours avant renouvellement
      if (f.effectiveDate) {
        const effet = new Date(f.effectiveDate);
        const anniv = new Date(today.getFullYear(), effet.getMonth(), effet.getDate());
        if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);
        const j = Math.round((anniv - today) / 86400000);
        if (j === 30 || j === 14) {
          alertes.push({
            urgence: 'INFO',
            icon: '🛡',
            titre: `Attestation assurance à demander — ${nom}`,
            detail: `Le renouvellement annuel de l'attestation assurance habitation est dans ${j} jour(s). Envoyez un rappel à ${f.tenantEmail || 'votre locataire'}.`,
            lien: `https://v2.gestion.bailo.pro/#messages`
          });
        }
      }

      // 4. DPE F ou G — alerte hebdo le lundi
      if ((f.dpeClass === 'F' || f.dpeClass === 'G') && today.getDay() === 1) {
        alertes.push({
          urgence: 'ATTENTION',
          icon: '⚡',
          titre: `DPE ${f.dpeClass} — ${adresse}`,
          detail: `Ce logement est classé ${f.dpeClass}. La loi Climat impose des travaux de rénovation. Le loyer ne peut pas être révisé à la hausse.`,
          lien: `https://v2.gestion.bailo.pro/#leases`
        });
      }
    });

    if (!alertes.length) {
      return { statusCode: 200, body: 'Aucune alerte aujourd\'hui' };
    }

    // Construire l'email
    const urgentes = alertes.filter(a => a.urgence === 'URGENT');
    const autres = alertes.filter(a => a.urgence !== 'URGENT');

    const alerteHtml = (a) => {
      const colors = { 'URGENT': '#dc2626', 'ATTENTION': '#d97706', 'INFO': '#2563eb' };
      const bgs = { 'URGENT': '#fee2e2', 'ATTENTION': '#fef3c7', 'INFO': '#dbeafe' };
      const c = colors[a.urgence] || '#2563eb';
      const bg = bgs[a.urgence] || '#dbeafe';
      return `<div style="background:${bg};border-left:4px solid ${c};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700;color:${c}">${a.icon} ${a.titre}</div>
        <div style="font-size:12px;color:#3a2010;margin-top:4px">${a.detail}</div>
        <a href="${a.lien}" style="font-size:11px;color:${c};margin-top:6px;display:inline-block">Voir dans Bailo →</a>
      </div>`;
    };

    const html = `<div style="font-family:sans-serif;max-width:600px;color:#1a1208">
      <div style="background:#1a1208;padding:16px 20px;border-radius:8px 8px 0 0">
        <span style="color:#e8793a;font-weight:700;font-size:16px">🏡 Bailo Gestion</span>
        <span style="color:rgba(255,255,255,.5);font-size:12px;margin-left:8px">Alertes du ${today.toLocaleDateString('fr-FR')}</span>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e0d5c8;border-radius:0 0 8px 8px">
        <h2 style="font-size:16px;margin-bottom:4px">${alertes.length} alerte${alertes.length > 1 ? 's' : ''} aujourd'hui</h2>
        <p style="font-size:12px;color:#9a8a70;margin-bottom:20px">Actions requises pour votre portefeuille immobilier</p>
        ${urgentes.length ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#dc2626;margin-bottom:8px">🚨 Urgentes</div>${urgentes.map(alerteHtml).join('')}` : ''}
        ${autres.length ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#6a5a40;margin-bottom:8px;margin-top:${urgentes.length?'16px':'0'}">📋 À traiter</div>${autres.map(alerteHtml).join('')}` : ''}
        <div style="margin-top:20px;text-align:center">
          <a href="https://v2.gestion.bailo.pro" style="display:inline-block;background:#1a1208;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ouvrir Bailo Gestion</a>
        </div>
      </div>
    </div>`;

    // Envoyer via Edge Function Supabase
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({
        to: [bailleurEmail],
        subject: `[Bailo] ${urgentes.length ? '🚨 ' : ''}${alertes.length} alerte${alertes.length > 1 ? 's' : ''} — ${today.toLocaleDateString('fr-FR')}`,
        html,
        resend_key: resendKey
      })
    });

    return { statusCode: 200, body: `${alertes.length} alertes envoyées à ${bailleurEmail}` };

  } catch(err) {
    console.error('Erreur alertes:', err);
    return { statusCode: 500, body: err.message };
  }
};
