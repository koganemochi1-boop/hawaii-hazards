# Notes for Claude

Single-page MapLibre app for browsing Hawaiʻi natural hazards. No build step, ES modules served as static files. Designed to deploy to GitHub Pages.

## Architecture at a glance

- `js/config.js` — single source of truth for hazard layers. Each entry defines the source, rendering, popup, legend, and risk-scoring function. Add a layer here and the rest of the app picks it up automatically.
- `js/layers.js` — `LayerManager` class. Adds/removes MapLibre sources & paint layers, queries live ArcGIS REST services by viewport bbox (debounced 220 ms on `moveend`), caches responses by bbox key, and exposes `getFeaturesIntersecting(id, bbox)` for cross-layer analysis (used by point query, draw, batch CSV).
- `js/risk.js` — `scorePoint(lngLat, layerManager)` and `scorePolygon(polygon, layerManager)`. Composite weighted scoring across all hazards; output bucketed via `RISK_BUCKETS`.
- `js/app.js` — boot. `onMapReady()` is invoked either via `map.on('load')` or directly if the style is already loaded. Each `setup*` call is wrapped in a `safeRun` try/catch so a single broken module doesn't kill the rest.

## Key decisions worth knowing

- **Hybrid data strategy.** Small/static datasets (tsunami evac, lava zones, volcano boundaries) bundled in `/data` as GeoJSON. Large/changing datasets (FEMA DFIRM, fire risk, SLR + coastal flood) queried live from ArcGIS REST.
- **Hurricane SLOSH isn't published as vector data for Hawaiʻi.** The "1% coastal flood + 3.2 ft SLR" layer (Hazards/MapServer/15) is used as the de facto coastal storm hazard proxy. Tsunami evac zones double as the practical coastal evacuation framework. Documented in README.
- **State DFIRM is large (~16k features).** Only queried at zoom ≥ 10 to keep things responsive. Other live layers query statewide.
- **Tsunami source includes "Safe Zone" features.** Rendering filter excludes them (`config.js` → `renderFilter` on the tsunami hazard). Point queries still surface them so users get accurate info.
- **`preserveDrawingBuffer: true`** is required on the MapLibre map for PNG/PDF export to capture the canvas. Skipping this is a classic "canvas comes back blank" trap.
- **MapboxDraw with MapLibre.** Aliased via `window.mapboxgl = window.maplibregl` in `draw-analysis.js` so MapboxDraw treats the MapLibre map as compatible. Works on MapLibre v4.
- **Tile caching in the Preview MCP iframe is sticky.** ES modules get cached aggressively; full page reload doesn't always refresh them. Use `preview_stop` + `preview_start` if you need to validate a fresh load, or test individual exports via dynamic `import('./js/foo.js?bust=' + Date.now())`.

## URL state contract

Hash format: `#l=<id>,<id>&z=<zoom>&c=<lng>,<lat>`. `url-state.js` writes it on every `moveend`/`zoomend`/layer toggle (debounced 250 ms). `readHashState()` runs in `onMapReady` and restores both view and active layers.

## Adding a new hazard layer

Three steps:

1. Add the layer config to `HAZARDS` in `js/config.js`. Required: `id`, `name`, `sourceType` (`'bundled'` or `'live'`), `url`, `styleType` (`'categorical-fill'` / `'graduated-fill'` / `'solid-fill'`), `colorMap`, `popup`, `legend`, `risk`.
2. For `sourceType: 'live'`, set `queryFields` to keep the response small and `minZoom` if it's a large dataset.
3. The risk weights across all layers should sum to ~1.0. If you add a new layer, redistribute.

That's it. The layer picker, legend, popups, point query, draw analysis, batch CSV, and composite scoring all read from this config.

## Refreshing bundled data

```bash
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"  -o data/lava-zones.geojson
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11/query?where=1%3D1&outFields=*&outSR=4326&f=geojson" -o data/tsunami-evac.geojson
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/9/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"  -o data/volcano-boundaries.geojson
```

## Known wrinkles

- The state SLR layer (Hazards/MapServer/15) occasionally returns HTTP 500 on bbox queries. `LayerManager._fetchLive` catches the error, dispatches a `hazard-fetch-error` window event, and a toast surfaces it. The next viewport change retries.
- `f=geojson` with `outFields=*` and `returnGeometry=true` on the SLR layer triggers the 500 reliably; using a narrow `outFields` list (e.g. `objectid,zone`) avoids it. All live layers explicitly set `queryFields` for this reason.
- Volcano boundaries data is downloaded but not rendered — it's `LineString`, and the current layer manager only handles polygon fill styling. Reach the line case by adding a `'styleType': 'line'` branch in `_buildFillPaint` / `_addPaintLayers`.

## Disclaimers

The map is for planning awareness only. Don't claim regulatory accuracy. The risk-score buckets are heuristic, not actuarial.
