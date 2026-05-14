# Changelog

All notable changes to this project are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [CLAUDE.md](CLAUDE.md) for the full versioning policy.

---

## [Unreleased]

Versioning discipline established. Next planned milestone is **v2.0.0** —
a pivot from "GIS viewer" (v1) to a **synthesis report** product. The
v1 codebase is preserved for return / standalone use; v2 work will
happen on a dedicated `v2-synthesis-report` branch cut from `main`.

### Planned for v2.0.0
- New product direction: a synthesis report (specifics TBD by the user
  in the next session).
- Branch `v2-synthesis-report` to be created from `main` once v1.0.0 is
  tagged.

### Preserved from v1
- A complete sibling-directory snapshot at
  `../hawaii-hazards-map-v1-gis-viewer/` — runnable standalone.
- The `v1.0.0` tag (to be applied on commit `785e022`, the last commit
  before this versioning policy was added) will pin the v1 codebase in
  git history.

---

## [v1.0.0] — 2026-05-14 *(snapshot taken, tag pending)*

The "GIS viewer" major version: an interactive multi-hazard web map of
the main Hawaiian islands. Static single-page app (MapLibre + vanilla
ES modules), runnable from any static file server and deployable to
GitHub Pages with no build step.

### Added
- Interactive base map centered on all 8 main Hawaiian islands, with
  per-layer toggles and a dynamic legend.
- Five hazard layers:
  - **FEMA DFIRM flood zones** — live ArcGIS REST, zoom ≥ 10
  - **Wildfire risk areas** (High / Medium / Low) — live ArcGIS REST
  - **Sea Level Rise + 1% coastal flood (3.2 ft scenario)** — live;
    serves as the de facto hurricane storm-surge proxy for Hawaiʻi
  - **Tsunami evacuation zones** (standard + extreme) — bundled GeoJSON
  - **USGS lava flow hazard zones** (1–9) — bundled GeoJSON
- Hybrid data strategy: bundled GeoJSON for small static datasets;
  live ArcGIS REST queries (bbox-debounced, server-side simplified) for
  large or changing ones.
- Composite weighted risk scoring for points and drawn polygons; output
  bucketed Low / Moderate / High / Severe / Extreme.
- Tools: Nominatim address geocoder, point query ("what's here?"),
  polygon draw + summary, batch CSV / lat-lng lookup, two-click
  great-circle distance measure, PNG and PDF export (PDF includes
  legend column).
- URL-hash shareable views (`#l=…&z=…&c=…`); Share button copies to
  clipboard.
- Quick-Jump dropdown of 13 notable Hawaiʻi locations.
- Geolocation "Me" button with off-island detection.
- Per-layer opacity sliders and live feature-count badges.
- Info modal documenting sources, methodology, and disclaimer.
- Mobile drawer sidebar with hamburger toggle and backdrop.
- Escape closes panels; clear-all-layers link; live-layer error toasts;
  inline "zoom in (≥N)" hints for layers below their min zoom.
- Project documentation: README, CLAUDE.md architecture notes,
  SESSION_NOTES.md.
- A complete sibling-directory snapshot at
  `../hawaii-hazards-map-v1-gis-viewer/`.

### Fixed (during v1 development)
- PNG export producing blank canvases (`preserveDrawingBuffer: true`).
- SLR layer HTTP 500 on Big Island bbox queries
  (`maxAllowableOffset` scaled to bbox span).
- Tsunami "Safe Zone" features rendering the same purple as evacuation
  zones (now filtered from rendering; point queries still see them).
- Geocoder markers stacking on every search (now single current marker).
- Mobile sidebar collapsing to 0 width (flexbox `flex-shrink: 0`).
- `map.on('load')` race when style loaded synchronously.

### Known limitations
- Hurricane SLOSH-style vector data is not published for Hawaiʻi; the
  SLR + coastal flood layer stands in. Documented in the Info modal.
- Bundled `tsunami-evac.geojson` is ~8.8 MB; first load is slow on poor
  connections. Mitigation candidates: vector tiles or per-island splits.
- The downloaded `volcano-boundaries.geojson` is not currently rendered
  (it's `LineString`; the layer manager only handles polygon fill).

### Verified during v1 development
- All 8 main islands render in the default view.
- All five hazard layers toggle independently; live layers fetch by
  bbox above their min-zoom thresholds.
- Composite point scoring (Aloha Tower) → Low (0.065).
- Composite polygon scoring (downtown Honolulu) → High (0.445).
- SLR fix verified against the previously-failing Big Island bbox.
- Mobile drawer works at 375 × 812.
- PNG export produces a 385 KB image (no longer blank).
