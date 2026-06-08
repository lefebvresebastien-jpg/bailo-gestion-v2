// ============================================================
// BAILO GESTION v2 — UI Utilities
// ============================================================

const PAGE_TITLES = {
  dashboard: 'Tableau de bord',
  leases: 'Baux',
  receipts: 'Quittances',
  messages: 'Messagerie',
  tenant: 'Espace locataire'
};

function navigate(page, linkEl) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });

  // Show target page
  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');

  // Update topbar title
  const title = PAGE_TITLES[page] || page;
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = title;

  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  // Trigger page load if needed
  if (page === 'leases') loadLeases();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ---- Toast ----
let toastTimer = null;

function showToast(msg, type = '', duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, duration);
}

// ---- Formatters ----
function formatCurrency(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(dateStr));
}

function formatMonth(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(dateStr));
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return formatDate(dateStr);
}

// ---- Status helpers ----
function leaseStatusBadge(status) {
  const map = {
    active: ['badge-active', 'Actif'],
    ended: ['badge-ended', 'Terminé'],
    draft: ['badge-draft', 'Brouillon'],
  };
  const [cls, label] = map[status] || ['badge-ended', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ---- Empty state ----
function emptyState(msg) {
  return `<div class="list-loading">${msg}</div>`;
}
