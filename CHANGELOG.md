# Changelog

All notable changes to this project are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [CLAUDE.md](CLAUDE.md) for the full versioning policy.

---

## [Unreleased]

The v2.0.0 milestone is complete (see below). Future work tracked here.

---

## [v2.0.0] — 2026-05-14 *(tagged)*

The "synthesis report" major version. v1 was a GIS viewer for technical
users; v2 reframes the product as a **risk-communication and preparedness
tool for everyday Hawaiʻi residents**: enter one address, get one
consolidated plain-language risk summary + a prioritized, deduplicated
preparedness action plan. The map demotes to a supporting visual.

### Architecture
Built on the v1 spatial foundation (`js/layers.js` LayerManager, bundled
+ live ArcGIS hybrid). Adds a content layer (`content/hazards.json`,
`content/actions.json`) and a synthesis engine (`js/synthesis.js`) that
turns spatial hits into resident-facing summaries and action plans.

### Added
- **Landing page** (`index.html`). Address-first hero, Nominatim
  typeahead with debounce + keyboard navigation, five sample-address
  cards, inline privacy section, mobile-first layout.
- **Synthesis report** (`report.html`). Reads `?lat&lng&addr` from URL,
  geocodes-validated, renders address bar, overall-risk tile,
  collapsible hazard cards (high-severity auto-expanded; severity:none
  collapsed into a "Not present" group), three-horizon action plan,
  supporting map, footer. Print/PDF via `window.print()` + print
  stylesheet; "Copy link" via clipboard.
- **Synthesis engine** (`js/synthesis.js`). Point-in-polygon against
  every hazard, walks zone match rules, sorts by severity then
  sortHint, dedupes actions by `dedupeKey`, sorts within each horizon
  by hazard-coverage / severity / estimated time, applies the
  per-horizon caps (4/6/8). Exposes `synthesize()` and `localized()`.
- **Translation table** (`content/hazards.json`). Five hazards, ~30
  zone rules across them, all with severity, plain-language label,
  one-liner, multi-sentence explanation, optional probability framing,
  technical code, action references, authoritative sources, data
  provenance. Tsunami fully populated as the canonical worked example.
  Flood, coastal/SLR, wildfire, lava drafted with the same structure
  and event references (1960 Hilo, 1992 Iniki, 2018 lower Puna, 2022
  Mauna Loa, 2023 Lahaina).
- **Action library** (`content/actions.json`). 16 actions with title,
  description, time horizon (right_now / this_week / this_month),
  estimated time, hazard list, severity gating, `dedupeKey`, and
  required source citations.
- **JSON Schemas** (`content/schemas/`) for both content files.
- **Validator** (`scripts/validate-content.js`). Node-only, no deps.
  Cross-references action IDs from hazards.json, checks severities are
  in the enum, requires `https://` sources, warns on `_TODO` markers.
  Current draft: 0 errors, 0 warnings.
- **Content style guide** (`docs/content-style-guide.md`). Voice,
  severity rubric, per-field guidance, things to avoid. Designed for
  HI-EMA / Red Cross Hawaiʻi review.
- **Inspection harness** (`dev/synthesis-test.html`). Runs synthesize()
  against eight fixed addresses with a "content gap" badge for any
  unmapped zone.
- **Versioning discipline**: CLAUDE.md, CHANGELOG.md, semver tagging,
  named working branches, conventional commits.
- **Accessibility**: skip links, real combobox ARIA on the address
  input, dynamic H1 + document title per address, visually-hidden
  severity prefixes for screen readers, AA-contrast severity palette.

### Renamed
- `index.html` (the v1 GIS viewer) is now `viewer.html` — preserved on
  this branch for power users. The v1.0.0 git tag remains the canonical
  v1 reference.

### Approved scope decisions
1. Same five hazards as v1 (tsunami, FEMA flood, wildfire, SLR +
   coastal flood as the hurricane-surge proxy, lava).
2. Statewide data, Oʻahu-first user testing.
3. Content review required by HI-EMA + Red Cross Hawaiʻi before
   public launch.
4. Severity bands: Low / Moderate / High + None.
5. Overall = max severity across hazards (no weighted aggregate).
6. Action plan caps: 4 / 6 / 8 per horizon.
7. Print/PDF via browser-native print + print stylesheet.
8. Out-of-Hawaiʻi addresses: friendly reject.
9. Multilingual schema supported from day one; ship v1 English-only.
10. Geocoding: Nominatim with clear disclosure; state geocoder a
    later upgrade.

### Verified end-to-end
- Landing → typeahead → report navigation
- Landing → form submit → Nominatim → report
- Five sample addresses produce realistic multi-hazard reports
  (Waikīkī, Lahaina, Kīlauea, Pearl City, Princeville)
- Mobile (375×812) and desktop (1280×800) layouts
- Skip-link, H1, document title, severity announce
- Lahaina renders the three-hazard High report (tsunami + flood + fire)
  with the 2023 fire context

### Known limitations / v2.x candidates
- All content marked `lastReviewedBy: "draft — pending HI-EMA + Red
  Cross Hawaiʻi review"`. Public launch requires partner sign-off.
- Synthesis timing varies 2.7–15s depending on cold cache + live
  ArcGIS responsiveness. Acceptable for v2.0.0. Optimization paths:
  point-geometry queries, PMTiles for the 8.8 MB tsunami bundle,
  progressive render of hazard cards.
- Supporting map uses v1 categorical colors; severity-color theming
  (red/orange/yellow bands) is a v2.1 polish item.
- No polished html2canvas+jsPDF export yet; `window.print()` with the
  print stylesheet is the export path.
- Nominatim is fine for v2.0; HI-DOT state geocoder is a v2.x upgrade
  for better rural Big Island coverage and to keep PII within state
  infrastructure.
- The volcano-boundaries dataset is downloaded but not rendered
  (LineString; current layer manager handles polygon fill only).

### Preserved from v1
- Sibling-directory snapshot at `../hawaii-hazards-map-v1-gis-viewer/`
- `v1.0.0` git tag on commit `785e022`
- v1's index.html preserved on this branch as `viewer.html`

---

## [v1.0.0] — 2026-05-14 *(tagged)*

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
