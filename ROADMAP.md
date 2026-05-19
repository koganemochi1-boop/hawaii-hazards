# Roadmap

Living document. The current state of the project plus what's next.

- **History of completed work** → see [CHANGELOG.md](CHANGELOG.md)
- **How we work** (branching, commits, tags) → see [CLAUDE.md](CLAUDE.md)
- **What it is and how to run it** → see [README.md](README.md)

Update this file when:
- A phase ships (move items from "Next up" → CHANGELOG)
- A new blocker or decision surfaces (add to "Open decisions")
- Direction changes (revise "Next up")

---

## Snapshot — current state

- **Latest tag:** `v2.0.0` (synthesis report). Tagged 2026-05-14.
- **Default branch:** `main` at commit `266a9f0`.
- **Active branch:** `v2.1-household-profile` (created for the next phase; ROADMAP-only commit on it so far).
- **Deployed:**
  - Live site: https://koganemochi1-boop.github.io/hawaii-hazards/
  - Repo: https://github.com/koganemochi1-boop/hawaii-hazards
- **Local snapshots preserved:** `../hawaii-hazards-map-v1-gis-viewer/` (matches `v1.0.0` tag).
- **Content review:** all hazard + action copy marked `lastReviewedBy: "draft — pending HI-EMA + Red Cross Hawaiʻi review"`. **Not approved for public-facing launch yet.**

---

## What's been delivered

### v1.0.0 — GIS viewer *(May 2026)*
Interactive MapLibre map of all 8 main Hawaiian islands with five hazard layers (FEMA DFIRM, wildfire risk, SLR + coastal flood, tsunami evac, USGS lava). Bundled GeoJSON + live ArcGIS REST. Point query, polygon-draw analysis, batch CSV lookup, measure, PNG/PDF export, shareable URL hash, Quick Jump, geolocation. Mobile drawer. Preserved at `viewer.html` on this branch. Full detail in CHANGELOG.

### v2.0.0 — Synthesis report *(May 2026)*
Pivot from GIS viewer to a resident-facing risk-communication tool. Address-first landing page (Nominatim typeahead). Per-address synthesis report with overall risk tile, collapsible plain-language hazard cards, deduplicated three-horizon preparedness action plan (4/6/8 cap), supporting map with severity-colored layers. Content layer (`content/hazards.json`, `content/actions.json`) with JSON schemas, Node validator, and a style guide so a non-developer can extend or revise. WCAG-AA-aware (skip links, combobox ARIA, dynamic H1, screen-reader severity announce). Mobile-first. Full detail in CHANGELOG.

---

## Active work

**Branch:** `v2.1-household-profile`

Adds an optional client-side household profile (people, ages, pets, mobility, medical, vehicle, language, home type, tenure) that personalizes the action plan. Stored in `localStorage` only; never transmitted. The synthesis engine reads profile flags to gate which actions surface. See "v2.1 — household profile" below.

Evacuation routing (originally planned for v2.1) has been deferred to v2.2.

---

## Roadmap

### Before public launch (gates the v2.0.0 → "released to residents" transition)

These are not version bumps — they are quality gates on the existing v2.0.0 deliverable. The site is live but content is draft.

1. **Content review by HI-EMA outreach.** Walk through `content/hazards.json` + `content/actions.json` with HI-EMA. Capture revisions. Update `lastReviewedBy` and `lastReviewedDate`.
2. **Content review by a Red Cross Hawaiʻi reviewer.** Same.
3. **Geocoder accuracy spot-check.** Test ~20 real addresses spanning all islands, especially rural Big Island, Lānaʻi, Molokaʻi. Document failure modes. Decide whether to pursue the HI state geocoder upgrade now or later.
4. **Tag a `v2.0.1` patch with the reviewed content.** Mark content as `lastReviewedBy: "HI-EMA, <date>"` etc. This is the version we point partners at.
5. **Optional: a small group of trusted Hawaiʻi residents user-test the site on phones.** Capture confusion, broken expectations, language that doesn't read right. Iterate.

### v2.1 — Household profile *(current next phase)*

Adds an **optional** client-side household profile that personalizes the action plan. The synthesis engine gates which actions surface based on profile flags. Client-side storage only — no server, no PII transmission, never in the URL hash.

**Profile fields (all optional):**

- Household size (number)
- Ages present (multi-select: infant / young child / school-age / teen / adult / senior)
- Pets (multi-select: dog / cat / other) + count
- Mobility assistance needs (none / walking aid / wheelchair / non-ambulatory)
- Power-dependent medical needs (multi-select: oxygen / dialysis / refrigerated meds / CPAP)
- Vehicle access (own / shared / none)
- Preferred language (English / Filipino / Japanese / Korean / Hawaiian / Marshallese / Ilocano / Tongan / Samoan / Spanish / Other)
- Home type (single-family / apartment / condo / multi-unit)
- Renter or owner

**Architecture: filter-based.** Each action gains an optional `requirements` block (e.g., `{ "hasInfant": true }`). The synthesis engine reads `localStorage` profile, derives boolean flags, and filters actions whose requirements aren't all matched. Profile-less reports behave exactly as today.

**UX: inline on the report.** A "Personalize this report" expander above the action plan reveals the form; saving re-renders in place. A "Personalized for: …" pill shows when active. A visible "Forget my household details" button always present.

**Storage: `localStorage`** under `hi-hazards/household-profile-v1`. Privacy line on the form. URL hash explicitly excludes the profile.

**New content:** ~9 new profile-gated actions covering infant kit, pet evacuation, special-needs registry, mobility-equipment plans, no-vehicle evacuation, renters / multi-unit guidance. Plus a per-county special-needs-registry-link list (see open decisions).

### v2.2 — Evacuation routes *(deferred from v2.1)*

Adds walking + driving routes from the user's address to the nearest appropriate evacuation destination. Phase scope:

- **Routing engine.** OpenRouteService and Mapbox have free tiers. OSRM via a public server is another option. Pick one based on key policy and accuracy in Hawaiʻi.
- **Shelter / safe-zone destination data.** Two sources to merge:
  - Tsunami safe zones (already in `data/tsunami-evac.geojson` as `zone_type: "Tsunami Safe Zone"` polygons) — pick the nearest accessible centroid.
  - County hurricane refuges (need to source — HI-EMA publishes lists; not always in GIS form).
- **Hazard-aware routing** (stretch): penalize routes that cross higher-severity zones for the user's primary hazard. E.g., a tsunami evac route shouldn't cross another tsunami evac polygon.
- **Surface.** New report section "How to leave," with: distance + estimated walking time, distance + estimated driving time, route polyline on the supporting map, turn list (collapsible). Print-friendly.

Decisions needed: routing provider; how to handle addresses with no clear "primary hazard"; whether to enforce one route per hazard or one consolidated route.

### v2.3 — Address context

Extends the report header with structured facts about the address:

- **Elevation** (open-elevation API or USGS NED).
- **Distance to nearest coastline** (compute against a coastline polyline).
- **Single-access-road flag** (does only one road serve this neighborhood?). Important for evacuation.
- **Nearest critical infrastructure**: hospital, fire station, evac shelter, fuel.
- **Parcel context** (if HI county parcel data is licensed): year built, parcel size, zoning.

This phase makes the report feel "I know about my specific home" rather than "I know about this lat/lng."

### v2.4 — Real-time alerts & incidents

Display current active incidents and watches on the report. Strong disclaimers ("not an official alert source"):

- NWS active warnings/watches (NWS API).
- Pacific Tsunami Warning Center bulletins.
- Active wildfire perimeters (NIFC / HWMO).
- USGS HVO volcano alert level + recent earthquakes.
- Stream gauges (USGS streamflow).
- Power outages (county outage maps where APIs exist).
- Air quality (PurpleAir / AirNow).

This phase requires the most ongoing operational care — feeds change, services go down. Build with degradation in mind.

---

## Polish backlog *(opportunistic, fits into v2.0.x or v2.1.x patches)*

| Item | Effort | Why |
|---|---|---|
| Severity-color theming on supporting map (red/orange/yellow bands replacing v1 categorical) | small | Visual consistency between hazard cards and map |
| Polished html2canvas+jsPDF 2-page PDF export | medium | Window.print works but a designed PDF is the "fridge artifact" |
| Switch live ArcGIS to point-geometry queries | small | Faster synthesize() (~2× expected) |
| Convert tsunami GeoJSON (8.8 MB) to PMTiles | medium | First-load improvement |
| Render volcano boundaries as a line layer | small | Currently downloaded but unused |
| CI: validator runs on every PR via GitHub Actions | small | Catches content schema regressions before merge |
| HI state geocoder integration | medium | Better rural BI coverage, keeps PII off OSM Foundation servers |
| Multi-language content (start with one — Filipino is the largest non-English heritage language in HI) | large (content) | Equity reach |
| Severity-color tile on landing | small | Hint at the experience before the report loads |
| "Sample address" → "Try sample" button copy | trivial | Microcopy |

---

## Open decisions

Things waiting on the user. Each blocks the next phase listed.

1. **Special-needs registry links per county.** v2.1 will surface a "Register with [your county's] Special Needs Registry" action. Honolulu, Maui, Hawaiʻi, and Kauaʻi counties each may run their own — need to identify the canonical URL for each. *Blocks v2.1 content draft.*
2. **Routing provider for v2.2.** OpenRouteService (free tier, key required, decent quality), Mapbox Directions (free tier, key required, best quality), or OSRM (no key, self-hostable, no walking guidance for stairs/paths in HI)? *Blocks v2.2.*
3. **Hurricane refuge list source.** Where does the canonical list live? HI-EMA county pages? Manual gather + commit? *Blocks v2.2.*
4. **Should the validator run in CI?** A simple GitHub Actions workflow would refuse PRs that break `content/hazards.json`, `content/actions.json`, or (added in v2.1) the profile schema. *Affects content review workflow.*
5. **HI-EMA contact and review timeline.** Who's the actual person to send the JSON files to, and when? *Blocks "before public launch" gate.*
6. **Multi-language scope.** Profile captures preferred language in v2.1, but no translations exist yet. First language? Translation source (community partner vs. paid translator vs. machine + review)? *Decoupled, can ship anytime after v2.1.*
7. **What goes on the README's "About" section once content is reviewed?** A short product description with partner logos? *Polish.*
8. **Domain.** Stay on `koganemochi1-boop.github.io/hawaii-hazards`, or buy `hawaiihazards.org` / similar? *Marketing decision.*

---

## How to maintain this document

- When you finish a phase and tag it, **move that section from "Roadmap" to "What's been delivered"** (a one-line summary; full detail lives in CHANGELOG).
- When you start a new working branch, **update "Active work"** with the branch name and intended scope.
- When a polish-backlog item lands as part of a patch, **strike it through or remove the row**.
- When a decision gets made, **delete it from "Open decisions"** and capture the decision in CHANGELOG under the relevant version.

The shape of this file should stay stable; the content should churn.
