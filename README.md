# Hawaiʻi Natural Hazards Map

An interactive, GIS-informed web map of natural hazards across all main Hawaiian Islands. Toggle hazard layers independently, click features for details, run a "what's at this location?" query, draw any area and get a per-hazard coverage summary, or paste a CSV of addresses for a batch risk lookup.

Built as a single-page static site — no build step, no API keys, no server-side code. Run locally with any static file server, or deploy to GitHub Pages.

## Hazard layers

| Layer | Source | Live or bundled |
|---|---|---|
| Tsunami Evacuation Zones (standard + extreme) | State of Hawaiʻi Statewide GIS — Hazards/MapServer/11 | Bundled (`data/tsunami-evac.geojson`) |
| Lava Flow Hazard Zones (USGS 1–9) | State of Hawaiʻi Statewide GIS — Hazards/MapServer/3 | Bundled (`data/lava-zones.geojson`) |
| FEMA Flood Zones (State DFIRM, 100/500-yr, V/AE/X) | State of Hawaiʻi Statewide GIS — Hazards/MapServer/6 | Live ArcGIS REST (queried by viewport bbox, zoom ≥ 10) |
| Wildfire Risk Areas (High / Medium / Low) | State of Hawaiʻi Statewide GIS — Hazards/MapServer/7 | Live ArcGIS REST |
| 1% Coastal Flood + 3.2 ft Sea Level Rise | State of Hawaiʻi Statewide GIS — Hazards/MapServer/15 | Live ArcGIS REST |

**A note on hurricane storm surge.** Hawaiʻi does not publish SLOSH-style hurricane storm-surge vector data the way the Atlantic / Gulf coasts do. The State of Hawaiʻi's official combined coastal flooding product — the "1% Coastal Flood Zone with 3.2 ft Sea Level Rise" layer — serves as the de facto coastal storm hazard scenario. Tsunami evacuation zones are used by Hawaiʻi emergency management as the practical coastal evacuation framework for hurricane events as well.

## Tools

- **Layer toggles** — sidebar checkboxes with per-layer color swatches; "clear all" link to turn everything off
- **Dynamic legend** — auto-updates based on which layers are active
- **Click popups** — click any rendered feature to see zone code, subtype, BFE, etc.
- **Address / place search** — Nominatim (OpenStreetMap) geocoder, bounded to Hawaiʻi
- **What's at this location?** — click any point, get every hazard intersecting it plus a composite weighted risk score
- **Draw area & summarize** — draw a polygon, get per-hazard % coverage and max risk inside it
- **Measure distance** — two-click great-circle distance in miles, km, and meters
- **Batch CSV lookup** — paste rows or load a CSV with either an `address` column (geocoded via Nominatim) or `lat`+`lng` columns (skips geocoding, much faster). Downloadable results CSV.
- **PNG / PDF export** — capture the current map view (PNG, or letter-size landscape PDF with title and attribution)
- **Shareable URL** — the map's center, zoom, and active layers are encoded in the URL hash; the **Share** button copies the link to your clipboard
- **Home / reset** — fit-to-all-islands at any time
- **Keyboard** — `Esc` closes any open panel or modal
- **Mobile** — sidebar collapses to a drawer behind a hamburger menu on narrow screens

## Composite risk score

Each layer has a weight and a per-feature score function (see `js/config.js`):

| Layer | Weight | Score logic |
|---|---|---|
| Lava (USGS) | 0.25 | Zone 1 → 1.0, ramping down to Zone 9 → 0.05 |
| Tsunami | 0.20 | Extreme → 1.0, Standard → 0.7 |
| FEMA DFIRM | 0.20 | V/VE → 1.0, A/AE/AH/AO → 0.75, X-500 → 0.3, X → 0.1 |
| Coastal flood + 3.2 ft SLR | 0.20 | Presence → 1.0 |
| Wildfire | 0.15 | High → 1.0, Medium → 0.6, Low → 0.3 |

Composite = Σ (weight × score). Bucketed:

- `0.00–0.15` Low
- `0.15–0.35` Moderate
- `0.35–0.60` High
- `0.60–0.85` Severe
- `0.85+` Extreme

Tweak weights or scoring functions directly in `js/config.js`.

## Run locally

ES modules require an HTTP server (won't work via `file://`). Any static server works:

```bash
cd hawaii-hazards-map
python3 -m http.server 8000
# then open http://localhost:8000
```

Or:

```bash
npx serve .
```

## Deploy to GitHub Pages

1. Push this directory to a GitHub repo (e.g. `hawaii-hazards-map`).
2. In repo Settings → Pages → Source: deploy from branch, `main`, root.
3. Visit `https://<your-username>.github.io/hawaii-hazards-map/`.

All data services used (Hawaiʻi GIS, FEMA, Nominatim) set permissive CORS, so they work from a static origin.

## Project structure

```
hawaii-hazards-map/
├── index.html
├── css/styles.css
├── CLAUDE.md               # notes for future Claude sessions
├── js/
│   ├── app.js              # bootstrap; wires everything via try/catch safeRun
│   ├── config.js           # hazard layer definitions + risk weights
│   ├── layers.js           # ArcGIS REST adapter + MapLibre layer manager
│   ├── legend.js
│   ├── popup.js
│   ├── search.js           # Nominatim geocoder + reusable geocodeOne()
│   ├── risk.js             # point + polygon scoring
│   ├── point-query.js
│   ├── draw-analysis.js
│   ├── batch-csv.js        # address / lat+lng CSV scoring
│   ├── measure.js          # two-click great-circle distance
│   ├── export.js           # PNG + PDF
│   ├── url-state.js        # hash sync for shareable links
│   ├── toast.js            # bottom-of-screen toast helper
│   └── ui-result.js        # right-side result panel helpers
└── data/
    ├── tsunami-evac.geojson
    ├── lava-zones.geojson
    └── volcano-boundaries.geojson  (downloaded; not rendered in v1)
```

For details on the architecture and how to add new hazard layers, see [CLAUDE.md](CLAUDE.md).

## Refreshing the bundled data

The three bundled GeoJSON files were downloaded directly from the State of Hawaiʻi service. To refresh:

```bash
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"  -o data/lava-zones.geojson
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11/query?where=1%3D1&outFields=*&outSR=4326&f=geojson" -o data/tsunami-evac.geojson
curl "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/9/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"  -o data/volcano-boundaries.geojson
```

## Disclaimer

This map is **for planning awareness only** and is not a substitute for official flood, fire, lava, tsunami, or sea-level-rise determinations. Refer to FEMA, the State of Hawaiʻi, NOAA, USGS HVO, or your county civil-defense agency for regulatory or emergency-response use.
