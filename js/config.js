// Hazard layer configuration. Single source of truth for the layer list,
// rendering, popups, legend, and risk scoring.

export const HAWAII_BOUNDS = [[-161.0, 18.5], [-154.4, 22.7]];

export const HAWAII_CENTER = [-157.5, 20.7];
export const HAWAII_DEFAULT_ZOOM = 6.6;

// Risk weights sum to ~1.0. Composite point risk = Σ(weight * score) where score ∈ [0,1].
export const RISK_BUCKETS = [
  { max: 0.001, label: 'None', cls: 'risk-none' },
  { max: 0.15,  label: 'Low', cls: 'risk-low' },
  { max: 0.35,  label: 'Moderate', cls: 'risk-moderate' },
  { max: 0.60,  label: 'High', cls: 'risk-high' },
  { max: 0.85,  label: 'Severe', cls: 'risk-severe' },
  { max: 1.01,  label: 'Extreme', cls: 'risk-extreme' },
];

const BASE_HAZARDS_URL = 'https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer';

// Each hazard layer:
//   sourceType: 'bundled' | 'live'
//   url: GeoJSON path (bundled) or ArcGIS MapServer layer endpoint (live)
//   styleType: 'categorical-fill' | 'graduated-fill' | 'solid-fill'
//   colorMap: how to color features (depends on styleType)
//   popup: { title, fields: [{field, label, transform?}] }
//   legend: [{label, color}]
//   risk: { weight, score: fn(props) -> 0..1 }
//   minZoom: minimum zoom to load (live layers only)
export const HAZARDS = [
  {
    id: 'tsunami',
    name: 'Tsunami Evacuation Zones',
    sourceType: 'bundled',
    url: '../data/tsunami-evac.geojson',
    styleType: 'categorical-fill',
    colorMap: {
      field: 'zone_type',
      values: {
        'Extreme Tsunami Evacuation Zone': '#7e2a8e',
        'Tsunami Evacuation Zone': '#b06ab3',
      },
      fallback: '#b06ab3',
    },
    fillOpacity: 0.45,
    // Render only evacuation zones, not "Safe Zone" features (which also
    // exist in the source dataset). Point queries still see them.
    renderFilter: ['!=', ['get', 'zone_type'], 'Tsunami Safe Zone'],
    popup: {
      title: 'Tsunami Evacuation Zone',
      fields: [
        { field: 'zone_type', label: 'Zone' },
        { field: 'island', label: 'Island' },
        { field: 'evac_zone', label: 'Evac zone' },
        { field: 'mapname', label: 'Map' },
      ],
    },
    legend: [
      { label: 'Standard tsunami evac zone', color: '#b06ab3' },
      { label: 'Extreme tsunami evac zone',  color: '#7e2a8e' },
    ],
    risk: {
      weight: 0.20,
      score: (p) => {
        const t = (p.zone_type || '').toLowerCase();
        if (t.includes('extreme')) return 1.0;
        if (t.includes('safe')) return 0;
        if (t.includes('evacuation')) return 0.7;
        return 0;
      },
    },
  },

  {
    id: 'lava',
    name: 'Lava Flow Hazard Zones (USGS)',
    sourceType: 'bundled',
    url: '../data/lava-zones.geojson',
    styleType: 'graduated-fill',
    colorMap: {
      field: 'hzone',
      // USGS 1 (highest hazard) → 9 (lowest)
      scale: {
        '1': '#7f0000',
        '2': '#b30000',
        '3': '#d7301f',
        '4': '#ef6548',
        '5': '#fc8d59',
        '6': '#fdbb84',
        '7': '#fdd49e',
        '8': '#fee8c8',
        '9': '#fff7ec',
      },
      fallback: '#fdd49e',
    },
    fillOpacity: 0.55,
    popup: {
      title: 'Lava Flow Hazard Zone',
      fields: [
        { field: 'hzone', label: 'USGS hazard zone', transform: (v) => `Zone ${v} (1=highest, 9=lowest)` },
        { field: 'mzone', label: 'Mountain zone' },
      ],
    },
    legend: [
      { label: 'Zone 1 (highest)', color: '#7f0000' },
      { label: 'Zone 2', color: '#b30000' },
      { label: 'Zone 3', color: '#d7301f' },
      { label: 'Zone 4', color: '#ef6548' },
      { label: 'Zone 5', color: '#fc8d59' },
      { label: 'Zone 6', color: '#fdbb84' },
      { label: 'Zone 7', color: '#fdd49e' },
      { label: 'Zone 8', color: '#fee8c8' },
      { label: 'Zone 9 (lowest)', color: '#fff7ec' },
    ],
    risk: {
      weight: 0.25,
      score: (p) => {
        const z = parseInt(p.hzone, 10);
        if (!z) return 0;
        // Zone 1=1.0, Zone 9=0.05 with a smooth ramp
        const table = { 1: 1.0, 2: 0.9, 3: 0.75, 4: 0.55, 5: 0.4, 6: 0.25, 7: 0.15, 8: 0.1, 9: 0.05 };
        return table[z] ?? 0;
      },
    },
  },

  {
    id: 'dfirm',
    name: 'FEMA Flood Zones (DFIRM)',
    sourceType: 'live',
    url: `${BASE_HAZARDS_URL}/6`,
    minZoom: 10,
    queryFields: 'objectid,fld_zone,zone_subty,sfha_tf,static_bfe,dfirm_id',
    styleType: 'categorical-fill',
    colorMap: {
      field: 'fld_zone',
      // Color groups by zone code prefix; see normalizer below.
      values: {
        'VE': '#7b1d6f',   // Coastal high-hazard
        'V':  '#7b1d6f',
        'AE': '#185fa2',   // 100-yr w/ BFE
        'A':  '#2e86de',   // 100-yr
        'AH': '#2e86de',
        'AO': '#3d9be8',
        'X':  '#a0c4ff',   // 500-yr / minimal
        'D':  '#cccccc',   // Undetermined
      },
      fallback: '#a0c4ff',
    },
    fillOpacity: 0.35,
    popup: {
      title: 'FEMA Flood Zone',
      fields: [
        { field: 'fld_zone', label: 'Zone' },
        { field: 'zone_subty', label: 'Subtype' },
        { field: 'sfha_tf', label: 'SFHA' },
        { field: 'static_bfe', label: 'Base Flood Elev.', transform: (v) => (v && v !== -9999 ? `${v} ft` : '—') },
      ],
    },
    legend: [
      { label: 'V / VE — coastal high hazard', color: '#7b1d6f' },
      { label: 'A / AE — 100-yr floodplain',   color: '#185fa2' },
      { label: 'AO / AH — shallow flooding',   color: '#3d9be8' },
      { label: 'X — 500-yr / minimal',         color: '#a0c4ff' },
      { label: 'D — undetermined',             color: '#cccccc' },
    ],
    risk: {
      weight: 0.20,
      score: (p) => {
        const z = (p.fld_zone || '').toUpperCase().trim();
        const sub = (p.zone_subty || '').toUpperCase();
        if (z === 'V' || z === 'VE') return 1.0;
        if (['A', 'AE', 'AH', 'AO'].includes(z)) return 0.75;
        if (z === 'X' && sub.includes('500')) return 0.3;
        if (z === 'X') return 0.1;
        return 0;
      },
    },
  },

  {
    id: 'fire',
    name: 'Wildfire Risk Areas',
    sourceType: 'live',
    url: `${BASE_HAZARDS_URL}/7`,
    minZoom: 7,
    queryFields: 'objectid,commu_name,island,risk_rating,zone',
    styleType: 'categorical-fill',
    colorMap: {
      field: 'risk_rating',
      values: {
        'High':   '#c0392b',
        'Medium': '#e67e22',
        'Low':    '#f1c40f',
      },
      fallback: '#e67e22',
    },
    fillOpacity: 0.4,
    popup: {
      title: 'Wildfire Risk Area',
      fields: [
        { field: 'commu_name', label: 'Community' },
        { field: 'island', label: 'Island' },
        { field: 'risk_rating', label: 'Risk rating' },
      ],
    },
    legend: [
      { label: 'High risk',   color: '#c0392b' },
      { label: 'Medium risk', color: '#e67e22' },
      { label: 'Low risk',    color: '#f1c40f' },
    ],
    risk: {
      weight: 0.15,
      score: (p) => {
        const r = (p.risk_rating || '').toLowerCase();
        if (r === 'high') return 1.0;
        if (r === 'medium') return 0.6;
        if (r === 'low') return 0.3;
        return 0;
      },
    },
  },

  {
    id: 'slr',
    name: 'Sea Level Rise + Coastal Flood (3.2 ft)',
    sourceType: 'live',
    url: `${BASE_HAZARDS_URL}/15`,
    minZoom: 6,
    queryFields: 'objectid,zone',
    styleType: 'solid-fill',
    colorMap: {
      color: '#1a8acb',
    },
    fillOpacity: 0.45,
    popup: {
      title: 'Coastal Flood + Sea Level Rise',
      fields: [
        { field: 'zone', label: 'Zone type' },
      ],
      note: 'Hawaiʻi statewide 1% annual coastal flood with 3.2 ft sea level rise scenario. ' +
            'Used here as the de facto hurricane storm-surge proxy (Hawaiʻi does not publish SLOSH vector maps).',
    },
    legend: [
      { label: '1% coastal flood + 3.2 ft SLR', color: '#1a8acb' },
    ],
    risk: {
      weight: 0.20,
      score: () => 1.0,
    },
  },
];

// Quick lookup
export const HAZARDS_BY_ID = Object.fromEntries(HAZARDS.map(h => [h.id, h]));
