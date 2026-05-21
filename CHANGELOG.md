# Changelog

All notable changes to this project are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [CLAUDE.md](CLAUDE.md) for the full versioning policy.

---

## [Unreleased]

---

## [v2.1.5] — 2026-05-21 *(tagged)*

Refactor `js/report-app.js`. The 309-line orchestrator (with a 158-line
`bootstrap()` function inside) is now a 235-line thin orchestrator that
delegates the supporting-map concerns to a new `js/report-map.js` and
breaks `bootstrap()` into named phase functions.

No user-facing changes. No behavior changes. Pure cleanup made safe by
the v2.1.1–v2.1.4 test + types foundation.

### Added
- `js/report-map.js`:
  - `lightStyle()` — the basemap style
  - `bootHiddenMap(lngLat)` → `{ map, layerManager, host }` — creates an
    off-screen MapLibre map, waits for style load, builds the LayerManager
  - `mountIntoSection(map, layerManager, lngLat, addr, summaries)` —
    moves the map into the visible `#map-mount`, drops an address marker,
    enables hit-hazard layers, and wires the layer-toggle expander
  - `addAddressMarker`, `enableMatchedHazardLayers`, `wireLayerToggles`
    (still exported for direct use; mountIntoSection calls them)

### Changed
- `js/report-app.js`:
  - `bootstrap()` is now a top-level sequence of named phase calls:
    `readUrlParams` → `inHawaii` check → `renderOutOfHawaii` or
    `updatePageHeading` + `mountLoadingStatus` + parallel
    `bootHiddenMap` / `fetchContent` → `runSynthesis` →
    `renderReport` → `mountIntoSection` → `wireSampleAddresses`.
  - Map setup, content fetch, and render orchestration each live in
    their own small function with a JSDoc contract.
  - Removed inline map-helper functions (lightStyle, addAddressMarker,
    enableMatchedHazardLayers, wireLayerToggles) — they live in
    report-map.js now.

### Verified
- `npm run ci` passes: validate (0 errors, 2 expected warnings) →
  typecheck with `strictNullChecks: true` (0 errors) → 67/67 tests pass.

### Rationale
v2.1.1–v2.1.4 added tests, types, and strict-null safety precisely so
refactors like this one would be safe. The orchestrator was the biggest
cleanup the codebase wanted, and the type system caught one
parameter-passing slip during the refactor (the old `enableMatchedHazardLayers`
had `(map, layerManager, summaries)`; tsc immediately flagged the wrong
call signature when I copied it into the new module dropping the `map`
parameter that wasn't being used).

---

## [v2.1.4] — 2026-05-21 *(tagged)*

Closes the v2 type-safety story. `strictNullChecks` is now ON across
every v2 module. The "Object is possibly null" class of bug — accessing
a DOM element that might not exist — can no longer reach `main`.

No user-facing changes. Caught one real-world correctness improvement:
when required DOM elements are absent, the page now fails fast at init
with a clear error message instead of silently mis-wiring or crashing
deep in a click handler.

### Added
- `mustGet$()`, `mustGet$input()`, `mustGet$button()`, `mustGet$form()`,
  `mustHtml()` in `js/dom-helpers.js`. Each throws a descriptive error
  if the element is missing or the wrong tag, and returns a non-null
  typed reference. Lets callers use elements under `strictNullChecks`
  without scattering `?.` or null guards through downstream code.

### Changed
- `tsconfig.json`: `strictNullChecks: true`.
- `js/landing-app.js`: swapped nullable lookups for `mustGet$*` at the
  top of the module. Removed the manual `if (!input || !form || …)`
  guard — `mustGet$*` now handles that uniformly.
- `js/report-app.js`: `reportEl = mustGet$('report')`,
  `params.get(...) ?? ''` for URL parsing, typed Promise wrapper for
  the map.once('load') wait.
- `js/search.js`: `mustGet$input` + `mustGet$` at the top of
  `setupGeocoder` (the v1 geocoder is only invoked from the viewer
  page where its elements are required to exist).
- `js/ui-result.js`: `mustGet$` for the three result-panel elements;
  `wireCloseButtons` now null-guards the `data-close` attribute.
- `js/report-components.js`: optional-chaining (`?.`) on
  `querySelector(...).addEventListener` where the element is
  template-internal but conceptually optional.
- `js/report-profile-ui.js`: explicit "template missing" throws on the
  internal `.profile-fieldsets`, `.profile-form`, and
  `[data-action="forget"]` selectors.
- `test/profile.test.js`: `assert.ok(back)` after `loadProfile()` so
  later property access type-checks. `test/validate-content.test.js`:
  `goodHazard()` returns `any` (intentional — tests mutate it to
  deliberately invalid shapes to verify validator catches them).

### Verified
- `npm run ci` clean: validate (0 errors, 2 expected warnings) →
  typecheck with `strictNullChecks: true` (0 errors) → 67/67 tests pass.

### What this closes
With v2.1.4, the v2 type-safety story is complete:
- v2.1.1 added a 67-test suite and CI gate.
- v2.1.2 added `tsc --checkJs` over the engine + content + tests +
  validator; caught the "typo in a flag name" bug class.
- v2.1.3 removed `@ts-nocheck` from the four DOM-heavy modules via a
  typed-shorthand helper module.
- v2.1.4 (this) enables `strictNullChecks` across the same scope.

The v1 viewer modules (`app.js`, `batch-csv.js`, etc.) remain excluded
from tsc — they're stable and not part of v2.

---

## [v2.1.3] — 2026-05-21 *(tagged)*

DOM-typing pass. Removes the four `// @ts-nocheck` markers v2.1.2 left on
the most-DOM-heavy modules, fixes the type errors that surfaced via a
small typed-shorthand helper module, and brings the engine to
strict-null-safe (UI files to follow in v2.1.4).

No user-facing changes. Caught one real bug at type-check time —
`new Error(res.status)` where `res.status` is `number`, fixed to
`new Error(String(res.status))`.

### Added
- `js/dom-helpers.js` — tiny typed shorthands over
  `document.getElementById` / `querySelector`:
  `$` (HTMLElement), `$input` (HTMLInputElement), `$button`,
  `$select`, `$textarea`, plus `asElement(EventTarget)`,
  `asHtml(Element)`, `asInput(Element)` narrowing helpers. The goal:
  one cast at the boundary rather than every call site repeating
  `/** @type {HTMLInputElement} */ (document.getElementById('x'))`.

### Changed
- `js/layers.js`, `js/search.js`, `js/landing-app.js`, `js/report-app.js`
  — removed `@ts-nocheck`. Each now uses the typed helpers + narrow
  casts where the DOM API requires a specific subtype. Landing app
  also gained an explicit "required DOM elements present" guard at
  the top of the module.
- `js/profile.js` + `js/url-state.js` — minor null-coalescing fixes
  (`profile.homeType ?? ''`, `params.get('z') ?? ''`) so the engine
  passes strict-null. UI files don't yet, hence the temporary revert.

### Deferred to v2.1.4
- `strictNullChecks` is still `false` in tsconfig. Engine modules
  (`profile.js`, `synthesis.js`, `risk.js`, `url-state.js`, etc.) ARE
  strict-null-safe — they have no remaining null errors. The 58
  outstanding errors are all in DOM-mutating files (landing-app: 20,
  report-app: 17, search: 9, ui-result: 6, report-components: 3,
  report-profile-ui: 3) and the right fix is a `mustGet$()` helper that
  throws on missing elements — better as its own patch.

### Verified
- `npm run ci` clean: validate (0 errors, 2 expected warnings) →
  typecheck (0 errors) → 67/67 tests pass.

---

## [v2.1.2] — 2026-05-21 *(tagged)*

Type-safety release. Adds `tsc --checkJs` in CI to catch the "typo in a
profile flag name silently breaks an action" class of bug at compile
time, plus JSDoc `@typedef`s that document the engine and content
contracts.

No user-facing changes. Two new dev dependencies (`typescript`,
`@types/node`); production bundle is still vanilla JS with zero runtime
deps.

### Added
- `tsconfig.json` — `allowJs + checkJs + noEmit` configured to type-check
  v2 engine, content, validator, and tests. Scope-limited (v1 viewer
  files excluded; incremental adoption tracked in ROADMAP polish backlog).
- `js/types/ambient.d.ts` — ambient declarations for CDN globals
  (`maplibregl`, `turf`, `Papa`, `html2canvas`, `jspdf`, `MapboxDraw`).
- `js/types/content.d.ts` — shared `@typedef` blocks for `Profile`,
  `ProfileFlags`, `ProfileFlagName` (enum), `Content`, `Hazard`, `Zone`,
  `Action`, `Requirements`, `HazardSummary`, `Plan`, `ActionPlanEntry`,
  `SynthesisResult`, and the severity / time-horizon enums.
- `npm run typecheck` script.
- CI workflow now runs `npm ci` → `validate` → `typecheck` → `test`. The
  typecheck step gates merges to `main`.

### Changed
- `js/profile.js` — `loadProfile()`, `saveProfile()`, `profileFlags()`,
  `isProfileActive()` have full JSDoc signatures referencing the new
  types. `profileFlags()` return type is `ProfileFlags` — tsc now
  enforces the contract that the action `requirements` block keys off.
- `js/synthesis.js` — `synthesize()`, `evaluateHazard()`,
  `buildActionPlan()`, `meetsRequirements()`, `maxSeverity()` annotated
  with parameter and return types.
- Test-fixture builders in `test/synthesis.test.js` and
  `test/synthesis-bugs.test.js` declare their `opts` parameter as a
  typed shape so a typo in `requirements: { hasInfaant: true }` is
  flagged by tsc with `Did you mean 'hasInfant'?` at the call site.
- `js/landing-app.js` — renamed local `status` variable (clashed with
  `window.status`) to `statusEl`. Real bug, caught while turning tsc on.

### Deferred (tracked in ROADMAP polish backlog)
- DOM-typing pass on `js/report-app.js`, `js/landing-app.js`,
  `js/search.js`, `js/layers.js`. These files have `// @ts-nocheck`
  pending narrow `HTMLInputElement` / `HTMLButtonElement` assertions
  on `getElementById` call sites. The pattern is mechanical but
  high-touch; better as its own patch.
- `strictNullChecks` is OFF for v2.1.2. Per-module re-enable as DOM
  files get typed.
- v1 viewer modules (`app.js`, `batch-csv.js`, `draw-analysis.js`,
  `export.js`, `measure.js`, `places.js`, `point-query.js`) are
  excluded from tsc scope. Stable code; revisit if the viewer is
  revived.

### Verified
- Local: `npm run ci` runs validate → typecheck → 67 tests, all green.
- The typo catcher works: introducing `hasInfaant: true` into a test
  fixture produces `error TS2561: Object literal may only specify
  known properties, but 'hasInfaant' does not exist in type
  'Partial<Record<ProfileFlagName, boolean>>'. Did you mean 'hasInfant'?`

---

## [v2.1.1] — 2026-05-20 *(tagged)*

Foundation-strengthening release. Adds a real test suite (67 tests across
3 modules), refactors the validator into a pure library + CLI wrapper, adds
GitHub Actions CI that blocks regressions on every push and PR, and fixes
two engine bugs that the new tests caught.

No new user-facing features. The cap-eviction fix is the only behavior
change residents will notice: foundational actions like *Build a 14-day
emergency kit* and *Sign up for emergency alerts* no longer get pushed
out of the plan for households whose profile matches enough faster,
profile-gated actions.

### Added
- `test/` directory with `node --test` discovery — zero dependencies.
  - `test/profile.test.js` — 20 tests covering load/save/clear, schema
    migration handling, and full flag-derivation matrix.
  - `test/synthesis.test.js` — 22 tests covering point-in-polygon zone
    evaluation, severity ordering, overall calculation, dedupe, profile
    requirements gating, and sort tie-breakers.
  - `test/synthesis-bugs.test.js` — 5 tests, two of which captured the
    bugs below before the fixes landed.
  - `test/validate-content.test.js` — 20 tests covering happy path,
    every error condition, every warning condition, and a smoke run
    against the real production content.
  - `test/helpers/` — fake `localStorage` + minimal `turf` shims so the
    browser modules load under Node tests.
- `.github/workflows/ci.yml` — runs `npm run validate` and `npm test` on
  every push and PR to `main`. Required to pass before merge.
- Minimal `package.json` with `"type": "module"` and `test` / `validate`
  scripts. Still zero dependencies.

### Changed
- `scripts/validate-content.js` refactored into a pure `validate(hazardsDoc,
  actionsDoc) -> { errors, warnings }` library plus a thin CLI wrapper.
  Same behavior for the CLI; the library is now testable.

### Fixed
- **Cap-eviction of foundational actions.** Added a `pinned: true` field
  on actions, schema-validated. Pinned entries are guaranteed slots in
  their time-horizon cap (still subject to severity and requirements
  gating). Marked `sign_up_for_alerts`, `build_go_bag`, and
  `build_emergency_kit` as pinned.
- **`matchedRequirements` set only on first dedupe-key encounter.** When
  multiple actions share a `dedupeKey`, the engine now ORs the
  has-requirements signal across all merging actions so the
  personalization affordance is correct regardless of authoring order.

### Tested
- 67/67 tests pass locally and in CI.
- Validator: 0 errors on production content (2 expected warnings —
  `_TODO` marker on registry actions, intentional dedupeKey sharing).

The v2.1.0 milestone is complete (see below). Future work tracked in [ROADMAP.md](ROADMAP.md).

---

## [v2.1.0] — 2026-05-19 *(tagged)*

The "household profile" minor version. Adds an **optional** client-side
household profile that personalizes the preparedness action plan based on who
lives at the address. v2.0.0 reports continue to work unchanged for users
without a saved profile.

### Architecture

- **Filter-based.** Each action in `content/actions.json` gains an optional
  `requirements` block mapping profile-derived boolean flags to required
  values (`true` = household must have it; `false` = household must lack
  it). Actions without requirements always pass — the existing baseline.
- **Profile derivation.** `js/profile.js` exposes `profileFlags(profile)`
  returning a flat boolean map (`hasInfant`, `hasPet`,
  `powerDependentMedical`, `noVehicle`, `isApartmentOrCondo`, etc.). 22
  flag names defined; schema enforces them.
- **Filter integration.** `synthesize()` accepts an optional `profile`
  option; `buildActionPlan` filters via `meetsRequirements(action, flags)`
  before dedupe + sort + cap. Each plan entry now carries
  `matchedRequirements: boolean` for the UI to badge.

### Added

- **`js/profile.js`** — `loadProfile / saveProfile / clearProfile /
  profileFlags / isProfileActive`. `localStorage` only, key
  `hi-hazards/household-profile-v1`. Schema-version-tagged for future
  migrations.
- **`content/schemas/profile.schema.json`** — JSON Schema for the
  household profile shape.
- **`js/report-profile-ui.js`** — `renderProfileSection(profile, onSave,
  onClear)`. Native `<details>` expander, five fieldsets (Household, Pets,
  Mobility & medical, Getting around, Your home), 27 inputs + language
  select. Privacy line, Save button, "Forget my household details" button
  with confirm.
- **9 new profile-gated actions** in `content/actions.json`:
  - `build_infant_kit` (hasInfant)
  - `build_pet_evacuation_kit` (hasPet)
  - `register_special_needs_medical` / `register_special_needs_mobility`
    (powerDependentMedical / hasMobilityNeeds; shared `dedupeKey` so
    only one entry surfaces per household)
  - `plan_power_for_medical` (powerDependentMedical)
  - `find_accessible_shelter` (hasMobilityNeeds; moderate+high only)
  - `plan_non_vehicle_evacuation` (noVehicle; moderate+high only)
  - `renter_emergency_contact_check` (isRenter; moderate+high only)
  - `multi_unit_evac_plan` (isApartmentOrCondo; moderate+high only)
- **`requirements` blocks on two existing homeowner-only actions:**
  `harden_home_for_fire` and `evaluate_flood_proofing` now gated by
  `isOwner: true`.
- **`scripts/wire-profile-actions.js`** — one-shot, idempotent script
  that threaded all 9 new action IDs into every relevant zone in
  `content/hazards.json` (12 high-severity zones + 7 moderate, 164
  references total).
- **Validator extension** — recognizes `requirements` blocks against the
  schema's allowed flag list; recognizes `_TODO` on actions.
- **Per-action *For your household* badge** in the report, with a 3px
  accent-color left border on personalized action items.

### Privacy invariants (verified)

- Profile lives only in `localStorage`. No fetch / no XHR.
- URL hash is never written from profile data; the share link works
  identically whether or not a profile is saved.
- Print stylesheet hides the profile capture section so the printed
  report doesn't include personalization controls.
- Clear button removes the localStorage key; subsequent reports render
  baseline content.

### Known limitations / v2.x candidates

- `register_special_needs_*` actions cite county civil-defense fallback
  URLs. The actual special-needs-registry pages per HI county still need
  verification (see [ROADMAP.md](ROADMAP.md) open decision #1).
- Multilingual content not yet authored; profile captures language
  preference but only `en` strings exist. Sets the schema up for future
  translation work.
- Synthesis throughput unchanged from v2.0; cold-cache + slow live ArcGIS
  can take 5–15s. Optimization candidates listed in v2.0 known
  limitations are unchanged.

### Verified

- Engine: synthesize accepts profile; filter behavior confirmed across
  four scenarios (no profile / infant only / no-vehicle only / both)
  using a stubbed LayerManager.
- Content: 25 actions total, 0 errors, 2 expected warnings on validator.
- UI: form save persists to localStorage; re-rendered action plan
  surfaces profile-gated actions with the badge styling.

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
