// @ts-nocheck — DOM-typing pass deferred to a follow-up patch.
// Tracked in ROADMAP polish backlog as "incremental tsc adoption."
//
// Nominatim-based geocoder. Free, no key required.
// Biased to the Hawaiʻi viewbox so "Main St" finds the Hawaiian one.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const VIEWBOX = '-161.0,22.7,-154.4,18.5'; // left,top,right,bottom
const DEBOUNCE_MS = 350;

let currentMarker = null;

export function setupGeocoder(map) {
  const input = document.getElementById('geocoder-input');
  const results = document.getElementById('geocoder-results');
  let timer = null;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 3) {
      results.classList.add('hidden');
      results.innerHTML = '';
      return;
    }
    timer = setTimeout(() => doSearch(q), DEBOUNCE_MS);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-actions')) {
      results.classList.add('hidden');
    }
  });

  async function doSearch(q) {
    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set('q', q);
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '6');
      url.searchParams.set('viewbox', VIEWBOX);
      url.searchParams.set('bounded', '1');
      const res = await fetch(url.toString(), {
        headers: { 'Accept-Language': 'en' },
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      render(data);
    } catch (e) {
      results.innerHTML = `<div class="item muted">Search failed.</div>`;
      results.classList.remove('hidden');
    }
  }

  function render(items) {
    if (!items.length) {
      results.innerHTML = `<div class="item muted">No results in Hawaiʻi.</div>`;
      results.classList.remove('hidden');
      return;
    }
    results.innerHTML = items.map((it, i) =>
      `<div class="item" data-i="${i}">${escapeHtml(it.display_name)}</div>`
    ).join('');
    results.querySelectorAll('.item').forEach(el => {
      el.addEventListener('click', () => {
        const it = items[+el.dataset.i];
        const lng = parseFloat(it.lon), lat = parseFloat(it.lat);
        map.flyTo({ center: [lng, lat], zoom: 14 });
        if (currentMarker) currentMarker.remove();
        currentMarker = new maplibregl.Marker({ color: '#0a6cc1' })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup().setText(it.display_name))
          .addTo(map);
        results.classList.add('hidden');
        input.value = it.display_name;
      });
    });
    results.classList.remove('hidden');
  }
}

export function clearGeocoderMarker() {
  if (currentMarker) { currentMarker.remove(); currentMarker = null; }
}

/** Geocode one query, returning first result {lng, lat, label} or null. */
export async function geocodeOne(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('viewbox', VIEWBOX);
  url.searchParams.set('bounded', '1');
  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return {
    lng: parseFloat(data[0].lon),
    lat: parseFloat(data[0].lat),
    label: data[0].display_name,
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
