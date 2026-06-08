// ============================================================
// BAILO GESTION v2 — UI Utilities
// ============================================================

const PAGE_TITLES = {
  dashboard:  'Tableau de bord',
  properties: 'Biens',
  leases:     'Baux',
  tenants:    'Locataires',
  receipts:   'Quittances',
  payments:   'Paiements',
  messages:   'Messages',
  documents:  'Documents',
  settings:   'Paramètres'
};

function navigate(page, linkEl) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });

  const target = document.getElementById('page-' + page);
  if (target) { target.classList.remove('hidden'); target.classList.add('active'); }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');

  const title = PAGE_TITLES[page] || page;
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = title;

  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');

  // Trigger page loaders
  if (page === 'leases')     loadLeases();
  if (page === 'properties') loadProperties();
  if (page === 'tenants')    loadTenants();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ---- Toast ----
let _toastTimer = null;
function showToast(msg, type = '', duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ---- Formatters ----
function formatCurrency(amount) {
  if (amount == null || amount === '') return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(dateStr));
}
function formatRelative(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff < 7)  return `Il y a ${diff} j`;
  return formatDate(dateStr);
}

// ---- Badges ----
function leaseStatusBadge(status) {
  const map = { active: ['badge-active','Actif'], ended: ['badge-ended','Terminé'], draft: ['badge-draft','Brouillon'] };
  const [cls, label] = map[status] || ['badge-ended', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function emptyState(msg) {
  return `<div class="list-empty">${msg}</div>`;
}
