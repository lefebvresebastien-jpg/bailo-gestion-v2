/* v3 */
// ============================================================
// BAILO GESTION v2 — Auth
// ============================================================

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-btn');
  const errEl = document.getElementById('auth-error');

  if (!email || !password) {
    showAuthError('Veuillez saisir votre email et mot de passe.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connexion…';
  errEl.classList.add('hidden');

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showAuthError('Email ou mot de passe incorrect.');
    btn.disabled = false;
    btn.textContent = 'Se connecter';
    return;
  }

  onAuthSuccess(data.user);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleLogout() {
  await db.auth.signOut();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

function onAuthSuccess(user) {
  // Update UI with user info
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.charAt(0).toUpperCase();

  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-email').textContent = user.email;

  // Show app
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Load initial data
  initApp();
}

// Check existing session on load
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    onAuthSuccess(session.user);
  }
}

// Enter key on auth inputs
document.addEventListener('DOMContentLoaded', () => {
  ['auth-email', 'auth-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleAuth();
    });
  });
});
