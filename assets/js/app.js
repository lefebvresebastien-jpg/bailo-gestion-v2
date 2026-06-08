/* v3 */
// ============================================================
// BAILO GESTION v2 — App Entry
// ============================================================

function initApp() {
  // Load dashboard (default page)
  loadDashboard();
}

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});
