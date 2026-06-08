// ============================================================
// BAILO GESTION v2 — Tenants (Locataires)
// ============================================================

async function loadTenants() {
  const el = document.getElementById('tenants-list');
  if (!el) return;
  el.innerHTML = '<div class="list-loading">Chargement…</div>';

  const { data, error } = await supabase
    .from('leases')
    .select('id, nom_locataire, prenom_locataire, email_locataire, tel_locataire, adresse, statut, date_debut')
    .order('nom_locataire');

  if (error) { el.innerHTML = '<div class="list-loading">Erreur de chargement.</div>'; return; }
  if (!data?.length) { el.innerHTML = emptyState('Aucun locataire pour le moment.'); return; }

  el.innerHTML = `
    <div class="tenants-table">
      <div class="tenant-row-header">
        <span>Locataire</span>
        <span>Contact</span>
        <span>Bien</span>
        <span>Statut</span>
      </div>
      ${data.map(t => renderTenantRow(t)).join('')}
    </div>
  `;
}

function renderTenantRow(t) {
  const name = [t.prenom_locataire, t.nom_locataire].filter(Boolean).join(' ') || '—';
  return `
    <div class="tenant-row" onclick="navigate('leases')">
      <div>
        <div class="tenant-name">${name}</div>
        ${t.tel_locataire ? `<div style="font-size:11px;color:var(--color-text-tertiary)">${t.tel_locataire}</div>` : ''}
      </div>
      <div class="tenant-email">${t.email_locataire || '—'}</div>
      <div class="tenant-lease">${t.adresse || '—'}</div>
      <div>${leaseStatusBadge(t.statut || 'active')}</div>
    </div>
  `;
}
