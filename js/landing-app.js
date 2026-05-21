// @ts-nocheck — DOM-typing pass deferred to a follow-up patch. tsc errors
// here are all "Element doesn't have .value/.dataset/.checked" patterns
// that need narrow type assertions on each getElementById call site.
// Tracked in ROADMAP polish backlog as "incremental tsc adoption."
//
// Landing page: address-first entry into the synthesis report.
// Typeahead via Nominatim (debounced, viewbox-bounded to Hawaiʻi).
// On selection or form submit -> navigate to report.html?lat&lng&addr.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const VIEWBOX = '-161.0,22.7,-154.4,18.5';  // left,top,right,bottom
const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;
const HAWAII_BOUNDS = [[-161.0, 18.5], [-154.4, 22.7]];

const input       = document.getElementById('address-input');
const form        = document.getElementById('address-form');
const suggestions = document.getElementById('suggestions');
const submitBtn   = document.getElementById('submit-btn');
const statusEl    = document.getElementById('form-status');
const privacy     = document.getElementById('privacy-toggle');

let typeaheadTimer = null;
let currentResults = [];
let selectedIndex  = -1;

// -- Typeahead ------------------------------------------------------------

input.addEventListener('input', () => {
  const q = input.value.trim();
  clearTimeout(typeaheadTimer);
  if (q.length < MIN_QUERY) {
    hideSuggestions();
    return;
  }
  typeaheadTimer = setTimeout(() => fetchSuggestions(q), DEBOUNCE_MS);
});

input.addEventListener('keydown', (e) => {
  if (suggestions.classList.contains('hidden')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSelection(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSelection(-1);
  } else if (e.key === 'Enter' && selectedIndex >= 0) {
    e.preventDefault();
    chooseResult(currentResults[selectedIndex]);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.address-input-wrap')) hideSuggestions();
});

async function fetchSuggestions(q) {
  statusEl.textContent = '';
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '6');
    url.searchParams.set('viewbox', VIEWBOX);
    url.searchParams.set('bounded', '1');
    const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
    const data = await res.json();
    currentResults = data;
    selectedIndex = -1;
    renderSuggestions(data, q);
  } catch (err) {
    console.warn('Geocoder failed:', err);
    suggestions.innerHTML = `<div class="suggestion-item muted">Address lookup failed. Try again or pick a sample below.</div>`;
    suggestions.classList.remove('hidden');
  }
}

function renderSuggestions(results, query) {
  if (!results.length) {
    suggestions.innerHTML = `
      <div class="suggestion-item muted">
        No matches for "${escapeHtml(query)}" in Hawaiʻi. Check spelling or try a nearby intersection.
      </div>
    `;
    suggestions.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    return;
  }
  suggestions.innerHTML = results.map((r, i) => `
    <div class="suggestion-item" role="option" id="suggestion-${i}" data-i="${i}" aria-selected="false">
      <span class="suggestion-name">${escapeHtml(primaryAddressLine(r))}</span>
      <span class="suggestion-context muted">${escapeHtml(secondaryAddressLine(r))}</span>
    </div>
  `).join('');
  suggestions.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
  suggestions.querySelectorAll('.suggestion-item').forEach((el, i) => {
    el.addEventListener('click', () => chooseResult(currentResults[i]));
    el.addEventListener('mouseenter', () => setSelection(i));
  });
}

function moveSelection(delta) {
  const n = currentResults.length;
  if (n === 0) return;
  let next = selectedIndex + delta;
  if (next < 0) next = n - 1;
  if (next >= n) next = 0;
  setSelection(next);
}

function setSelection(i) {
  selectedIndex = i;
  suggestions.querySelectorAll('.suggestion-item').forEach((el, idx) => {
    el.classList.toggle('selected', idx === i);
    el.setAttribute('aria-selected', idx === i ? 'true' : 'false');
  });
  if (i >= 0) {
    input.setAttribute('aria-activedescendant', `suggestion-${i}`);
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function hideSuggestions() {
  suggestions.classList.add('hidden');
  suggestions.innerHTML = '';
  selectedIndex = -1;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function chooseResult(r) {
  if (!r) return;
  const lng = parseFloat(r.lon);
  const lat = parseFloat(r.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    statusEl.textContent = 'Sorry, we couldn\'t place that address.';
    return;
  }
  if (!inHawaii(lng, lat)) {
    statusEl.textContent = 'That address is outside the main Hawaiian islands. This tool covers Hawaiʻi only.';
    return;
  }
  goToReport(lng, lat, primaryAddressLine(r) + ', ' + secondaryAddressLine(r));
}

// -- Form submit fallback (if user hits Enter without picking a suggestion)

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (q.length < MIN_QUERY) {
    statusEl.textContent = 'Type more of your address (at least 3 characters).';
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Looking up…';
  statusEl.textContent = '';
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('viewbox', VIEWBOX);
    url.searchParams.set('bounded', '1');
    const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
    const data = await res.json();
    if (!data.length) {
      statusEl.textContent = `We couldn't find "${q}" in Hawaiʻi. Try a sample address below or check spelling.`;
      return;
    }
    chooseResult(data[0]);
  } catch (err) {
    console.warn('Submit lookup failed:', err);
    statusEl.textContent = 'Lookup failed. Try a sample address below.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Show my report →';
  }
});

// -- Sample address cards -------------------------------------------------

document.querySelectorAll('.sample-card[data-lng]').forEach(card => {
  card.addEventListener('click', () => {
    const lng = parseFloat(card.dataset.lng);
    const lat = parseFloat(card.dataset.lat);
    const addr = card.dataset.addr || '';
    goToReport(lng, lat, addr);
  });
});

// -- Privacy toggle: scroll to section ----------------------------------

privacy.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('privacy').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// -- Helpers --------------------------------------------------------------

function goToReport(lng, lat, addr) {
  const params = new URLSearchParams();
  params.set('lat', lat.toFixed(6));
  params.set('lng', lng.toFixed(6));
  if (addr) params.set('addr', addr);
  window.location.href = `report.html?${params.toString()}`;
}

function inHawaii(lng, lat) {
  return lng > HAWAII_BOUNDS[0][0] && lng < HAWAII_BOUNDS[1][0]
      && lat > HAWAII_BOUNDS[0][1] && lat < HAWAII_BOUNDS[1][1];
}

function primaryAddressLine(r) {
  // Nominatim's display_name is "1234, Street, Neighborhood, City, County, State, Zip, Country".
  // We want a cleaner two-line view. The trickiest case: Nominatim populates
  // `house_number` but leaves `road` empty — the street is only present in
  // display_name. So fall back to splitting display_name when needed.
  const a = r.address || {};
  const house = a.house_number || '';
  const road = a.road || a.pedestrian || a.path || a.cycleway || a.footway || '';
  if (house && road) return `${house} ${road}`;
  if (road) return road;

  if (house) {
    // House number is populated but no structured road field — pull the
    // street name out of display_name (typically "<num>, <street>, ...").
    const parts = (r.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
    const i = parts.indexOf(house);
    if (i !== -1 && parts[i + 1]) return `${house} ${parts[i + 1]}`;
    return house;
  }

  return a.suburb || a.village || a.town || a.city
       || (r.display_name || '').split(',')[0].trim();
}

function secondaryAddressLine(r) {
  const a = r.address || {};
  // Build from structured fields where available. Strip country (always
  // "United States" for Hawaiʻi addresses and noisy in the title).
  const parts = [a.suburb, a.village, a.town || a.city, a.county, a.state, a.postcode]
    .filter(Boolean);
  const dedup = parts.filter((p, i) => p !== parts[i - 1]);
  if (dedup.length) return dedup.join(', ');

  // Fallback: derive from display_name minus the primary line, so we don't
  // print "Hilo Bayfront Park, Hilo Bayfront Park, ..." or "530, Paulele
  // Street, Paulele Street, ...". Match loosely on the chunks rather than a
  // strict prefix, since primaryAddressLine joins with spaces while
  // display_name uses commas.
  const primary = primaryAddressLine(r);
  const dnParts = (r.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
  const primaryTokens = new Set(primary.split(/\s+/).map(t => t.trim()).filter(Boolean));
  const remaining = dnParts.filter(p => !primaryTokens.has(p) && p !== 'United States');
  if (remaining.length) return remaining.join(', ');
  return dnParts.filter(p => p !== 'United States').join(', ');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
