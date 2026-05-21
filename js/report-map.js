// Supporting-map concerns for the synthesis report:
//   - bootHiddenMap()      build a MapLibre instance in an off-screen host,
//                           wait for style load, return { map, host }
//   - mountIntoSection()   move the map into the visible #map-mount,
//                           drop a marker on the address, enable hit layers,
//                           wire the layer-toggle expander
//
// Pulled out of report-app.js so the orchestrator stays focused on URL
// lifecycle + content fetch + render orchestration.

import { LayerManager } from './layers.js';

/** Minimal MapLibre style. Light, OSM-backed, attribution kept compact. */
export function lightStyle() {
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

/**
 * Build a MapLibre map in an off-screen container, wait for style load,
 * and return `{ map, layerManager, host }`.
 *
 * The hidden host pattern lets us run synthesis spatial lookups against
 * the LayerManager before the user sees a blank rendering. Once synthesis
 * is done, callers move the map into the visible mount via
 * mountIntoSection().
 *
 * @param {[number, number]} lngLat
 * @returns {Promise<{ map: any, layerManager: any, host: HTMLElement }>}
 */
export async function bootHiddenMap(lngLat) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:600px;height:400px';
  document.body.appendChild(host);

  const map = new maplibregl.Map({
    container: host,
    style: lightStyle(),
    center: lngLat,
    zoom: 14,
    minZoom: 5.5,
    maxZoom: 18,
    attributionControl: { compact: true },
  });

  if (!map.loaded()) {
    /** @type {Promise<void>} */
    const waitForLoad = new Promise((resolve, reject) => {
      let settled = false;
      const onLoad = () => { settled = true; resolve(); };
      const onError = (e) => { if (!settled) reject(e?.error || new Error('Map style failed')); };
      map.once('load', onLoad);
      map.once('error', onError);
      // Safety: if load somehow fires between the .loaded() check and the
      // listener registration, time out and proceed.
      setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 5000);
    });
    await waitForLoad;
  }

  const layerManager = new LayerManager(map);
  return { map, layerManager, host };
}

/**
 * Move the boot-time hidden map into the visible report-section mount,
 * resize, fly to the address, drop a marker, enable hit-hazard layers,
 * and wire the layer-toggle expander.
 *
 * No-op if `#map-mount` isn't in the DOM (e.g. invalid-location render).
 *
 * @param {any} map
 * @param {any} layerManager
 * @param {[number, number]} lngLat
 * @param {string | null} addr
 * @param {Array<any>} hazardSummaries
 */
export function mountIntoSection(map, layerManager, lngLat, addr, hazardSummaries) {
  const mount = document.getElementById('map-mount');
  if (!mount) return;
  mount.appendChild(map.getContainer());
  map.getContainer().style.cssText = 'width:100%;height:100%;';
  map.resize();
  map.flyTo({ center: lngLat, zoom: 14, duration: 0 });
  addAddressMarker(map, lngLat, addr);
  enableMatchedHazardLayers(layerManager, hazardSummaries);
  wireLayerToggles(layerManager, hazardSummaries);
}

/**
 * Drop a blue marker at the address with a small popup labeled with the
 * address text (or "Your address" if we don't have a label).
 *
 * @param {any} map
 * @param {[number, number]} lngLat
 * @param {string | null} addr
 */
export function addAddressMarker(map, lngLat, addr) {
  const popup = new maplibregl.Popup({ offset: 18, closeButton: false })
    .setText(addr || 'Your address');
  new maplibregl.Marker({ color: '#0a6cc1' })
    .setLngLat(lngLat)
    .setPopup(popup)
    .addTo(map);
}

/**
 * Turn on hazard polygon layers for any hazard summary with severity >
 * none (or content gap) — so the resident sees the polygons they're
 * affected by. Hazards reporting "unavailable" are skipped.
 *
 * @param {any} layerManager
 * @param {Array<any>} summaries
 */
export function enableMatchedHazardLayers(layerManager, summaries) {
  for (const s of summaries) {
    if (s.status === 'unavailable') continue;
    if (s.severity === 'none' && s.status !== 'ok_unmatched_zone') continue;
    layerManager.toggle(s.hazard.spatialKey, true);
  }
}

/**
 * Populate the "Show technical hazard layers" expander with a checkbox per
 * hazard, reflecting current visibility. Wires change-events to toggle.
 *
 * @param {any} layerManager
 * @param {Array<any>} summaries
 */
export function wireLayerToggles(layerManager, summaries) {
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
  list.querySelectorAll('input[data-hazard]').forEach(rawInput => {
    const input = /** @type {HTMLInputElement} */ (rawInput);
    input.addEventListener('change', () => {
      layerManager.toggle(input.dataset.hazard, input.checked);
    });
  });
}
