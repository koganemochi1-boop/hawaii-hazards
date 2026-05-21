// Household profile capture UI.
//
//   renderProfileSection(currentProfile, onSave, onClear) -> HTMLElement
//
// The returned element is a <details> the user can expand to reveal the
// form. Saving collapses it and calls onSave(newProfile); clearing calls
// onClear() and resets the form. All form state is local to this element —
// the caller is responsible for actually persisting the profile and
// re-rendering downstream sections.

const FIELD_LAYOUT = [
  {
    id: 'household',
    label: 'About your household',
    rows: [
      {
        key: 'householdSize',
        kind: 'number',
        label: 'How many people live here?',
        min: 1, max: 20, placeholder: 'e.g. 4',
      },
      {
        key: 'ages',
        kind: 'checkboxes',
        label: 'Anyone in these age groups?',
        options: [
          ['infant',      'Infant (under 2)'],
          ['young_child', 'Young child (2–5)'],
          ['school_age',  'School-age (6–12)'],
          ['teen',        'Teen (13–17)'],
          ['adult',       'Adult (18–64)'],
          ['senior',      'Senior (65+)'],
        ],
      },
    ],
  },
  {
    id: 'pets',
    label: 'Pets',
    rows: [
      {
        key: 'pets',
        kind: 'checkboxes',
        label: 'Pets at home?',
        options: [
          ['dog',   'Dog'],
          ['cat',   'Cat'],
          ['other', 'Other (bird, reptile, livestock, etc.)'],
        ],
      },
    ],
  },
  {
    id: 'mobility',
    label: 'Mobility & medical',
    rows: [
      {
        key: 'mobility',
        kind: 'radios',
        label: 'Does anyone in your household need mobility assistance?',
        options: [
          ['none',           'No'],
          ['walking_aid',    'Uses a cane, walker, or similar'],
          ['wheelchair',     'Uses a wheelchair'],
          ['non_ambulatory', 'Non-ambulatory'],
        ],
      },
      {
        key: 'powerDependentMedical',
        kind: 'checkboxes',
        label: 'Anyone rely on electricity for medical equipment?',
        options: [
          ['oxygen',             'Oxygen concentrator'],
          ['dialysis',           'Dialysis equipment'],
          ['refrigerated_meds',  'Refrigerated medications (insulin, etc.)'],
          ['cpap',               'CPAP / BiPAP'],
        ],
        helper: 'Helps the action plan surface power-backup and registry guidance.',
      },
    ],
  },
  {
    id: 'logistics',
    label: 'Getting around',
    rows: [
      {
        key: 'vehicle',
        kind: 'radios',
        label: 'Vehicle access?',
        options: [
          ['own',    'Have my own vehicle'],
          ['shared', 'Share a vehicle / rely on others'],
          ['none',   'No reliable vehicle access'],
        ],
      },
      {
        key: 'language',
        kind: 'select',
        label: 'Preferred language',
        options: [
          ['',   '(English by default)'],
          ['en', 'English'],
          ['tl', 'Filipino'],
          ['ja', 'Japanese'],
          ['ko', 'Korean'],
          ['haw','Hawaiian'],
          ['mh', 'Marshallese'],
          ['ilo','Ilocano'],
          ['to', 'Tongan'],
          ['sm', 'Samoan'],
          ['es', 'Spanish'],
          ['other','Other'],
        ],
        helper: 'Sets up the system for translated action text. Translations are not available yet.',
      },
    ],
  },
  {
    id: 'home',
    label: 'Your home',
    rows: [
      {
        key: 'homeType',
        kind: 'radios',
        label: 'What kind of home?',
        options: [
          ['single_family', 'Single-family house'],
          ['apartment',     'Apartment'],
          ['condo',         'Condo'],
          ['multi_unit',    'Other multi-unit'],
        ],
      },
      {
        key: 'tenure',
        kind: 'radios',
        label: 'Do you rent or own?',
        options: [
          ['owner',  'Own'],
          ['renter', 'Rent'],
        ],
      },
    ],
  },
];

export function renderProfileSection(currentProfile, onSave, onClear) {
  const isActive = currentProfile && Object.keys(currentProfile).filter(k => k !== '_schemaVersion').length > 0;

  const root = document.createElement('details');
  root.className = 'profile-section report-section';
  if (!isActive) root.setAttribute('open', '');

  // -- Build innerHTML -----------------------------------------------------
  root.innerHTML = `
    <summary class="profile-summary">
      <div class="profile-summary-text">
        <span class="profile-icon" aria-hidden="true">👥</span>
        <span>
          <span class="profile-title">${isActive ? 'Your household profile' : 'Personalize this report for your household'}</span>
          <span class="profile-sub">${
            isActive
              ? '<span class="badge-personalized">Personalized</span> ' + summarizeProfile(currentProfile)
              : 'Optional. The action plan changes to fit who lives with you. Stored only on this device.'
          }</span>
        </span>
      </div>
    </summary>
    <form class="profile-form" novalidate>
      <p class="profile-privacy">
        <strong>Privacy:</strong> All fields are optional. What you enter is stored only in this
        browser, on this device. It's never sent to any server and never included in the
        share link.
      </p>
      <div class="profile-fieldsets"></div>
      <div class="profile-actions">
        <button type="submit" class="btn primary">Save and personalize</button>
        <button type="button" class="btn" data-action="forget">Forget my household details</button>
      </div>
    </form>
  `;

  const fieldsetsEl = root.querySelector('.profile-fieldsets');
  if (!fieldsetsEl) throw new Error('profile section template missing .profile-fieldsets');
  for (const group of FIELD_LAYOUT) {
    fieldsetsEl.appendChild(buildFieldset(group, currentProfile || {}));
  }

  // -- Wire submit / forget ------------------------------------------------
  const form = /** @type {HTMLFormElement | null} */ (root.querySelector('.profile-form'));
  if (!form) throw new Error('profile section template missing .profile-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const profile = collect(form);
    onSave?.(profile);
  });

  const forgetBtn = root.querySelector('[data-action="forget"]');
  if (!forgetBtn) throw new Error('profile section template missing [data-action="forget"]');
  forgetBtn.addEventListener('click', () => {
    if (!isActive && !hasAnyValue(form)) {
      // Nothing to forget; clear visible inputs and that's it.
      resetForm(form);
      return;
    }
    if (!confirm('Forget your household details? The action plan will go back to the default.')) return;
    resetForm(form);
    onClear?.();
  });

  return root;
}

// -- Internals: building fieldsets --------------------------------------

function buildFieldset(group, profile) {
  const fs = document.createElement('fieldset');
  fs.className = 'profile-fieldset';
  fs.innerHTML = `<legend>${escapeHtml(group.label)}</legend>`;
  for (const row of group.rows) {
    fs.appendChild(buildRow(row, profile));
  }
  return fs;
}

function buildRow(row, profile) {
  const wrap = document.createElement('div');
  wrap.className = `profile-row profile-row-${row.kind}`;
  wrap.dataset.field = row.key;

  const label = document.createElement('div');
  label.className = 'profile-row-label';
  label.textContent = row.label;
  wrap.appendChild(label);

  let control;
  switch (row.kind) {
    case 'number':     control = buildNumber(row, profile); break;
    case 'checkboxes': control = buildCheckboxes(row, profile); break;
    case 'radios':     control = buildRadios(row, profile); break;
    case 'select':     control = buildSelect(row, profile); break;
    default: control = document.createTextNode('');
  }
  wrap.appendChild(control);

  if (row.helper) {
    const help = document.createElement('div');
    help.className = 'profile-row-helper';
    help.textContent = row.helper;
    wrap.appendChild(help);
  }
  return wrap;
}

function buildNumber(row, profile) {
  const input = document.createElement('input');
  input.type = 'number';
  input.name = row.key;
  input.className = 'profile-input';
  if (row.min != null) input.min = row.min;
  if (row.max != null) input.max = row.max;
  if (row.placeholder) input.placeholder = row.placeholder;
  if (profile[row.key] != null) input.value = profile[row.key];
  input.setAttribute('aria-label', row.label);
  return input;
}

function buildCheckboxes(row, profile) {
  const wrap = document.createElement('div');
  wrap.className = 'profile-checkbox-group';
  const current = new Set(profile[row.key] || []);
  for (const [val, label] of row.options) {
    const id = `profile-${row.key}-${val}`;
    const labelEl = document.createElement('label');
    labelEl.className = 'profile-check-label';
    labelEl.htmlFor = id;
    labelEl.innerHTML = `<input type="checkbox" id="${escapeAttr(id)}" name="${escapeAttr(row.key)}" value="${escapeAttr(val)}" ${current.has(val) ? 'checked' : ''}> <span>${escapeHtml(label)}</span>`;
    wrap.appendChild(labelEl);
  }
  return wrap;
}

function buildRadios(row, profile) {
  const wrap = document.createElement('div');
  wrap.className = 'profile-radio-group';
  const current = profile[row.key];
  for (const [val, label] of row.options) {
    const id = `profile-${row.key}-${val}`;
    const labelEl = document.createElement('label');
    labelEl.className = 'profile-check-label';
    labelEl.htmlFor = id;
    labelEl.innerHTML = `<input type="radio" id="${escapeAttr(id)}" name="${escapeAttr(row.key)}" value="${escapeAttr(val)}" ${current === val ? 'checked' : ''}> <span>${escapeHtml(label)}</span>`;
    wrap.appendChild(labelEl);
  }
  return wrap;
}

function buildSelect(row, profile) {
  const sel = document.createElement('select');
  sel.className = 'profile-input';
  sel.name = row.key;
  sel.setAttribute('aria-label', row.label);
  const current = profile[row.key] || '';
  for (const [val, label] of row.options) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === current) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

// -- Collect form -> profile object ------------------------------------

function collect(form) {
  const profile = {};
  for (const group of FIELD_LAYOUT) {
    for (const row of group.rows) {
      const v = readField(form, row);
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'string' && v === '') continue;
      profile[row.key] = v;
    }
  }
  return profile;
}

function readField(form, row) {
  switch (row.kind) {
    case 'number': {
      const el = form.elements[row.key];
      if (!el || el.value === '') return null;
      const n = parseInt(el.value, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'checkboxes': {
      const els = form.querySelectorAll(`input[type="checkbox"][name="${cssEscape(row.key)}"]:checked`);
      return [...els].map(el => el.value);
    }
    case 'radios': {
      const el = form.querySelector(`input[type="radio"][name="${cssEscape(row.key)}"]:checked`);
      return el ? el.value : null;
    }
    case 'select': {
      const el = form.elements[row.key];
      return el?.value || null;
    }
    default: return null;
  }
}

function hasAnyValue(form) {
  for (const group of FIELD_LAYOUT) {
    for (const row of group.rows) {
      const v = readField(form, row);
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'string' && v === '') continue;
      return true;
    }
  }
  return false;
}

function resetForm(form) {
  form.reset();
  // form.reset() handles checkboxes, radios, selects, numbers.
}

// -- Summarize an active profile into a one-line label ----------------

export function summarizeProfile(profile) {
  if (!profile) return '';
  const bits = [];
  if (profile.householdSize) bits.push(`${profile.householdSize} ${profile.householdSize === 1 ? 'person' : 'people'}`);
  if (profile.ages?.length) {
    const labels = profile.ages.map(a => ({
      infant: 'infant', young_child: 'young child', school_age: 'school-age', teen: 'teen', adult: 'adult', senior: 'senior'
    }[a])).filter(Boolean);
    if (labels.length) bits.push(labels.join(', '));
  }
  if (profile.pets?.length) bits.push(profile.pets.length === 1 && profile.pets[0] !== 'other' ? profile.pets[0] : `${profile.pets.length} pet${profile.pets.length === 1 ? '' : 's'}`);
  if (profile.mobility && profile.mobility !== 'none') bits.push(({
    walking_aid: 'mobility aid', wheelchair: 'wheelchair', non_ambulatory: 'non-ambulatory'
  }[profile.mobility]) || 'mobility needs');
  if (profile.powerDependentMedical?.length) bits.push('power-dependent medical');
  if (profile.vehicle === 'none') bits.push('no vehicle');
  if (profile.homeType === 'apartment' || profile.homeType === 'condo' || profile.homeType === 'multi_unit') {
    bits.push(profile.homeType === 'apartment' ? 'apartment' : profile.homeType === 'condo' ? 'condo' : 'multi-unit');
  }
  if (profile.tenure === 'renter') bits.push('renter');
  return bits.length ? bits.join(' · ') : 'Saved';
}

// -- Helpers ----------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
function cssEscape(s) {
  return (CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
