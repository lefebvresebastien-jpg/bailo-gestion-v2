// ============================================================
// BAILO GESTION v2 — Lease Wizard
// ============================================================

let _wizardStep = 1;
const WIZARD_TOTAL_STEPS = 4;
let _wizardData = {};

const WIZARD_STEPS_CONTENT = {
  1: () => `
    <div class="wizard-section-title">Le bien immobilier</div>
    <div class="form-group">
      <label>Adresse complète *</label>
      <input type="text" id="w-adresse" value="${_wizardData.adresse || ''}" placeholder="12 rue de la Paix, 75001 Paris" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Type de bail</label>
        <select id="w-type-bail">
          <option value="Bail nu" ${_wizardData.type_bail === 'Bail nu' ? 'selected' : ''}>Bail nu</option>
          <option value="Bail meublé" ${_wizardData.type_bail === 'Bail meublé' ? 'selected' : ''}>Bail meublé</option>
          <option value="Bail mobilité" ${_wizardData.type_bail === 'Bail mobilité' ? 'selected' : ''}>Bail mobilité</option>
        </select>
      </div>
      <div class="form-group">
        <label>Surface (m²)</label>
        <input type="number" id="w-surface" value="${_wizardData.surface || ''}" placeholder="45" min="1" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Étage</label>
        <input type="text" id="w-etage" value="${_wizardData.etage || ''}" placeholder="2ème" />
      </div>
      <div class="form-group">
        <label>Nombre de pièces</label>
        <input type="number" id="w-pieces" value="${_wizardData.pieces || ''}" placeholder="3" min="1" />
      </div>
    </div>
  `,

  2: () => `
    <div class="wizard-section-title">Le(s) locataire(s)</div>
    <div class="form-row">
      <div class="form-group">
        <label>Prénom *</label>
        <input type="text" id="w-prenom" value="${_wizardData.prenom_locataire || ''}" placeholder="Marie" />
      </div>
      <div class="form-group">
        <label>Nom *</label>
        <input type="text" id="w-nom" value="${_wizardData.nom_locataire || ''}" placeholder="Dupont" />
      </div>
    </div>
    <div class="form-group">
      <label>Email du locataire</label>
      <input type="email" id="w-email" value="${_wizardData.email_locataire || ''}" placeholder="marie.dupont@mail.com" />
    </div>
    <div class="form-group">
      <label>Téléphone</label>
      <input type="tel" id="w-tel" value="${_wizardData.tel_locataire || ''}" placeholder="06 12 34 56 78" />
    </div>
  `,

  3: () => `
    <div class="wizard-section-title">Conditions financières</div>
    <div class="form-row">
      <div class="form-group">
        <label>Loyer hors charges (€) *</label>
        <input type="number" id="w-loyer" value="${_wizardData.loyer || ''}" placeholder="750" min="0" step="0.01" />
      </div>
      <div class="form-group">
        <label>Charges (€)</label>
        <input type="number" id="w-charges" value="${_wizardData.charges || ''}" placeholder="50" min="0" step="0.01" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Dépôt de garantie (€)</label>
        <input type="number" id="w-depot" value="${_wizardData.depot_garantie || ''}" placeholder="750" min="0" step="0.01" />
      </div>
      <div class="form-group">
        <label>Jour d'échéance</label>
        <select id="w-echeance">
          ${[1,5,8,10,15,20].map(d =>
            `<option value="${d}" ${_wizardData.jour_echeance == d ? 'selected' : ''}>${d}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date de début *</label>
        <input type="date" id="w-date-debut" value="${_wizardData.date_debut || ''}" />
      </div>
      <div class="form-group">
        <label>Date de fin (optionnel)</label>
        <input type="date" id="w-date-fin" value="${_wizardData.date_fin || ''}" />
      </div>
    </div>
  `,

  4: () => {
    const tenant = [_wizardData.prenom_locataire, _wizardData.nom_locataire].filter(Boolean).join(' ') || '—';
    const loyer = parseFloat(_wizardData.loyer || 0);
    const charges = parseFloat(_wizardData.charges || 0);
    return `
    <div class="wizard-section-title">Confirmation</div>
    <div class="confirm-summary">
      <div class="confirm-row"><span>Adresse</span><span>${_wizardData.adresse || '—'}</span></div>
      <div class="confirm-row"><span>Type</span><span>${_wizardData.type_bail || 'Bail nu'}</span></div>
      <div class="confirm-row"><span>Locataire</span><span>${tenant}</span></div>
      <div class="confirm-row"><span>Email</span><span>${_wizardData.email_locataire || '—'}</span></div>
      <div class="confirm-row"><span>Loyer HC</span><span>${formatCurrency(loyer)}</span></div>
      <div class="confirm-row"><span>Charges</span><span>${formatCurrency(charges)}</span></div>
      <div class="confirm-row"><span>Loyer CC</span><span><strong>${formatCurrency(loyer + charges)}</strong></span></div>
      <div class="confirm-row"><span>Début</span><span>${formatDate(_wizardData.date_debut)}</span></div>
    </div>
    <p style="margin-top:16px;font-size:13px;color:var(--color-text-secondary);">
      Vérifiez les informations puis cliquez sur <strong>Créer le bail</strong>.
    </p>
  `;
  }
};

function openLeaseWizard() {
  _wizardStep = 1;
  _wizardData = {};
  renderWizardStep();
  document.getElementById('lease-wizard-overlay').classList.remove('hidden');
}

function closeLeaseWizard(event) {
  if (event && event.target !== document.getElementById('lease-wizard-overlay')) return;
  document.getElementById('lease-wizard-overlay').classList.add('hidden');
}

function renderWizardStep() {
  // Body
  const bodyEl = document.getElementById('wizard-body');
  bodyEl.innerHTML = WIZARD_STEPS_CONTENT[_wizardStep]();

  // Steps indicator
  document.querySelectorAll('.wizard-steps .step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.className = 'step';
    if (s === _wizardStep) el.classList.add('active');
    if (s < _wizardStep) el.classList.add('done');
  });

  // Buttons
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  backBtn.style.display = _wizardStep > 1 ? '' : 'none';
  nextBtn.textContent = _wizardStep === WIZARD_TOTAL_STEPS ? 'Créer le bail' : 'Suivant →';
}

function collectStepData() {
  switch (_wizardStep) {
    case 1:
      _wizardData.adresse = document.getElementById('w-adresse')?.value.trim();
      _wizardData.type_bail = document.getElementById('w-type-bail')?.value;
      _wizardData.surface = document.getElementById('w-surface')?.value;
      _wizardData.etage = document.getElementById('w-etage')?.value.trim();
      _wizardData.pieces = document.getElementById('w-pieces')?.value;
      break;
    case 2:
      _wizardData.prenom_locataire = document.getElementById('w-prenom')?.value.trim();
      _wizardData.nom_locataire = document.getElementById('w-nom')?.value.trim();
      _wizardData.email_locataire = document.getElementById('w-email')?.value.trim();
      _wizardData.tel_locataire = document.getElementById('w-tel')?.value.trim();
      break;
    case 3:
      _wizardData.loyer = document.getElementById('w-loyer')?.value;
      _wizardData.charges = document.getElementById('w-charges')?.value;
      _wizardData.depot_garantie = document.getElementById('w-depot')?.value;
      _wizardData.jour_echeance = document.getElementById('w-echeance')?.value;
      _wizardData.date_debut = document.getElementById('w-date-debut')?.value;
      _wizardData.date_fin = document.getElementById('w-date-fin')?.value || null;
      break;
  }
}

function validateStep() {
  switch (_wizardStep) {
    case 1:
      if (!document.getElementById('w-adresse')?.value.trim()) {
        showToast("L'adresse est obligatoire.", 'error');
        return false;
      }
      break;
    case 2:
      if (!document.getElementById('w-nom')?.value.trim()) {
        showToast('Le nom du locataire est obligatoire.', 'error');
        return false;
      }
      break;
    case 3:
      if (!document.getElementById('w-loyer')?.value) {
        showToast('Le loyer est obligatoire.', 'error');
        return false;
      }
      if (!document.getElementById('w-date-debut')?.value) {
        showToast('La date de début est obligatoire.', 'error');
        return false;
      }
      break;
  }
  return true;
}

async function wizardNext() {
  if (!validateStep()) return;
  collectStepData();

  if (_wizardStep < WIZARD_TOTAL_STEPS) {
    _wizardStep++;
    renderWizardStep();
  } else {
    await createLease();
  }
}

function wizardBack() {
  if (_wizardStep > 1) {
    _wizardStep--;
    renderWizardStep();
  }
}

async function createLease() {
  const nextBtn = document.getElementById('wizard-next');
  nextBtn.disabled = true;
  nextBtn.textContent = 'Enregistrement…';

  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    showToast('Session expirée. Reconnectez-vous.', 'error');
    return;
  }

  const payload = {
    user_id: session.user.id,
    adresse: _wizardData.adresse,
    type_bail: _wizardData.type_bail || 'Bail nu',
    surface: _wizardData.surface ? parseFloat(_wizardData.surface) : null,
    etage: _wizardData.etage || null,
    pieces: _wizardData.pieces ? parseInt(_wizardData.pieces) : null,
    prenom_locataire: _wizardData.prenom_locataire || null,
    nom_locataire: _wizardData.nom_locataire,
    email_locataire: _wizardData.email_locataire || null,
    tel_locataire: _wizardData.tel_locataire || null,
    loyer: parseFloat(_wizardData.loyer),
    charges: _wizardData.charges ? parseFloat(_wizardData.charges) : 0,
    depot_garantie: _wizardData.depot_garantie ? parseFloat(_wizardData.depot_garantie) : null,
    jour_echeance: _wizardData.jour_echeance ? parseInt(_wizardData.jour_echeance) : 1,
    date_debut: _wizardData.date_debut,
    date_fin: _wizardData.date_fin || null,
    statut: 'active',
  };

  const { error } = await db.from('leases').insert(payload);

  if (error) {
    console.error(error);
    showToast('Erreur lors de la création : ' + error.message, 'error');
    nextBtn.disabled = false;
    nextBtn.textContent = 'Créer le bail';
    return;
  }

  document.getElementById('lease-wizard-overlay').classList.add('hidden');
  showToast('Bail créé avec succès !', 'success');
  _wizardData = {};

  // Refresh
  loadLeases();
  loadDashboard();
}
