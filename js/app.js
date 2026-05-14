// App bootstrap. Wires the map, layer manager, sidebar UI, and every tool.

import { HAZARDS, HAWAII_CENTER, HAWAII_DEFAULT_ZOOM, HAWAII_BOUNDS } from './config.js';
import { LayerManager } from './layers.js';
import { renderLegend } from './legend.js';
import { attachFeaturePopups } from './popup.js';
import { setupGeocoder, clearGeocoderMarker } from './search.js';
import { setupPointQuery } from './point-query.js';
import { setupDrawAnalysis } from './draw-analysis.js';
import { setupBatchCsv } from './batch-csv.js';
import { setupExport } from './export.js';
import { wireCloseButtons, hideResultPanel } from './ui-result.js';
import { readHashState, setupHashSync, writeHashState } from './url-state.js';
import { toast } from './toast.js';
import { setupMeasure } from './measure.js';

const LIGHT_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'ocean-bg', type: 'background', paint: { 'background-color': '#e6f0f7' } },
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      paint: { 'raster-opacity': 0.55, 'raster-saturation': -0.35, 'raster-contrast': -0.1 },
    },
  ],
};

const map = new maplibregl.Map({
  container: 'map',
  style: LIGHT_STYLE,
  center: HAWAII_CENTER,
  zoom: HAWAII_DEFAULT_ZOOM,
  minZoom: 5.5,
  maxZoom: 17,
  maxBounds: [[-163, 17.5], [-152, 23.5]],
  attributionControl: { compact: true },
  preserveDrawingBuffer: true,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right');

const layerManager = new LayerManager(map);

async function onMapReady() {
  const hashState = readHashState();

  // Initial view: either from URL hash, or fit to all islands
  if (hashState?.center && hashState?.zoom != null) {
    map.jumpTo({ center: hashState.center, zoom: hashState.zoom });
  } else {
    map.fitBounds(HAWAII_BOUNDS, { padding: 30, animate: false });
  }

  renderLayerList();
  layerManager.onChange((ids) => {
    renderLegend(ids);
    syncLayerCheckboxes(ids);
  });
  attachFeaturePopups(map);

  // Each setup is wrapped so a single broken module can't kill the rest of init.
  const safeRun = (name, fn) => {
    try { fn(); } catch (e) { console.error(`[init] ${name} failed:`, e); }
  };
  safeRun('setupGeocoder', () => setupGeocoder(map));
  safeRun('setupPointQuery', () => setupPointQuery(map, layerManager));
  safeRun('setupDrawAnalysis', () => setupDrawAnalysis(map, layerManager));
  safeRun('setupBatchCsv', () => setupBatchCsv(layerManager));
  safeRun('setupExport', () => setupExport(map));
  safeRun('wireCloseButtons', () => wireCloseButtons());
  safeRun('wireGlobalUiControls', () => wireGlobalUiControls());
  safeRun('setupHashSync', () => setupHashSync(map, layerManager));
  safeRun('setupMeasure', () => setupMeasure(map));

  // Preload bundled data in the background so cross-layer queries work
  // before the user explicitly turns layers on.
  layerManager.preloadBundled();

  // Restore active layers from hash, or fall back to a sensible default
  if (hashState?.layers?.length) {
    for (const id of hashState.layers) await layerManager.toggle(id, true);
  } else {
    await layerManager.toggle('tsunami', true);
  }
}

// Run onMapReady once the map is ready. Handle the case where the style
// loaded synchronously before the listener was attached.
if (map.loaded()) {
  onMapReady().catch(e => console.error('[init] onMapReady failed:', e));
} else {
  map.on('load', () => {
    onMapReady().catch(e => console.error('[init] onMapReady failed:', e));
  });
}

function syncLayerCheckboxes(activeIds) {
  document.querySelectorAll('input[data-hazard]').forEach(cb => {
    const want = activeIds.has(cb.dataset.hazard);
    if (cb.checked !== want) cb.checked = want;
  });
}

function wireGlobalUiControls() {
  // Home button
  document.getElementById('btn-home').addEventListener('click', () => {
    map.fitBounds(HAWAII_BOUNDS, { padding: 30, duration: 600 });
    clearGeocoderMarker();
  });

  // Share button — write current hash state then copy URL
  document.getElementById('btn-share').addEventListener('click', async () => {
    writeHashState(map, layerManager);
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard');
    } catch (_) {
      // Clipboard API can fail on insecure contexts or denied permission
      toast('Copy this link: ' + url, 6000);
    }
  });

  // Clear-all-layers
  document.getElementById('btn-clear-layers').addEventListener('click', async () => {
    const ids = [...layerManager.activeIds];
    for (const id of ids) await layerManager.toggle(id, false);
    toast('All layers turned off');
  });

  // Escape closes any open panel or modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('batch-panel');
    if (!modal.classList.contains('hidden')) { modal.classList.add('hidden'); return; }
    hideResultPanel();
    const geocoderResults = document.getElementById('geocoder-results');
    if (geocoderResults) geocoderResults.classList.add('hidden');
  });

  // Surface live-layer errors so the user knows when a service hiccups
  window.addEventListener('hazard-fetch-error', (e) => {
    toast(`Layer "${e.detail.name}" failed to load — retrying on next move`);
  });

  // Mobile drawer
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  let backdrop = null;
  const isNarrow = () => window.matchMedia('(max-width: 800px)').matches;
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open') && isNarrow()) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop?.remove();
        backdrop = null;
      });
      document.body.appendChild(backdrop);
    } else {
      backdrop?.remove(); backdrop = null;
    }
  });
}

function renderLayerList() {
  const container = document.getElementById('layer-list');
  container.innerHTML = HAZARDS.map(h => {
    const swatchColor = previewColor(h);
    return `
      <label class="layer-item">
        <input type="checkbox" data-hazard="${h.id}" />
        <span class="layer-swatch" style="background:${swatchColor}"></span>
        <span class="layer-name">${escapeHtml(h.name)}</span>
        <span class="layer-loading" data-layer-loading="${h.id}"></span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.hazard;
      await layerManager.toggle(id, cb.checked);
    });
  });
}

function previewColor(hazard) {
  if (hazard.styleType === 'solid-fill') return hazard.colorMap.color;
  if (hazard.styleType === 'categorical-fill') {
    const vals = Object.values(hazard.colorMap.values);
    return vals[Math.floor(vals.length / 2)];
  }
  if (hazard.styleType === 'graduated-fill') {
    const vals = Object.values(hazard.colorMap.scale);
    return vals[Math.floor(vals.length / 2)];
  }
  return '#888';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Expose for debugging
window.__app = { map, layerManager };
