// Révisions programmées de la provision pour charges (12/11/2026).
//
// Stockage : lease.data.formData
//   chargesRevisions : [{
//     id, createdAt,
//     oldCharges, newCharges,          // montants mensuels (nombres)
//     motif,                           // texte libre (affiché au locataire)
//     rule: 'date' | 'evenement',      // date fixe, ou 1er du mois suivant un événement
//     eventType: 'contrat_electricite',// événement déclaré par le locataire (rule 'evenement')
//     eventDate, declaredBy, declaredAt,
//     effectiveDate,                   // 'YYYY-MM-DD' (toujours un 1er du mois pour 'evenement')
//     status: 'attente' | 'programmee' | 'appliquee' | 'annulee',
//     appliedAt, cancelledAt
//   }]
//   chargesHistory : [{ from: 'YYYY-MM-DD', charges, previous, revisionId }]
//
// Une révision « attente » attend la date de l'événement (déclarée par le
// locataire depuis son espace, ou saisie par le bailleur). Elle devient
// « programmee » avec sa date d'effet, puis « appliquee » le jour venu :
// formData.charges prend le nouveau montant et l'historique garde l'ancien,
// pour que les quittances des mois antérieurs restent justes.
//
// La même logique existe côté navigateur dans index.html (bloc « RÉVISION DES
// CHARGES ») : garder les deux en phase.

function aujourdhuiParis() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
}

// 1er jour du mois qui suit une date 'YYYY-MM-DD'
function premierDuMoisSuivant(dateStr) {
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(5, 7), 10); // 1..12
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return ny + '-' + String(nm).padStart(2, '0') + '-01';
}

function estDateValide(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().substring(0, 10) === s;
}

// Applique les révisions programmées dont la date d'effet est atteinte.
// Modifie formData en place. Retourne la liste des révisions appliquées.
function appliquerRevisionsEchues(formData, today) {
  const f = formData || {};
  const revs = Array.isArray(f.chargesRevisions) ? f.chargesRevisions : [];
  const jour = today || aujourdhuiParis();
  const dues = revs
    .filter(r => r && r.status === 'programmee' && r.effectiveDate && r.effectiveDate <= jour)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1));
  for (const r of dues) {
    const previous = parseFloat(f.charges) || 0;
    const nouveau = Number(r.newCharges) || 0;
    f.charges = nouveau.toFixed(2);
    f.chargesHistory = Array.isArray(f.chargesHistory) ? f.chargesHistory : [];
    f.chargesHistory.push({ from: r.effectiveDate, charges: nouveau, previous, revisionId: r.id });
    r.status = 'appliquee';
    r.appliedAt = new Date().toISOString();
  }
  return dues;
}

module.exports = { aujourdhuiParis, premierDuMoisSuivant, estDateValide, appliquerRevisionsEchues };
