// Encode/decode active layers, view center, and zoom in the URL hash so that
// sharing a link reproduces the exact view.
//
//   #l=tsunami,lava&z=10.4&c=-157.83,21.30

import { HAZARDS } from './config.js';

const VALID_IDS = new Set(HAZARDS.map(h => h.id));

export function readHashState() {
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const params = new URLSearchParams(h);
  const layers = (params.get('l') || '').split(',').map(s => s.trim()).filter(s => VALID_IDS.has(s));
  const z = parseFloat(params.get('z') ?? '');
  const c = params.get('c');
  let center = null;
  if (c) {
    const [lng, lat] = c.split(',').map(parseFloat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) center = [lng, lat];
  }
  return {
    layers,
    zoom: Number.isFinite(z) ? z : null,
    center,
  };
}

export function writeHashState(map, layerManager) {
  const c = map.getCenter();
  const layers = [...layerManager.activeIds].join(',');
  const parts = [];
  if (layers) parts.push(`l=${layers}`);
  parts.push(`z=${map.getZoom().toFixed(2)}`);
  parts.push(`c=${c.lng.toFixed(4)},${c.lat.toFixed(4)}`);
  const hash = '#' + parts.join('&');
  // Use replaceState so each pan/zoom doesn't add to browser history
  history.replaceState(null, '', hash);
}

export function setupHashSync(map, layerManager) {
  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = setTimeout(() => writeHashState(map, layerManager), 250);
  };
  map.on('moveend', flush);
  map.on('zoomend', flush);
  layerManager.onChange(flush);
}
