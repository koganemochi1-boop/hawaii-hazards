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
const status      = document.getElementById('form-status');
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
  status.textContent = '';
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
    return;
  }
  suggestions.innerHTML = results.map((r, i) => `
    <div class="suggestion-item" role="option" data-i="${i}" aria-selected="false">
      <span class="suggestion-name">${escapeHtml(primaryAddressLine(r))}</span>
      <span class="suggestion-context muted">${escapeHtml(secondaryAddressLine(r))}</span>
    </div>
  `).join('');
  suggestions.classList.remove('hidden');
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
}

function hideSuggestions() {
  suggestions.classList.add('hidden');
  suggestions.innerHTML = '';
  selectedIndex = -1;
}

function chooseResult(r) {
  if (!r) return;
  const lng = parseFloat(r.lon);
  const lat = parseFloat(r.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    status.textContent = 'Sorry, we couldn\'t place that address.';
    return;
  }
  if (!inHawaii(lng, lat)) {
    status.textContent = 'That address is outside the main Hawaiian islands. This tool covers Hawaiʻi only.';
    return;
  }
  goToReport(lng, lat, primaryAddressLine(r) + ', ' + secondaryAddressLine(r));
}

// -- Form submit fallback (if user hits Enter without picking a suggestion)

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (q.length < MIN_QUERY) {
    status.textContent = 'Type more of your address (at least 3 characters).';
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Looking up…';
  status.textContent = '';
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
      status.textContent = `We couldn't find "${q}" in Hawaiʻi. Try a sample address below or check spelling.`;
      return;
    }
    chooseResult(data[0]);
  } catch (err) {
    console.warn('Submit lookup failed:', err);
    status.textContent = 'Lookup failed. Try a sample address below.';
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
  // Nominatim's display_name is "1234, Street, Neighborhood, City, County, State, Zip, Country"
  // We want a cleaner two-line view.
  const a = r.address || {};
  const house = a.house_number ? a.house_number + ' ' : '';
  const road = a.road || a.pedestrian || a.path || '';
  if (house || road) return `${house}${road}`.trim();
  return a.suburb || a.village || a.town || a.city || r.display_name.split(',')[0];
}

function secondaryAddressLine(r) {
  const a = r.address || {};
  const parts = [a.suburb, a.village, a.town || a.city, a.county, a.state, a.postcode]
    .filter(Boolean);
  // Deduplicate consecutive duplicates (Nominatim sometimes lists suburb == village)
  const dedup = parts.filter((p, i) => p !== parts[i - 1]);
  return dedup.join(', ') || r.display_name;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
