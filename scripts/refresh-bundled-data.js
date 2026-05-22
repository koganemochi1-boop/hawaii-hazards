#!/usr/bin/env node
//
// Re-downloads the bundled GeoJSON layers from the State of Hawaiʻi GIS
// service, replaces the local files atomically, and updates each hazard's
// `dataProvenance.lastDownloaded` in content/hazards.json.
//
// Usage:
//   npm run refresh-data            # download all three sources
//   node scripts/refresh-bundled-data.js
//   node scripts/refresh-bundled-data.js --source=tsunami
//   node scripts/refresh-bundled-data.js --dry-run
//
// Exit codes:
//   0  all sources refreshed (warnings may print)
//   1  one or more sources failed; existing files unchanged

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');

/**
 * Bundled-data sources. Each is a single ArcGIS layer query whose result is
 * pinned in the repo (rather than queried live at runtime) because the data
 * is small enough and stable enough to ship with the app. URL parameters
 * match what's already documented in CLAUDE.md.
 *
 * @type {Array<{
 *   name: string,
 *   contentHazardId: string | null,
 *   service: string,
 *   url: string,
 *   path: string,
 * }>}
 */
const SOURCES = [
  {
    name: 'Tsunami evacuation zones',
    contentHazardId: 'tsunami',
    service: 'Hazards/MapServer/11',
    url: 'https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    path: 'data/tsunami-evac.geojson',
  },
  {
    name: 'Lava flow hazard zones (USGS 1–9)',
    contentHazardId: 'lava',
    service: 'Hazards/MapServer/3',
    url: 'https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    path: 'data/lava-zones.geojson',
  },
  {
    name: 'Volcano rift-zone boundaries',
    contentHazardId: null,
    service: 'Hazards/MapServer/9',
    url: 'https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/9/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    path: 'data/volcano-boundaries.geojson',
  },
];

// -- CLI parsing --------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceFilter = args
  .find(a => a.startsWith('--source='))
  ?.split('=')[1];

const filteredSources = sourceFilter
  ? SOURCES.filter(s => s.path.includes(sourceFilter) || s.contentHazardId === sourceFilter)
  : SOURCES;

if (sourceFilter && filteredSources.length === 0) {
  console.error(`No bundled source matches --source=${sourceFilter}`);
  console.error(`Known: ${SOURCES.map(s => s.contentHazardId || path.basename(s.path)).join(', ')}`);
  process.exit(1);
}

// -- Main --------------------------------------------------------------

let hadError = false;
/** @type {Array<{source: typeof SOURCES[number], before: any, after: any}>} */
const results = [];

console.log(`Refreshing ${filteredSources.length} bundled GeoJSON source${filteredSources.length === 1 ? '' : 's'}${dryRun ? ' (dry-run)' : ''}…\n`);

for (const source of filteredSources) {
  process.stdout.write(`  • ${source.name} (${source.service})… `);
  try {
    const before = statBundle(path.join(ROOT, source.path));
    const fc = await fetchGeoJSON(source.url);
    const featureCount = fc.features?.length ?? 0;
    const newJson = JSON.stringify(fc);
    const after = { featureCount, size: newJson.length };

    if (dryRun) {
      console.log(`would refresh — ${formatDelta(before, after)}`);
    } else {
      atomicWrite(path.join(ROOT, source.path), newJson + '\n');
      console.log(`done — ${formatDelta(before, after)}`);
    }
    results.push({ source, before, after });
  } catch (e) {
    hadError = true;
    console.log('✖ failed');
    console.error(`     ${e.message}`);
  }
}

// -- Update hazards.json lastDownloaded ---------------------------------

if (!hadError && !dryRun) {
  const today = new Date().toISOString().slice(0, 10);
  const hzPath = path.join(ROOT, 'content', 'hazards.json');
  const doc = JSON.parse(fs.readFileSync(hzPath, 'utf8'));
  let touched = 0;
  for (const { source } of results) {
    if (!source.contentHazardId) continue;
    const hazard = doc.hazards.find(h => h.id === source.contentHazardId);
    if (!hazard) continue;
    hazard.dataProvenance = hazard.dataProvenance || {};
    hazard.dataProvenance.lastDownloaded = today;
    touched++;
  }
  if (touched > 0) {
    fs.writeFileSync(hzPath, JSON.stringify(doc, null, 2) + '\n');
    console.log(`\nUpdated lastDownloaded=${today} on ${touched} hazard${touched === 1 ? '' : 's'} in content/hazards.json`);
  }
}

console.log();
if (hadError) {
  console.error('One or more sources failed. Existing files left in place.');
  process.exit(1);
}

if (dryRun) {
  console.log('Dry-run complete. Re-run without --dry-run to write.');
} else {
  console.log('Done.  Suggested next steps:');
  console.log('  npm run validate    # check content/hazards.json still parses');
  console.log('  npm test            # confirm engine still passes');
  console.log('  git diff data/ content/hazards.json');
}

// -- Helpers ------------------------------------------------------------

/** @param {string} p */
function statBundle(p) {
  if (!fs.existsSync(p)) return { exists: false, featureCount: 0, size: 0 };
  const size = fs.statSync(p).size;
  let featureCount = 0;
  try {
    const fc = JSON.parse(fs.readFileSync(p, 'utf8'));
    featureCount = fc.features?.length ?? 0;
  } catch (_) { /* ignore parse error in existing file */ }
  return { exists: true, featureCount, size };
}

/** @param {string} url */
async function fetchGeoJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const text = await res.text();
  let fc;
  try { fc = JSON.parse(text); }
  catch (_) { throw new Error(`Response was not valid JSON (first 80 chars: "${text.slice(0, 80)}…")`); }
  // Validate basic GeoJSON shape — protects against the ArcGIS server
  // returning an HTML error page or an empty error object.
  if (fc.error) {
    throw new Error(`ArcGIS error ${fc.error.code}: ${fc.error.message}`);
  }
  if (fc.type !== 'FeatureCollection') {
    throw new Error(`Expected FeatureCollection, got ${JSON.stringify(fc.type)}`);
  }
  if (!Array.isArray(fc.features) || fc.features.length === 0) {
    throw new Error(`FeatureCollection has no features`);
  }
  return fc;
}

/**
 * Write atomically: stage to .tmp then rename. If the rename fails the
 * original file is untouched. The .tmp file is cleaned up either way.
 *
 * @param {string} destPath
 * @param {string} content
 */
function atomicWrite(destPath, content) {
  const tmp = destPath + '.tmp';
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, destPath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

/** @param {{featureCount:number,size:number,exists?:boolean}} before
 *  @param {{featureCount:number,size:number}} after */
function formatDelta(before, after) {
  if (!before.exists) {
    return `new file (${after.featureCount} features, ${formatBytes(after.size)})`;
  }
  const dfeat = after.featureCount - before.featureCount;
  const dsize = after.size - before.size;
  const featStr = dfeat === 0
    ? `${after.featureCount} features (no change)`
    : `${after.featureCount} features (${dfeat > 0 ? '+' : ''}${dfeat})`;
  const sizeStr = dsize === 0
    ? formatBytes(after.size)
    : `${formatBytes(after.size)} (${dsize > 0 ? '+' : ''}${formatBytes(Math.abs(dsize))})`;
  return `${featStr}, ${sizeStr}`;
}

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
