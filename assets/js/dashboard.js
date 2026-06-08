// ============================================================
// BAILO GESTION v2 — Dashboard
// ============================================================

async function loadDashboard() {
  const dateEl = document.getElementById('dashboard-date');
  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  }
  await Promise.all([loadKPIs(), loadRecentLeases(), loadRecentActivity()]);
}

async function loadKPIs() {
  const { data: leases } = await supabase
    .from('leases')
    .select('id, loyer, charges, statut');

  const all = leases || [];
  const active = all.filter(l => l.statut === 'active' || !l.statut);
  const totalLoyer = active.reduce((sum, l) => sum + (parseFloat(l.loyer)||0) + (parseFloat(l.charges)||0), 0);

  const biensEl = document.getElementById('kpi-biens-val');
  if (biensEl) biensEl.textContent = all.length;

  const bauxEl = document.getElementById('kpi-baux-val');
  if (bauxEl) bauxEl.textContent = active.length;

  const loyersEl = document.getElementById('kpi-loyers-val');
  if (loyersEl) loyersEl.textContent = formatCurrency(totalLoyer);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'Quittance')
    .gte('created_at', monthStart);

  const qEl = document.getElementById('kpi-quittances-val');
  if (qEl) qEl.textContent = count || 0;
}

async function loadRecentLeases() {
  const el = document.getElementById('recent-leases-list');
  if (!el) return;

  const { data, error } = await supabase
    .from('leases')
    .select('id, nom_locataire, prenom_locataire, adresse, loyer, charges, statut')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data?.length) { el.innerHTML = emptyState('Aucun bail pour le moment.'); return; }

  el.innerHTML = data.map(l => {
    const name = [l.prenom_locataire, l.nom_locataire].filter(Boolean).join(' ') || 'Locataire';
    const loyer = (parseFloat(l.loyer)||0) + (parseFloat(l.charges)||0);
    return `
      <div class="list-item" onclick="navigate('leases')">
        <div class="list-item-icon">📄</div>
        <div class="list-item-body">
          <div class="list-item-title">${name}</div>
          <div class="list-item-sub">${l.adresse || '—'}</div>
        </div>
        <div class="list-item-right">
          <div class="list-item-amount">${formatCurrency(loyer)}</div>
          <div class="list-item-date">${leaseStatusBadge(l.statut)}</div>
        </div>
      </div>`;
  }).join('');
}

async function loadRecentActivity() {
  const el = document.getElementById('activity-list');
  if (!el) return;

  const { data, error } = await supabase
    .from('messages')
    .select('id, kind, created_at, lease_id')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error || !data?.length) { el.innerHTML = emptyState('Aucune activité récente.'); return; }

  const icons = { 'Quittance':'🧾', 'Message':'💬', 'EDL':'📋', 'Document':'📄' };
  const labels = { 'Quittance':'Quittance envoyée', 'Message':'Message', 'EDL':'État des lieux', 'Document':'Document' };

  el.innerHTML = data.map(m => `
    <div class="list-item">
      <div class="list-item-icon">${icons[m.kind] || '📌'}</div>
      <div class="list-item-body">
        <div class="list-item-title">${labels[m.kind] || m.kind || 'Événement'}</div>
        <div class="list-item-sub">Bail #${(m.lease_id||'').substring(0,8)}</div>
      </div>
      <div class="list-item-right">
        <div class="list-item-date">${formatRelative(m.created_at)}</div>
      </div>
    </div>`).join('');
}
