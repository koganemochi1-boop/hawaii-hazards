// Entry point for the synthesis report. Reads ?lat&lng&addr from the URL,
// fetches content, runs synthesize(), and mounts the report sections.
//
// The orchestration is split into small named steps below — each is
// responsible for one phase and named after its phase. The bootstrap()
// function calls them in order. Pull each phase into its own module if
// it grows further.

import { synthesize } from './synthesis.js';
import { loadProfile, saveProfile, clearProfile } from './profile.js';
import {
  renderAddressBar,
  renderOverallTile,
  renderHazardList,
  renderActionPlan,
  renderMapSection,
  renderReportActions,
  renderInvalidLocation,
} from './report-components.js';
import { renderProfileSection } from './report-profile-ui.js';
import { bootHiddenMap, mountIntoSection } from './report-map.js';
import { mustGet$ } from './dom-helpers.js';

const HAWAII_BOUNDS = [[-161.0, 18.5], [-154.4, 22.7]];
const reportEl = mustGet$('report');

bootstrap().catch(err => {
  console.error('[report] fatal:', err);
  resetReport();
  reportEl.appendChild(renderInvalidLocation(
    'Something went wrong loading the hazard data. Reload to try again.'
  ));
});

// =====================================================================
//   Top-level orchestration
// =====================================================================

async function bootstrap() {
  const params = readUrlParams();
  if (!params) return showLanding();

  const { lng, lat, addr } = params;
  if (!inHawaii(lng, lat)) {
    return renderOutOfHawaii(addr, lng, lat);
  }

  updatePageHeading(addr, lng, lat);

  // Mount header pieces immediately so the page doesn't feel blank.
  resetReport();
  reportEl.appendChild(renderAddressBar({ addr, lng, lat, onChangeAddress: showLanding }));
  const status = mountLoadingStatus();

  // Run boot-time work in parallel: hidden map (waits for style) and
  // content fetch. Both must complete before we can call synthesize().
  const [{ map, layerManager }, content] = await Promise.all([
    bootHiddenMap([lng, lat]),
    fetchContent(),
  ]);

  const result = await runSynthesis([lng, lat], layerManager, content);
  status.remove();

  renderReport({ lng, lat, addr, content, layerManager, map, result });
  mountIntoSection(map, layerManager, [lng, lat], addr, result.hazardSummaries);
  wireSampleAddresses();
}

// =====================================================================
//   Phase functions
// =====================================================================

/**
 * Read ?lat&lng&addr from window.location. Returns null if lat/lng are
 * missing or unparseable (in which case the caller should show landing).
 *
 * @returns {{lng:number, lat:number, addr:string|null} | null}
 */
function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const lng = parseFloat(params.get('lng') ?? '');
  const lat = parseFloat(params.get('lat') ?? '');
  const addr = params.get('addr');
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat, addr };
}

/** Reset the report region but keep the H1 (for screen readers + outline). */
function resetReport() {
  const h1 = document.getElementById('report-h1');
  reportEl.innerHTML = '';
  if (h1) reportEl.appendChild(h1);
}

/** Update the H1 and document title to reflect the current address. */
function updatePageHeading(addr, lng, lat) {
  const h1 = document.getElementById('report-h1');
  const heading = addr
    ? `Hazard report for ${addr}`
    : `Hazard report for ${lat.toFixed(4)}°N, ${(-lng).toFixed(4)}°W`;
  if (h1) h1.textContent = heading;
  document.title = addr
    ? `${addr} — Hawaiʻi Hazards & Preparedness`
    : `Hazard report — Hawaiʻi Hazards & Preparedness`;
}

/** Show a friendly "outside Hawaiʻi" rejection page. */
function renderOutOfHawaii(addr, lng, lat) {
  resetReport();
  reportEl.appendChild(renderAddressBar({ addr, lng, lat, onChangeAddress: showLanding }));
  reportEl.appendChild(renderInvalidLocation(
    `That location is outside the main Hawaiian islands. This tool covers Hawaiʻi only.`
  ));
}

/** Mount a transient "looking up…" status under the address bar. */
function mountLoadingStatus() {
  const status = document.createElement('p');
  status.className = 'muted';
  status.textContent = 'Looking up hazard data for this location…';
  reportEl.appendChild(status);
  return status;
}

/**
 * Fetch hazards.json + actions.json. Cache-busts so content edits are
 * visible during the draft phase; switch to immutable URLs once
 * partner-reviewed.
 *
 * @returns {Promise<{ hazards: Array<any>, actions: Array<any> }>}
 */
async function fetchContent() {
  const v = Date.now();
  const [hazResp, actResp] = await Promise.all([
    fetch(`./content/hazards.json?v=${v}`),
    fetch(`./content/actions.json?v=${v}`),
  ]);
  if (!hazResp.ok || !actResp.ok) {
    throw new Error('Failed to load content files');
  }
  const hazardsDoc = await hazResp.json();
  const actionsDoc = await actResp.json();
  return { hazards: hazardsDoc.hazards, actions: actionsDoc.actions };
}

/** Run the synthesis engine with the saved household profile (or null). */
async function runSynthesis(lngLat, layerManager, content) {
  const t0 = performance.now();
  const result = await synthesize(lngLat, layerManager, content, { profile: loadProfile() });
  const elapsedMs = Math.round(performance.now() - t0);
  console.log('[report] synthesis took', elapsedMs, 'ms', result);
  return result;
}

/**
 * Render every report section (actions bar, overall tile, hazard cards,
 * profile section, action plan, supporting-map placeholder). Sets up the
 * profile-change rerun cycle that swaps the plan + profile section in
 * place without re-rendering the rest of the page.
 *
 * @param {{
 *   lng:number, lat:number, addr:string|null,
 *   content:{hazards:Array<any>, actions:Array<any>},
 *   layerManager:any, map:any,
 *   result:any
 * }} ctx
 */
function renderReport(ctx) {
  const { lng, lat, content, layerManager, result } = ctx;

  reportEl.appendChild(renderReportActions({
    onPrint: () => window.print(),
    onShare: () => shareCurrentLink(),
  }));
  reportEl.appendChild(renderOverallTile(result.overall, result.hazardSummaries));
  reportEl.appendChild(renderHazardList(result.hazardSummaries));

  // Profile capture sits above the action plan. We keep mutable holders so
  // a "save profile" cycle can swap the live DOM nodes for new ones without
  // re-rendering the rest of the report.
  let currentProfileSection = makeProfileSection(loadProfile(), rerunPlan);
  reportEl.appendChild(currentProfileSection);

  let planEl = renderActionPlan(result.plan);
  reportEl.appendChild(planEl);

  reportEl.appendChild(renderMapSection());

  async function rerunPlan(profile) {
    const fresh = await synthesize([lng, lat], layerManager, content, { profile });

    const newPlanEl = renderActionPlan(fresh.plan);
    planEl.replaceWith(newPlanEl);
    planEl = newPlanEl;

    const newProfileSection = makeProfileSection(profile, rerunPlan);
    currentProfileSection.replaceWith(newProfileSection);
    currentProfileSection = newProfileSection;

    toast(profile ? 'Plan updated for your household' : 'Personalization cleared');
  }
}

/**
 * Build a profile section element with onSave/onClear wired to a
 * caller-provided rerun function. Saving persists to localStorage and
 * triggers `rerun(newProfile)`; forgetting clears storage and triggers
 * `rerun(null)`.
 */
function makeProfileSection(profile, rerun) {
  return renderProfileSection(
    profile,
    async (newProfile) => { saveProfile(newProfile); await rerun(newProfile); },
    async () => { clearProfile(); await rerun(null); }
  );
}

// =====================================================================
//   Small helpers (URL routing, geofence, share, toast)
// =====================================================================

function inHawaii(lng, lat) {
  return lng > HAWAII_BOUNDS[0][0] && lng < HAWAII_BOUNDS[1][0]
      && lat > HAWAII_BOUNDS[0][1] && lat < HAWAII_BOUNDS[1][1];
}

function showLanding() {
  // Navigate to the landing page (which IS index.html). Anything still in
  // the report URL is dropped.
  window.location.href = './';
}

function wireSampleAddresses() {
  document.querySelectorAll('#app-footer .sample[data-lng]').forEach(rawA => {
    const a = /** @type {HTMLElement} */ (rawA);
    if (a.dataset.wired) return;
    a.dataset.wired = '1';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const lng = a.dataset.lng;
      const lat = a.dataset.lat;
      const addr = encodeURIComponent(a.dataset.addr || '');
      window.location.href = `report.html?lat=${lat}&lng=${lng}&addr=${addr}`;
    });
    a.style.cursor = 'pointer';
  });
}

function shareCurrentLink() {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('Link copied to clipboard'));
  } else {
    toast('Copy this link: ' + url, 6000);
  }
}

/**
 * Ad-hoc floating toast. Creates a div, fades it after `ms`. The shared
 * `js/toast.js` helper requires a fixed #toast element; the report page
 * doesn't have one, so we create them on demand.
 */
function toast(msg, ms = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
