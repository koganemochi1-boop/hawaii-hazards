# Hawaiʻi Hazards & Preparedness

A risk-communication and preparedness tool for everyday Hawaiʻi residents. Enter your home address; get a plain-language summary of the natural hazards that could affect you and a prioritized, deduplicated preparedness action plan. Optionally save a household profile (people, ages, pets, mobility, medical, vehicle, home type, tenure) and the action plan adapts.

- **Live site:** https://koganemochi1-boop.github.io/hawaii-hazards/
- **Latest tag:** `v2.1.0` (household profile)
- **Status:** All hazard and action content is marked **draft — pending HI-EMA + Red Cross Hawaiʻi review**. Do not point partners or the public at this site as authoritative yet.

---

## What it does

1. **Landing.** Type an address (or pick a sample). Nominatim geocodes it.
2. **Synthesis.** The engine runs point-in-polygon against five hazard layers — FEMA flood, wildfire risk, sea-level-rise + coastal flood (also serving as the de facto hurricane-surge proxy), tsunami evacuation zones, USGS lava flow hazard zones — and looks up plain-language explanations + actions.
3. **Report.**
   - An overall-risk tile (max severity across hazards).
   - One collapsible card per hazard with the zone label, a one-liner, plain-language explanation, probability framing, technical zone code, and authoritative sources.
   - A three-horizon preparedness action plan (Right now / This week / This month) deduplicated across hazards, sorted by multi-hazard coverage, and capped at 4/6/8 to stay scannable.
   - A supporting map centered on the address with the relevant hazard polygons visible.
   - A print stylesheet that produces a fridge-friendly version.
4. **Personalize (optional).** Expand the "Personalize this report for your household" section, fill what applies, save. Profile-gated actions (infant kit, pet evacuation kit, special-needs registry, non-vehicle evacuation, etc.) surface automatically with a *For your household* badge. Stored only on this device; never sent anywhere.

## Hazard layers

| Layer | Source | Live or bundled |
|---|---|---|
| Tsunami Evacuation Zones (standard + extreme) | Hawaiʻi Statewide GIS — Hazards/MapServer/11 | Bundled (`data/tsunami-evac.geojson`) |
| Lava Flow Hazard Zones (USGS 1–9) | Hawaiʻi Statewide GIS — Hazards/MapServer/3 | Bundled (`data/lava-zones.geojson`) |
| FEMA Flood Zones (State DFIRM) | Hawaiʻi Statewide GIS — Hazards/MapServer/6 | Live ArcGIS REST (zoom ≥ 10) |
| Wildfire Risk Areas (High / Medium / Low) | Hawaiʻi Statewide GIS — Hazards/MapServer/7 | Live ArcGIS REST |
| 1% Coastal Flood + 3.2 ft Sea Level Rise | Hawaiʻi Statewide GIS — Hazards/MapServer/15 | Live ArcGIS REST |

Hurricane storm surge is not published as vector data for Hawaiʻi. The combined "1% coastal flood + 3.2 ft sea level rise" layer is used as the de facto coastal storm scenario, and tsunami evacuation zones serve as the practical coastal evacuation framework per HI-EMA practice. This is explained in the Info modal on the site.

## Architecture

Static single-page app. No build step, no API keys, no backend.

```
hawaii-hazards-map/
├── index.html                  v2 landing page (address-first)
├── report.html                 v2 synthesis report
├── viewer.html                 v1 GIS viewer (preserved)
├── content/
│   ├── hazards.json            translation table (zone → plain language)
│   ├── actions.json            preparedness action library
│   └── schemas/                JSON Schemas for both files + profile
├── js/
│   ├── landing-app.js          Nominatim typeahead + navigation
│   ├── report-app.js           orchestrator: geocode → synth → render
│   ├── synthesis.js            engine: spatial + content + dedupe + cap
│   ├── profile.js              household profile localStorage helper
│   ├── report-profile-ui.js    profile capture form
│   ├── report-components.js    pure render functions
│   ├── layers.js               LayerManager (ArcGIS + bundled GeoJSON)
│   └── ...                     supporting utilities
├── data/                       bundled GeoJSON
├── scripts/
│   ├── validate-content.js     content sanity checks
│   └── wire-profile-actions.js one-shot: thread profile actions into zones
├── docs/                       content style guide, evac-routes design (v2.2)
└── dev/synthesis-test.html     engine inspection harness
```

For architecture rationale and conventions (commit style, branching, schema) see [CLAUDE.md](CLAUDE.md). For the current state of the roadmap see [ROADMAP.md](ROADMAP.md). For the version history see [CHANGELOG.md](CHANGELOG.md).

## Privacy

- The address you type goes to **Nominatim** (OpenStreetMap Foundation) to geocode into coordinates. Nominatim may log your IP briefly for abuse prevention; they don't retain the query long-term.
- Hazard data is fetched from **State of Hawaiʻi Statewide GIS** and **FEMA NFHL**, addressed by viewport bbox or by point — they receive bounding-box coordinates, not your address text.
- The household profile is stored **only in your browser's `localStorage`**, on this device. It is never transmitted, never included in the URL hash or share link, and never sent to any server. A visible "Forget my household details" button clears it.
- No analytics, no telemetry, no cookies beyond the technical session.

## Run locally

ES modules require an HTTP server (not `file://`). The simplest:

```bash
cd hawaii-hazards-map
python3 -m http.server 8000
# then open http://localhost:8000
```

Or with Node:

```bash
npx serve .
```

To validate the hazard + action content after edits:

```bash
node scripts/validate-content.js
```

## Deploy

The live site is deployed to GitHub Pages from `main`. Every push to `main` triggers an automatic ~1-minute deploy. Pages → Source → `main` / root.

## v1 GIS viewer

The original GIS viewer that we built before pivoting to the synthesis-report product is preserved at [`/viewer.html`](https://koganemochi1-boop.github.io/hawaii-hazards/viewer.html) for power users (planners, insurance, GIS-literate residents). The canonical v1 state is the `v1.0.0` git tag and a sibling-directory snapshot.

## Disclaimer

This map is **for planning awareness only**. It is not an official alert source, not a substitute for FEMA flood determinations, not a substitute for USGS lava hazard products, NOAA / Hawaiʻi sea-level-rise scenarios, county tsunami evacuation orders, or emergency-management decisions. In an active emergency, follow guidance from HI-EMA, your county civil defense, and broadcast media. Geometries are simplified server-side for performance and may not match authoritative maps at the parcel scale.
