// Netlify Function — SignWell Webhook
// Reçoit les événements SignWell et met à jour Supabase

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdHV5c21ueHNvbWxoZ3ZidHd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcwMDI5NSwiZXhwIjoyMDkyMjc2Mjk1fQ.placeholder'; // service role key
const RESEND_URL  = `${SUPABASE_URL}/functions/v1/send-email`;
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdHV5c21ueHNvbWxoZ3ZidHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDAyOTUsImV4cCI6MjA5MjI3NjI5NX0.ekmk4ujs0H1UfuDopnd_RNop1obgZgRM3ilj0yzqgM0';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventType = payload.event_type; // document_signed, document_completed, document_declined
  const doc = payload.document || {};
  const docId = doc.id;

  console.log('SignWell webhook:', eventType, docId);

  if (!docId) return { statusCode: 200, body: 'OK - no doc id' };

  // Trouver le bail correspondant dans Supabase
  const searchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/leases?select=id,data&data->>signwellDocId=eq.${docId}`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } }
  );
  const leases = await searchRes.json();
  if (!leases || !leases.length) {
    // Essayer avec une recherche plus large
    console.log('Lease not found for docId:', docId);
    return { statusCode: 200, body: 'OK - lease not found' };
  }
  const lease = leases[0];
  const leaseData = lease.data || {};
  const f = leaseData.formData || {};

  // Récupérer la resend key
  const keyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=value&key=eq.resend_api_key`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } }
  );
  const keyData = await keyRes.json();
  const resendKey = keyData?.[0]?.value || '';

  // Récupérer email bailleur
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=value&key=eq.landlord_profile`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` } }
  );
  const profData = await profRes.json();
  const profile = profData?.[0]?.value ? JSON.parse(profData[0].value) : {};
  const bailleurEmail = profile.landlordEmail || f.landlordEmail;

  // Mettre à jour le statut SignWell dans Supabase
  if (eventType === 'document_signed') {
    const signer = doc.recipients?.find(r => r.status === 'signed') || {};
    const signerEmail = signer.email || '';

    // Identifier qui a signé
    let qui = 'inconnu';
    if (signerEmail === f.tenantEmail) qui = 'locataire';
    else if (signerEmail === f.guarantorEmail) qui = 'garant';
    else if (signerEmail === (bailleurEmail || f.landlordEmail)) qui = 'bailleur';

    // Mettre à jour signwellSigners dans Supabase
    const signers = leaseData.signwellSigners || [];
    const updatedSigners = signers.map(s =>
      s.email === signerEmail ? { ...s, status: 'signed', signedAt: new Date().toISOString() } : s
    );
    leaseData.signwellSigners = updatedSigners;

    await fetch(
      `${SUPABASE_URL}/rest/v1/leases?id=eq.${lease.id}`,
      {
        method: 'PATCH',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ data: leaseData })
      }
    );

    // Email bailleur si ce n'est pas lui qui vient de signer
    if (bailleurEmail && qui !== 'bailleur' && resendKey) {
      const nomSignataire = qui === 'locataire' ? f.tenantName : (f.guarantorName || 'Le garant');
      const html = `<div style="font-family:sans-serif;max-width:560px;color:#1a1208">
        <div style="background:#1a1208;padding:16px 20px;border-radius:8px 8px 0 0">
          <span style="color:#e8793a;font-weight:700;font-size:16px">Bailo Gestion</span>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e0d5c8;border-radius:0 0 8px 8px">
          <div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:14px;margin-bottom:16px">
            <p style="font-size:16px;font-weight:700;color:#166534">✅ ${qui === 'garant' ? 'Acte de caution signé !' : 'Bail signé électroniquement !'}</p>
          </div>
          <p style="margin-bottom:12px"><strong>${nomSignataire}</strong> vient de signer ${qui === 'garant' ? "l'acte de caution" : 'le bail'} pour :</p>
          <p style="font-weight:700;margin-bottom:16px">${f.propertyAddress || ''}</p>
          <p style="font-size:12px;color:#6a5a40;">Document SignWell n° ${docId.slice(-8)}</p>
        </div>
      </div>`;

      await fetch(RESEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          to: [bailleurEmail],
          subject: `${nomSignataire} a signé ${qui === 'garant' ? "l'acte de caution" : 'le bail'} — ${f.propertyAddress || ''}`,
          html,
          resend_key: resendKey
        })
      });
    }
  }

  if (eventType === 'document_completed') {
    // Toutes les parties ont signé
    leaseData.signwellCompleted = true;
    leaseData.signwellCompletedAt = new Date().toISOString();

    await fetch(
      `${SUPABASE_URL}/rest/v1/leases?id=eq.${lease.id}`,
      {
        method: 'PATCH',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ data: leaseData })
      }
    );

    // Email bailleur — bail complet
    if (bailleurEmail && resendKey) {
      const html = `<div style="font-family:sans-serif;max-width:560px;color:#1a1208">
        <div style="background:#1a1208;padding:16px 20px;border-radius:8px 8px 0 0">
          <span style="color:#e8793a;font-weight:700;font-size:16px">Bailo Gestion</span>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e0d5c8;border-radius:0 0 8px 8px">
          <div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:14px;margin-bottom:16px">
            <p style="font-size:18px;font-weight:700;color:#166534">✅ Bail signé par toutes les parties !</p>
          </div>
          <p style="margin-bottom:12px">Le contrat de bail pour :</p>
          <p style="font-weight:700;margin-bottom:12px">${f.propertyAddress || ''}</p>
          <p style="margin-bottom:16px">a été signé électroniquement par toutes les parties. SignWell vous a envoyé le document final signé par email.</p>
          <a href="https://v2.gestion.bailo.pro" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Voir dans Bailo Gestion</a>
        </div>
      </div>`;

      await fetch(RESEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          to: [bailleurEmail],
          subject: `✅ Bail signé par toutes les parties — ${f.propertyAddress || ''}`,
          html,
          resend_key: resendKey
        })
      });
    }
  }

  return { statusCode: 200, body: 'OK' };
};
