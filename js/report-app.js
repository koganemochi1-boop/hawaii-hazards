// Entry point for the synthesis report. Reads ?lat&lng&addr from the URL,
// loads content, runs synthesize(), and mounts the report components.
// Also boots a small supporting map centered on the address.

import { LayerManager } from './layers.js';
import { synthesize } from './synthesis.js';
import {
  renderAddressBar,
  renderOverallTile,
  renderHazardList,
  renderActionPlan,
  renderMapSection,
  renderReportActions,
  renderInvalidLocation,
} from './report-components.js';

const HAWAII_BOUNDS = [[-161.0, 18.5], [-154.4, 22.7]];

const reportEl = document.getElementById('report');

bootstrap().catch(err => {
  console.error('[report] fatal:', err);
  reportEl.innerHTML = '';
  reportEl.appendChild(renderInvalidLocation(
    'Something went wrong loading the hazard data. Reload to try again.'
  ));
});

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const lng = parseFloat(params.get('lng'));
  const lat = parseFloat(params.get('lat'));
  const addr = params.get('addr');

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return showLanding();
  }
  if (!inHawaii(lng, lat)) {
    reportEl.innerHTML = '';
    reportEl.appendChild(renderAddressBar({ addr, lng, lat, onChangeAddress: showLanding }));
    reportEl.appendChild(renderInvalidLocation(
      `That location is outside the main Hawaiian islands. This tool covers Hawaiʻi only.`
    ));
    return;
  }

  // Mount header pieces immediately so the page doesn't feel blank.
  reportEl.innerHTML = '';
  reportEl.appendChild(renderAddressBar({ addr, lng, lat, onChangeAddress: showLanding }));

  const status = document.createElement('p');
  status.className = 'muted';
  status.textContent = 'Looking up hazard data for this location…';
  reportEl.appendChild(status);

  // Boot the supporting map (hidden until ready) and use its LayerManager
  // for the synthesis spatial lookups.
  const mapHost = document.createElement('div');
  mapHost.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:600px;height:400px';
  document.body.appendChild(mapHost);

  const map = new maplibregl.Map({
    container: mapHost,
    style: lightStyle(),
    center: [lng, lat],
    zoom: 14,
    minZoom: 5.5,
    maxZoom: 18,
    attributionControl: { compact: true },
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    map.once('load', () => { settled = true; resolve(); });
    map.once('error', (e) => { if (!settled) reject(e?.error || new Error('Map style failed')); });
  });

  const layerManager = new LayerManager(map);

  // Load content. Cache-busting the fetch keeps content edits visible
  // during draft authoring; we'll switch to immutable URLs once content
  // is reviewed and frozen.
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
  const content = { hazards: hazardsDoc.hazards, actions: actionsDoc.actions };

  // Run synthesis.
  const t0 = performance.now();
  const result = await synthesize([lng, lat], layerManager, content);
  const elapsedMs = Math.round(performance.now() - t0);
  console.log('[report] synthesis took', elapsedMs, 'ms', result);

  // Render the report.
  status.remove();
  reportEl.appendChild(renderReportActions({
    onPrint: () => window.print(),
    onShare: () => shareCurrentLink(),
  }));
  reportEl.appendChild(renderOverallTile(result.overall, result.hazardSummaries));
  reportEl.appendChild(renderHazardList(result.hazardSummaries));
  reportEl.appendChild(renderActionPlan(result.plan));
  reportEl.appendChild(renderMapSection());

  // Move the map into the visible mount and reveal it.
  const mount = document.getElementById('map-mount');
  if (mount) {
    mount.appendChild(map.getContainer());
    map.getContainer().style.cssText = 'width:100%;height:100%;';
    map.resize();
    map.flyTo({ center: [lng, lat], zoom: 14, duration: 0 });
    addAddressMarker(map, [lng, lat], addr);
    enableMatchedHazardLayers(map, layerManager, result.hazardSummaries);
    wireLayerToggles(layerManager, result.hazardSummaries);
  }

  wireSampleAddresses();
}

// -- Map helpers ----------------------------------------------------------

function lightStyle() {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#e6f0f7' } },
      {
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm',
        paint: { 'raster-opacity': 0.6, 'raster-saturation': -0.35 },
      },
    ],
  };
}

function addAddressMarker(map, lngLat, addr) {
  const popup = new maplibregl.Popup({ offset: 18, closeButton: false })
    .setText(addr || 'Your address');
  new maplibregl.Marker({ color: '#0a6cc1' })
    .setLngLat(lngLat)
    .setPopup(popup)
    .addTo(map);
}

function enableMatchedHazardLayers(map, layerManager, summaries) {
  // Turn on layers for any hazard with severity > none (or content gap),
  // so the resident sees the polygons they're affected by. We keep the v1
  // categorical colors for the supporting view; severity-color theming is
  // a later patch.
  for (const s of summaries) {
    if (s.status === 'unavailable') continue;
    if (s.severity === 'none' && s.status !== 'ok_unmatched_zone') continue;
    layerManager.toggle(s.hazard.spatialKey, true);
  }
}

function wireLayerToggles(layerManager, summaries) {
  const list = document.getElementById('map-toggle-list');
  if (!list) return;
  for (const s of summaries) {
    const cb = document.createElement('label');
    const isOn = layerManager.isActive(s.hazard.spatialKey);
    cb.innerHTML = `
      <input type="checkbox" data-hazard="${s.hazard.spatialKey}" ${isOn ? 'checked' : ''} />
      <span>${s.hazard.displayName}</span>
    `;
    list.appendChild(cb);
  }
  list.querySelectorAll('input[data-hazard]').forEach(input => {
    input.addEventListener('change', () => {
      layerManager.toggle(input.dataset.hazard, input.checked);
    });
  });
}

// -- Address handling -----------------------------------------------------

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
  document.querySelectorAll('#app-footer .sample[data-lng]').forEach(a => {
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

function toast(msg, ms = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
