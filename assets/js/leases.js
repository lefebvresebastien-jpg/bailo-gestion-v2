/* v3 */
// ============================================================
// BAILO GESTION v2 — Leases
// ============================================================

let _allLeases = [];

async function loadLeases() {
  const el = document.getElementById('leases-list');
  if (!el) return;
  el.innerHTML = '<div class="list-loading">Chargement des baux…</div>';

  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    el.innerHTML = '<div class="list-loading">Erreur lors du chargement.</div>';
    console.error(error);
    return;
  }

  _allLeases = data || [];
  updateBadgeLease(_allLeases.filter(l => l.statut === 'active' || !l.statut).length);
  renderLeases(_allLeases);
}

function filterLeases() {
  const search = (document.getElementById('leases-search')?.value || '').toLowerCase();
  const status = document.getElementById('leases-status-filter')?.value || '';

  const filtered = _allLeases.filter(l => {
    const matchSearch = !search ||
      (l.nom_locataire || '').toLowerCase().includes(search) ||
      (l.adresse || '').toLowerCase().includes(search) ||
      (l.prenom_locataire || '').toLowerCase().includes(search);
    const matchStatus = !status || l.statut === status || (!l.statut && status === 'active');
    return matchSearch && matchStatus;
  });

  renderLeases(filtered);
}

function renderLeases(leases) {
  const el = document.getElementById('leases-list');
  if (!el) return;

  if (!leases.length) {
    el.innerHTML = `
      <div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--color-text-secondary);">
        Aucun bail trouvé. <button class="btn-ghost" onclick="openLeaseWizard()">Créer un bail</button>
      </div>`;
    return;
  }

  el.innerHTML = leases.map(l => renderLeaseCard(l)).join('');
}

function renderLeaseCard(l) {
  const tenant = [l.prenom_locataire, l.nom_locataire].filter(Boolean).join(' ') || 'Locataire';
  const status = l.statut || 'active';
  const charges = l.charges ? ` + ${formatCurrency(l.charges)} charges` : '';

  return `
    <div class="lease-card" onclick="openLeaseDetail('${l.id}')">
      <div class="lease-card-header">
        <div>
          <div class="lease-tenant">${tenant}</div>
          <div class="lease-address">${l.adresse || '—'}</div>
        </div>
        ${leaseStatusBadge(status)}
      </div>
      <div class="lease-card-body">
        <div class="lease-detail">
          <span class="lease-detail-label">Loyer CC</span>
          <span class="lease-detail-value">${formatCurrency(l.loyer)}${charges}</span>
        </div>
        <div class="lease-detail">
          <span class="lease-detail-label">Début</span>
          <span class="lease-detail-value">${formatDate(l.date_debut)}</span>
        </div>
        ${l.date_fin ? `<div class="lease-detail">
          <span class="lease-detail-label">Fin</span>
          <span class="lease-detail-value">${formatDate(l.date_fin)}</span>
        </div>` : ''}
      </div>
      <div class="lease-card-footer">
        <span>${l.type_bail || 'Bail nu'}</span>
        <span>ID: ${l.id.substring(0, 8)}</span>
      </div>
    </div>
  `;
}

function updateBadgeLease(count) {
  const el = document.getElementById('badge-leases');
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function openLeaseDetail(id) {
  // Future: open detail panel or page
  showToast('Détail du bail — bientôt disponible.', '', 2000);
}
