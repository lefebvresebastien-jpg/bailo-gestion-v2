// ============================================================
// BAILO GESTION v2 — Dashboard
// ============================================================

async function loadDashboard() {
  // Set date
  const dateEl = document.getElementById('dashboard-date');
  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  }

  await Promise.all([
    loadKPIs(),
    loadRecentLeases(),
    loadRecentActivity()
  ]);
}

async function loadKPIs() {
  const { data: leases } = await supabase
    .from('leases')
    .select('id, loyer, statut, date_debut, date_fin');

  const active = (leases || []).filter(l => l.statut === 'active' || !l.statut);
  const totalLoyer = active.reduce((sum, l) => sum + (parseFloat(l.loyer) || 0), 0);

  document.getElementById('kpi-baux-val').textContent = active.length;
  document.getElementById('kpi-loyers-val').textContent = formatCurrency(totalLoyer);

  // Quittances this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count: quittancesCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'Quittance')
    .gte('created_at', monthStart);

  document.getElementById('kpi-quittances-val').textContent = quittancesCount || 0;

  // Pending (placeholder — based on leases without recent quittance)
  document.getElementById('kpi-retard-val').textContent = '—';
}

async function loadRecentLeases() {
  const el = document.getElementById('recent-leases-list');
  const { data: leases, error } = await supabase
    .from('leases')
    .select('id, nom_locataire, adresse, loyer, statut, date_debut')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !leases?.length) {
    el.innerHTML = emptyState('Aucun bail pour le moment.');
    return;
  }

  el.innerHTML = leases.map(l => `
    <div class="list-item" onclick="navigate('leases')">
      <div class="list-item-icon">🏠</div>
      <div class="list-item-body">
        <div class="list-item-title">${l.nom_locataire || 'Locataire'}</div>
        <div class="list-item-sub">${l.adresse || '—'}</div>
      </div>
      <div class="list-item-right">
        <div class="list-item-amount">${formatCurrency(l.loyer)}</div>
        <div class="list-item-date">${leaseStatusBadge(l.statut)}</div>
      </div>
    </div>
  `).join('');
}

async function loadRecentActivity() {
  const el = document.getElementById('activity-list');
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('id, kind, created_at, lease_id')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error || !msgs?.length) {
    el.innerHTML = emptyState('Aucune activité récente.');
    return;
  }

  const kindLabel = {
    'Quittance': { icon: '🧾', label: 'Quittance envoyée' },
    'Message': { icon: '💬', label: 'Message' },
    'EDL': { icon: '📋', label: 'État des lieux' },
    'Document': { icon: '📄', label: 'Document' },
  };

  el.innerHTML = msgs.map(m => {
    const info = kindLabel[m.kind] || { icon: '📌', label: m.kind || 'Événement' };
    return `
      <div class="list-item">
        <div class="list-item-icon">${info.icon}</div>
        <div class="list-item-body">
          <div class="list-item-title">${info.label}</div>
          <div class="list-item-sub">Bail #${(m.lease_id || '').substring(0, 8)}</div>
        </div>
        <div class="list-item-right">
          <div class="list-item-date">${formatRelative(m.created_at)}</div>
        </div>
      </div>
    `;
  }).join('');
}
