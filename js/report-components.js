// Pure render functions for the synthesis report UI. Each returns an
// HTMLElement so the caller can decide where to mount it (and so testing
// is straightforward). No global state, no module-level side effects.

import { localized } from './synthesis.js';

const SEV_LABELS = {
  high:     'High',
  moderate: 'Moderate',
  low:      'Low',
  none:     'None',
};

const OVERALL_SUMMARY = {
  high:     'This address faces significant natural hazards. Read the details below and start your preparedness plan today.',
  moderate: 'This address has some natural hazards worth knowing. The action plan below will get you ready.',
  low:      'Most major hazards don\'t apply at this address — but everyone in Hawaiʻi should still know the basics.',
  none:     'Your address falls outside the major mapped hazard zones. Even so, every household needs an emergency plan.',
};

// -- Public components ----------------------------------------------------

export function renderAddressBar({ addr, lng, lat, onChangeAddress }) {
  const el = document.createElement('div');
  el.className = 'address-bar';
  const displayAddr = addr || `${lat.toFixed(4)}°N, ${(-lng).toFixed(4)}°W`;
  el.innerHTML = `
    <span class="pin" aria-hidden="true">📍</span>
    <span class="addr">${escapeHtml(displayAddr)}</span>
    <button type="button" class="change">Change address</button>
  `;
  if (onChangeAddress) {
    el.querySelector('.change')?.addEventListener('click', onChangeAddress);
  }
  return el;
}

export function renderOverallTile(overall, hazardSummaries) {
  const hits = hazardSummaries.filter(s => s.severity !== 'none' && s.status !== 'unavailable');
  const summary = hits.length > 0
    ? `${hitsCountSentence(hits)} ${OVERALL_SUMMARY[overall]}`
    : OVERALL_SUMMARY[overall];

  const el = document.createElement('div');
  el.className = `overall sev-${overall}`;
  el.innerHTML = `
    <div class="label">Overall risk</div>
    <div class="level">${SEV_LABELS[overall] || 'Unknown'}</div>
    <div class="summary">${escapeHtml(summary)}</div>
  `;
  return el;
}

export function renderHazardList(hazardSummaries) {
  const section = document.createElement('section');
  section.className = 'report-section';
  section.innerHTML = `<h2 class="section-title">Your hazards</h2>`;

  // Visible hazards: anything with a severity, or unavailable
  const visible = hazardSummaries.filter(s => s.severity !== 'none' || s.status === 'unavailable');
  const noneHazards = hazardSummaries.filter(s => s.severity === 'none' && s.status !== 'unavailable');

  for (const s of visible) {
    section.appendChild(renderHazardCard(s, { defaultOpen: s.severity === 'high' || s.status === 'unavailable' }));
  }

  if (noneHazards.length > 0) {
    section.appendChild(renderNotPresentGroup(noneHazards));
  }

  return section;
}

function renderHazardCard(summary, { defaultOpen = false } = {}) {
  const card = document.createElement('details');
  card.className = 'hazard-card';
  if (defaultOpen) card.setAttribute('open', '');

  const isUnavail = summary.status === 'unavailable';
  const sevClass = isUnavail ? 'sev-unavail' : `sev-${summary.severity}`;
  const sevLabel = isUnavail ? 'Unavailable' : SEV_LABELS[summary.severity];

  const zoneLabel = isUnavail
    ? `Couldn't check this hazard right now`
    : localized(summary.zone?.label) || '—';
  const oneLiner = isUnavail
    ? `The hazard data service for ${summary.hazard.displayName} didn't respond. Try again in a minute.`
    : localized(summary.zone?.oneLiner) || '';

  const summaryRow = `
    <summary>
      <span class="sev-pill ${sevClass}" aria-hidden="true">${escapeHtml(sevLabel)}</span>
      <span class="sr-only">Severity: ${escapeHtml(sevLabel)}.</span>
      <span class="hazard-text">
        <div class="hazard-name">${escapeHtml(summary.hazard.displayName)}</div>
        <div class="hazard-oneliner">${escapeHtml(oneLiner)}</div>
      </span>
    </summary>
  `;

  let body = `<div class="body">`;
  if (isUnavail) {
    body += `<p class="muted">${escapeHtml(summary.error || 'Unknown error.')}</p>`;
  } else {
    const z = summary.zone;
    body += `<p>${escapeHtml(localized(z?.plainExplanation) || '')}</p>`;
    const prob = localized(z?.probabilityFraming);
    if (prob) {
      body += `<p class="muted"><strong>How often?</strong> ${escapeHtml(prob)}</p>`;
    }
    if (z?.technicalCode) {
      body += `
        <div class="label-pair">
          <span class="k">Zone code:</span>
          <span>${escapeHtml(z.technicalCode)}</span>
        </div>
      `;
    }
    body += `<div class="label-pair"><span class="k">Risk level:</span><span>${escapeHtml(zoneLabel)}</span></div>`;

    const sources = summary.hazard.authoritativeSources || [];
    if (sources.length) {
      body += `<div class="sources"><strong>Learn more:</strong> ` +
        sources.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`).join(' · ') +
        `</div>`;
    }
  }
  body += `</div>`;

  card.innerHTML = summaryRow + body;
  return card;
}

function renderNotPresentGroup(noneHazards) {
  const group = document.createElement('details');
  group.className = 'hazard-card collapsed-group';
  const names = noneHazards.map(s => s.hazard.shortName).join(', ');
  group.innerHTML = `
    <summary>
      <span class="sev-pill sev-none" aria-hidden="true">None</span>
      <span class="sr-only">Severity: none.</span>
      <span class="hazard-text">
        <div class="hazard-name">Not present: ${escapeHtml(names)}</div>
        <div class="hazard-oneliner">These hazards don't apply at this address.</div>
      </span>
    </summary>
    <div class="body">
      ${noneHazards.map(s => `
        <div class="label-pair">
          <span class="k">${escapeHtml(s.hazard.shortName)}:</span>
          <span>${escapeHtml(localized(s.zone?.label) || 'Not in zone')}</span>
        </div>
      `).join('')}
    </div>
  `;
  return group;
}

// -- Action plan ----------------------------------------------------------

const HORIZON_LABELS = {
  right_now:  'Right now',
  this_week:  'This week',
  this_month: 'This month / ongoing',
};

export function renderActionPlan(plan) {
  const section = document.createElement('section');
  section.className = 'report-section';
  section.innerHTML = `
    <h2 class="section-title">Your preparedness plan</h2>
    <p class="muted" style="margin-top:-4px;margin-bottom:16px">
      A deduplicated checklist tailored to the hazards above. Each action shows which hazards it addresses.
    </p>
  `;

  let hasAny = false;
  for (const key of ['right_now', 'this_week', 'this_month']) {
    const items = plan[key] || [];
    if (items.length === 0) continue;
    hasAny = true;
    section.appendChild(renderHorizonGroup(key, items));
  }
  if (!hasAny) {
    section.insertAdjacentHTML('beforeend', '<p class="muted">No preparedness actions specifically tagged for this address.</p>');
  }
  return section;
}

function renderHorizonGroup(horizonKey, items) {
  const group = document.createElement('div');
  group.className = 'horizon-group';
  group.innerHTML = `<h3>${escapeHtml(HORIZON_LABELS[horizonKey])} <span class="count">${items.length}</span></h3>`;
  for (const entry of items) {
    group.appendChild(renderActionItem(entry));
  }
  return group;
}

function renderActionItem(entry) {
  const { action, hazards, matchedRequirements } = entry;
  const item = document.createElement('div');
  item.className = 'action-item' + (matchedRequirements ? ' personalized' : '');

  const hazardBadges = [...hazards].map(h => `<span class="badge">${escapeHtml(h)}</span>`).join(' ');
  const sources = (action.sources || [])
    .map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`)
    .join(' · ');

  // The personalized badge tells the resident "this action surfaced because of
  // your household profile" so they can audit why something appeared.
  const personalizedBadge = matchedRequirements
    ? `<span class="personalized-badge" title="This action is here because of your household profile.">For your household</span>`
    : '';

  item.innerHTML = `
    <input type="checkbox" aria-label="${escapeHtml(localized(action.title))}" />
    <div>
      <div class="title">${escapeHtml(localized(action.title))} ${personalizedBadge}</div>
      <div class="description">${escapeHtml(localized(action.description))}</div>
      <div class="meta">
        ${hazardBadges}
        ${action.estimatedTime ? `<span class="time">· ${escapeHtml(action.estimatedTime)}</span>` : ''}
      </div>
      ${sources ? `<div class="sources">Source: ${sources}</div>` : ''}
    </div>
  `;
  return item;
}

// -- Supporting map -------------------------------------------------------

export function renderMapSection() {
  const section = document.createElement('section');
  section.className = 'report-section';
  section.innerHTML = `
    <h2 class="section-title">Your location on the map</h2>
    <div id="map-mount" class="map-mount"></div>
    <details class="map-toggle-bar">
      <summary>Show technical hazard layers</summary>
      <div class="map-toggle-list" id="map-toggle-list"></div>
    </details>
  `;
  return section;
}

// -- Report actions bar (print / pdf / share) ---------------------------

export function renderReportActions({ onPrint, onShare }) {
  const el = document.createElement('div');
  el.className = 'report-actions';
  el.innerHTML = `
    <button class="btn primary" data-act="print">Print / Save as PDF</button>
    <button class="btn" data-act="share">Copy link</button>
  `;
  el.querySelector('[data-act="print"]')?.addEventListener('click', onPrint);
  el.querySelector('[data-act="share"]')?.addEventListener('click', onShare);
  return el;
}

// -- Error / empty / not-in-hawaii states -------------------------------

export function renderInvalidLocation(message) {
  const el = document.createElement('section');
  el.className = 'report-section';
  el.innerHTML = `
    <h2 class="section-title">Couldn't generate a report</h2>
    <p>${escapeHtml(message)}</p>
    <p class="muted">Try one of the sample addresses in the footer, or check that the address is in Hawaiʻi.</p>
  `;
  return el;
}

// -- Helpers --------------------------------------------------------------

function hitsCountSentence(hits) {
  const n = hits.length;
  const word = n === 1 ? 'hazard' : 'hazards';
  return `${n} ${word} apply at this address.`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
