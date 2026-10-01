// Accès aux baux depuis les pages ouvertes par le locataire ou le garant
// (contrat*.html, locataire.html, espace servi par locataire-page.js).
//
// Le locataire / garant n'a PAS de session Supabase : les lectures et
// écritures directes sur la table leases sont bloquées par RLS (et une
// écriture bloquée ne renvoie même pas d'erreur). Ces deux helpers :
//   - utilisent l'accès direct quand un bailleur est connecté (RLS OK) ;
//   - sinon passent par les fonctions serveur get-lease / tenant-sign.
// Aucune policy Supabase n'est à modifier.
(function () {
  async function session() {
    try {
      if (typeof db === 'undefined' || !db.auth) return null;
      var r = await db.auth.getSession();
      return (r && r.data && r.data.session) || null;
    } catch (e) { return null; }
  }

  // Retourne { data: <ligne leases>, error } — même forme qu'un .single() Supabase
  window.bailoGetLease = async function (leaseId) {
    if (await session()) {
      try {
        var r = await db.from('leases').select('*').eq('id', leaseId).maybeSingle();
        if (r && r.data) return { data: r.data, error: null };
      } catch (e) {}
    }
    try {
      var resp = await fetch('/.netlify/functions/get-lease?id=' + encodeURIComponent(leaseId), { cache: 'no-store' });
      var j = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !j.lease) return { data: null, error: { message: j.error || ('HTTP ' + resp.status) } };
      return { data: j.lease, error: null, settings: j.settings || [] };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  };

  // Enregistre lease.data. Retourne { error } (null si OK).
  // Bailleur connecté : mise à jour directe, en vérifiant qu'une ligne a bien été modifiée.
  // Sinon : seules les signatures locataire / garant / EDL sont transmises au serveur.
  window.bailoSaveLeaseData = async function (leaseId, leaseData) {
    if (await session()) {
      try {
        var r = await db.from('leases').update({ data: leaseData }).eq('id', leaseId).select('id');
        if (r.error) return { error: r.error };
        if (r.data && r.data.length) return { error: null };
      } catch (e) {}
      // 0 ligne modifiée : ce compte n'est pas le bailleur de ce bail → voie locataire
    }
    var fd = (leaseData && leaseData.formData) || {};
    var keys = ['sig_locataire', 'sig_locataire_at', 'sig_garant', 'sig_garant_at', 'annexChecks', 'annexesValidatedAt'];
    var payload = { leaseId: leaseId, formData: {}, edlSign: (leaseData && leaseData.edlSign) || null };
    keys.forEach(function (k) { if (fd[k] !== undefined) payload.formData[k] = fd[k]; });
    try {
      var resp = await fetch('/.netlify/functions/tenant-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var j = await resp.json().catch(function () { return {}; });
      if (!resp.ok) return { error: { message: j.error || ('HTTP ' + resp.status) } };
      return { error: null, data: j.data };
    } catch (e) {
      return { error: { message: e.message } };
    }
  };
})();
