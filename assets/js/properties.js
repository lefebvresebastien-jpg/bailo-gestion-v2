// ============================================================
// BAILO GESTION v2 — Properties (Biens)
// Lecture depuis la table leases (champ adresse + type_bail)
// En v2 on extraira les biens dans leur propre table plus tard
// ============================================================

async function loadProperties() {
  const el = document.getElementById('properties-list');
  if (!el) return;
  el.innerHTML = '<div class="list-loading">Chargement…</div>';

  // Pour l'instant on déduplique les adresses depuis les baux
  const { data, error } = await supabase
    .from('leases')
    .select('id, adresse, type_bail, surface, pieces, loyer, charges, statut, nom_locataire, prenom_locataire')
    .order('adresse');

  if (error) { el.innerHTML = '<div class="list-loading">Erreur de chargement.</div>'; return; }
  if (!data?.length) {
    el.innerHTML = `<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--color-text-secondary);">
      Aucun bien enregistré. <button class="btn-ghost" onclick="openLeaseWizard()">Créer un premier bail</button>
    </div>`;
    return;
  }

  el.innerHTML = data.map(b => renderPropertyCard(b)).join('');
}

function renderPropertyCard(b) {
  const tenant = [b.prenom_locataire, b.nom_locataire].filter(Boolean).join(' ') || null;
  const loyer = (parseFloat(b.loyer)||0) + (parseFloat(b.charges)||0);
  return `
    <div class="property-card" onclick="navigate('leases')">
      <div class="property-card-header">
        <div>
          <div class="property-address">${b.adresse || '—'}</div>
          <div class="property-type">${b.type_bail || 'Bail nu'}${b.surface ? ' · ' + b.surface + ' m²' : ''}${b.pieces ? ' · ' + b.pieces + ' pièces' : ''}</div>
        </div>
        ${leaseStatusBadge(b.statut || 'active')}
      </div>
      <div class="property-card-body">
        <div class="property-stat">
          <span class="property-stat-label">Loyer CC</span>
          <span class="property-stat-value">${formatCurrency(loyer)}</span>
        </div>
        ${tenant ? `<div class="property-stat">
          <span class="property-stat-label">Locataire</span>
          <span class="property-stat-value">${tenant}</span>
        </div>` : ''}
      </div>
    </div>
  `;
}

function openPropertyForm() {
  // Pour l'instant on redirige vers la création de bail
  openLeaseWizard();
}
