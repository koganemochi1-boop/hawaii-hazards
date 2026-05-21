// @ts-nocheck — 4 DOM-typing errors on .dataset access. Pass deferred to
// a follow-up patch. Tracked in ROADMAP polish backlog as "incremental
// tsc adoption."
//
// Layer manager: loads bundled GeoJSON, queries live ArcGIS REST services,
// adds/removes MapLibre sources & layers, and handles bbox-based refetching.

import { HAZARDS } from './config.js';

const FILL_LAYER = (id) => `${id}-fill`;
const LINE_LAYER = (id) => `${id}-line`;

const featureCache = new Map(); // For live layers: cache of fetched features by bbox key

export class LayerManager {
  constructor(map) {
    this.map = map;
    this.activeIds = new Set();
    this.bundledData = new Map(); // hazardId -> FeatureCollection
    this.liveData = new Map();    // hazardId -> FeatureCollection
    this.onChangeCallbacks = [];
    this._wireMapEvents();
  }

  onChange(cb) { this.onChangeCallbacks.push(cb); }
  _fireChange() { this.onChangeCallbacks.forEach(cb => cb(this.activeIds)); }

  _wireMapEvents() {
    let timer = null;
    this.map.on('moveend', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this._refreshLiveLayers(), 220);
    });
  }

  async toggle(hazardId, on) {
    const hazard = HAZARDS.find(h => h.id === hazardId);
    if (!hazard) return;

    if (on) {
      this.activeIds.add(hazardId);
      await this._ensureLoaded(hazard);
      this._setVisibility(hazard, true);
    } else {
      this.activeIds.delete(hazardId);
      this._setVisibility(hazard, false);
    }
    this._fireChange();
  }

  isActive(hazardId) { return this.activeIds.has(hazardId); }

  async _ensureLoaded(hazard) {
    const sourceId = hazard.id;
    if (this.map.getSource(sourceId)) {
      // Already added; possibly need a refetch for live
      if (hazard.sourceType === 'live') await this._fetchLive(hazard);
      return;
    }

    let data;
    if (hazard.sourceType === 'bundled') {
      data = await this._loadBundled(hazard);
    } else {
      data = { type: 'FeatureCollection', features: [] };
    }

    this.map.addSource(sourceId, { type: 'geojson', data });
    this._addPaintLayers(hazard);

    if (hazard.sourceType === 'live') {
      await this._fetchLive(hazard);
    }
  }

  async _loadBundled(hazard) {
    if (this.bundledData.has(hazard.id)) return this.bundledData.get(hazard.id);
    // Resolve bundled paths against this module's own URL so they work no
    // matter which page is calling (root index.html, /dev/ harness, etc.).
    const url = new URL(hazard.url, import.meta.url).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    const data = await res.json();
    this.bundledData.set(hazard.id, data);
    this._updateCounter(hazard.id, data.features?.length || 0);
    return data;
  }

  _addPaintLayers(hazard) {
    const fillPaint = this._buildFillPaint(hazard);

    const layerSpec = {
      id: FILL_LAYER(hazard.id),
      type: 'fill',
      source: hazard.id,
      layout: { visibility: 'none' },
      paint: fillPaint,
    };
    if (hazard.renderFilter) layerSpec.filter = hazard.renderFilter;

    this.map.addLayer(layerSpec);

    const lineSpec = {
      id: LINE_LAYER(hazard.id),
      type: 'line',
      source: hazard.id,
      layout: { visibility: 'none' },
      paint: {
        'line-color': 'rgba(0,0,0,0.45)',
        'line-width': 0.5,
      },
    };
    if (hazard.renderFilter) lineSpec.filter = hazard.renderFilter;

    this.map.addLayer(lineSpec);
  }

  _buildFillPaint(hazard) {
    const cm = hazard.colorMap;
    const opacity = hazard.fillOpacity ?? 0.4;

    if (hazard.styleType === 'solid-fill') {
      return { 'fill-color': cm.color, 'fill-opacity': opacity };
    }

    if (hazard.styleType === 'categorical-fill') {
      // Build a match expression. Keys must be strings.
      const matchExpr = ['match', ['coalesce', ['get', cm.field], ''], ];
      for (const [k, v] of Object.entries(cm.values)) {
        matchExpr.push(k, v);
      }
      matchExpr.push(cm.fallback);
      return { 'fill-color': matchExpr, 'fill-opacity': opacity };
    }

    if (hazard.styleType === 'graduated-fill') {
      const matchExpr = ['match', ['to-string', ['coalesce', ['get', cm.field], '']]];
      for (const [k, v] of Object.entries(cm.scale)) {
        matchExpr.push(k, v);
      }
      matchExpr.push(cm.fallback);
      return { 'fill-color': matchExpr, 'fill-opacity': opacity };
    }

    return { 'fill-color': '#888', 'fill-opacity': opacity };
  }

  _setVisibility(hazard, visible) {
    const vis = visible ? 'visible' : 'none';
    if (this.map.getLayer(FILL_LAYER(hazard.id))) {
      this.map.setLayoutProperty(FILL_LAYER(hazard.id), 'visibility', vis);
      this.map.setLayoutProperty(LINE_LAYER(hazard.id), 'visibility', vis);
    }
  }

  async _refreshLiveLayers() {
    for (const id of this.activeIds) {
      const hazard = HAZARDS.find(h => h.id === id);
      if (hazard?.sourceType === 'live') {
        await this._fetchLive(hazard);
      }
    }
  }

  async _fetchLive(hazard) {
    const zoom = this.map.getZoom();
    if (hazard.minZoom && zoom < hazard.minZoom) {
      // Clear data when zoomed out too far
      const src = this.map.getSource(hazard.id);
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
      this.liveData.set(hazard.id, { type: 'FeatureCollection', features: [] });
      this._setZoomHint(hazard, true);
      return;
    }
    this._setZoomHint(hazard, false);

    const bounds = this.map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];

    const cacheKey = `${hazard.id}@${bbox.map(n => n.toFixed(3)).join(',')}`;
    if (featureCache.has(cacheKey)) {
      const cached = featureCache.get(cacheKey);
      this._applyLiveData(hazard, cached);
      return;
    }

    this._setLoading(hazard.id, true);
    try {
      const fc = await queryArcGISLayer(hazard, bbox);
      featureCache.set(cacheKey, fc);
      this._applyLiveData(hazard, fc);
    } catch (err) {
      console.warn(`Live layer ${hazard.id} fetch failed:`, err);
      window.dispatchEvent(new CustomEvent('hazard-fetch-error', {
        detail: { id: hazard.id, name: hazard.name, error: err.message },
      }));
    } finally {
      this._setLoading(hazard.id, false);
    }
  }

  _applyLiveData(hazard, fc) {
    this.liveData.set(hazard.id, fc);
    const src = this.map.getSource(hazard.id);
    if (src) src.setData(fc);
    this._updateCounter(hazard.id, fc.features?.length || 0);
  }

  _updateCounter(id, n) {
    const el = document.querySelector(`[data-layer-count="${id}"]`);
    if (!el) return;
    el.textContent = n > 0 ? String(n) : '';
  }

  /** Total features for a hazard currently loaded in its source. */
  featureCount(hazardId) {
    const src = this.map.getSource(hazardId);
    return src?._data?.features?.length || 0;
  }

  _setLoading(id, loading) {
    const el = document.querySelector(`[data-layer-loading="${id}"]`);
    if (el && !el.dataset.zoomHint) {
      el.textContent = loading ? 'loading…' : '';
    }
  }

  _setZoomHint(hazard, needsZoom) {
    const el = document.querySelector(`[data-layer-loading="${hazard.id}"]`);
    if (!el) return;
    if (needsZoom) {
      el.textContent = `zoom in (≥${hazard.minZoom})`;
      el.dataset.zoomHint = '1';
    } else if (el.dataset.zoomHint) {
      el.textContent = '';
      delete el.dataset.zoomHint;
    }
  }

  /**
   * Get ALL features for a hazard within an envelope. For bundled, scan local;
   * for live, query the service directly without affecting map state.
   * Used for point queries, draw analysis, and batch CSV scoring.
   */
  async getFeaturesIntersecting(hazardId, bbox) {
    const hazard = HAZARDS.find(h => h.id === hazardId);
    if (!hazard) return [];

    if (hazard.sourceType === 'bundled') {
      const fc = this.bundledData.get(hazard.id) || await this._loadBundled(hazard);
      // Coarse filter by bbox before the precise point/polygon test downstream
      return fc.features.filter(f => featureBboxIntersects(f, bbox));
    }

    // live: query directly
    const fc = await queryArcGISLayer(hazard, bbox);
    return fc.features;
  }

  async preloadBundled() {
    // Pre-fetch the bundled datasets so subsequent point queries against
    // turned-off layers still work for "what's at this location?".
    for (const h of HAZARDS.filter(h => h.sourceType === 'bundled')) {
      try { await this._loadBundled(h); } catch (e) { console.warn('preload', h.id, e); }
    }
  }
}

// -- ArcGIS REST querying ------------------------------------------------

async function queryArcGISLayer(hazard, bbox) {
  const url = new URL(`${hazard.url}/query`);
  // Server-side geometry simplification: degrees per pixel at the bbox's
  // smaller dimension, so render fidelity stays good while keeping payloads
  // small. Without this, the Hawaiʻi SLR layer returns 500 on Big Island
  // bboxes because its un-simplified coastline geometry is huge.
  const span = Math.min(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  const offset = Math.max(span / 1024, 0.00002); // ~2m floor

  const params = {
    where: '1=1',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    outFields: hazard.queryFields || '*',
    returnGeometry: 'true',
    maxAllowableOffset: String(offset),
    f: 'geojson',
  };
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`ArcGIS query failed: ${res.status}`);
  const data = await res.json();

  if (!data.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  return data;
}

function featureBboxIntersects(feature, bbox) {
  // bbox: [west, south, east, north]
  const fb = turf.bbox(feature);
  return !(fb[2] < bbox[0] || fb[0] > bbox[2] || fb[3] < bbox[1] || fb[1] > bbox[3]);
}
