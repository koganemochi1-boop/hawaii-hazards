# CLAUDE.md — Project conventions

This file is read at the start of every session. It documents the
versioning discipline for this project plus v1-era architecture notes.

---

## Session start protocol

At the start of every session, before touching any code, do this:

1. Re-read this file.
2. Run `git status` and `git log --oneline -10`.
3. State to the user: the current branch, the last commit, and what
   version we're working toward.
4. Then proceed with the requested work.

## Versioning policy

This project uses semantic versioning (MAJOR.MINOR.PATCH) tracked via
git tags and branches.

- **MAJOR** (v1, v2, v3) — significant changes to product direction or
  architecture. e.g. v1 was a GIS viewer; v2 is the synthesis report.
- **MINOR** (v2.1, v2.2) — completed phases or major features within a
  major version. e.g. v2.1 = evacuation routes, v2.2 = address context.
- **PATCH** (v2.1.1) — bug fixes, content updates, small refinements
  within a phase.

## Branching rules

- All work happens on a working branch named for the current major
  version (e.g. `v2-synthesis-report`).
- Each completed phase gets merged to `main` and tagged.
- Before starting a new phase or major refactor, create a new working
  branch from `main`.
- **Never commit directly to `main`** — always merge from a working
  branch.

## Commit rules

- Commit after every logically complete unit of work (a working
  feature, a passing test suite, a completed refactor step) — not just
  at the end of a session.
- Commit messages follow Conventional Commits:
  - `feat:` new features
  - `fix:` bug fixes
  - `refactor:` restructuring without behavior change
  - `docs:` documentation
  - `chore:` tooling, dependencies, configuration
  - `content:` hazard / action library content updates
- Each commit message clearly states **what** changed and **why**.

## Tagging rules

- Tag every completed phase with an annotated tag: `git tag -a vX.Y.Z`.
- The tag message describes what the version delivers, what's new since
  the previous tag, and any known limitations.
- **Tags are immutable** — never move or delete a tag once pushed.

## Snapshot rules before major changes

Before any significant refactor, scope change, or architectural shift:

1. Confirm the working tree is clean (no uncommitted changes).
2. Tag the current state with the next appropriate version number.
3. Push the tag to the remote.
4. Create a new working branch for the new direction.
5. Update CHANGELOG.md describing what's being preserved and why the
   new direction is starting.
6. **Confirm with the user in chat before proceeding.**

## Required files to maintain

- **CLAUDE.md** (this file) — versioning policy and project conventions
- **CHANGELOG.md** — human-readable list of changes by version, updated
  on every tag
- **README.md** — current state of the project, how to run it, current
  version

---

# v1 architecture notes (GIS viewer)

The notes below describe the v1 codebase (the MapLibre + ArcGIS hazards
viewer). They may or may not apply once v2 begins — re-evaluate against
the working branch at the start of any v2 work.

## Architecture at a glance

- `js/config.js` — single source of truth for hazard layers. Each entry
  defines the source, rendering, popup, legend, and risk-scoring
  function. Add a layer here and the rest of the app picks it up
  automatically.
- `js/layers.js` — `LayerManager` class. Adds/removes MapLibre sources
  & paint layers, queries live ArcGIS REST services by viewport bbox
  (debounced 220 ms on `moveend`), caches responses by bbox key, and
  exposes `getFeaturesIntersecting(id, bbox)` for cross-layer analysis
  (used by point query, draw, batch CSV).
- `js/risk.js` — `scorePoint(lngLat, layerManager)` and
  `scorePolygon(polygon, layerManager)`. Composite weighted scoring
  across all hazards; output bucketed via `RISK_BUCKETS`.
- `js/app.js` — boot. `onMapReady()` is invoked either via
  `map.on('load')` or directly if the style is already loaded. Each
  `setup*` call is wrapped in a `safeRun` try/catch so a single broken
  module doesn't kill the rest.

## Key decisions worth knowing

- **Hybrid data strategy.** Small/static datasets (tsunami evac, lava
  zones, volcano boundaries) bundled in `/data` as GeoJSON.
  Large/changing datasets (FEMA DFIRM, fire risk, SLR + coastal flood)
  queried live from ArcGIS REST.
- **Hurricane SLOSH isn't published as vector data for Hawaiʻi.** The
  "1% coastal flood + 3.2 ft SLR" layer (Hazards/MapServer/15) is used
  as the de facto coastal storm hazard proxy. Tsunami evac zones double
  as the practical coastal evacuation framework. Documented in README.
- **State DFIRM is large (~16k features).** Only queried at zoom ≥ 10
  to keep things responsive. Other live layers query statewide.
- **Tsunami source includes "Safe Zone" features.** Rendering filter
  excludes them (`config.js` → `renderFilter` on the tsunami hazard).
  Point queries still surface them so users get accurate info.
- **`preserveDrawingBuffer: true`** is required on the MapLibre map for
  PNG/PDF export to capture the canvas. Skipping this is a classic
  "canvas comes back blank" trap.
- **Server-side geometry simplification.** All ArcGIS bbox queries send
  `maxAllowableOffset` scaled to the bbox span. Without it, the SLR
  layer returns HTTP 500 on Big Island bboxes because the coastline
  geometry is too large to serialize as GeoJSON.
- **MapboxDraw with MapLibre.** Aliased via
  `window.mapboxgl = window.maplibregl` in `draw-analysis.js` so
  MapboxDraw treats the MapLibre map as compatible. Works on MapLibre v4.
- **Tile caching in the Preview MCP iframe is sticky.** ES modules get
  cached aggressively; full page reload doesn't always refresh them.
  Use `preview_stop` + `preview_start` if you need to validate a fresh
  load.

## URL state contract

Hash format: `#l=<id>,<id>&z=<zoom>&c=<lng>,<lat>`. `url-state.js`
writes it on every `moveend` / `zoomend` / layer toggle (debounced
250 ms). `readHashState()` runs in `onMapReady` and restores both view
and active layers.

## Adding a new hazard layer

1. Add the layer config to `HAZARDS` in `js/config.js`. Required: `id`,
   `name`, `sourceType` (`'bundled'` or `'live'`), `url`, `styleType`
   (`'categorical-fill'` / `'graduated-fill'` / `'solid-fill'`),
   `colorMap`, `popup`, `legend`, `risk`.
2. For `sourceType: 'live'`, set `queryFields` to keep the response
   small and `minZoom` if it's a large dataset.
3. The risk weights across all layers should sum to ~1.0. If you add a
   new layer, redistribute.

The layer picker, legend, popups, point query, draw analysis, batch
CSV, and composite scoring all read from this config.

## Refreshing bundled data

```bash
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"  -o data/lava-zones.geojson
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11/query?where=1%3D1&outFields=*&outSR=4326&f=geojson" -o data/tsunami-evac.geojson
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/9/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"  -o data/volcano-boundaries.geojson
```

## Known wrinkles

- Volcano boundaries data is downloaded but not rendered — it's
  `LineString`, and the current layer manager only handles polygon fill
  styling. To enable: add a `'styleType': 'line'` branch in
  `_buildFillPaint` / `_addPaintLayers`.
- Bundled tsunami evac GeoJSON is 8.8 MB — heavy first load. Consider
  vector tiles (PMTiles via tippecanoe) or per-island splits if first
  load matters.

## Disclaimer

The map is for planning awareness only. The risk-score buckets are
heuristic, not actuarial. Don't claim regulatory accuracy.
