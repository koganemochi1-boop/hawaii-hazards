import { HAZARDS, RISK_BUCKETS } from './config.js';

/**
 * Scores a point against all hazards, returning per-hazard hits and a composite score.
 *   lngLat: [lng, lat]
 *   layerManager: LayerManager instance
 *   options: { onlyActive: bool } — if true, only score layers currently turned on
 */
export async function scorePoint(lngLat, layerManager, { onlyActive = false } = {}) {
  const point = turf.point(lngLat);
  const [lng, lat] = lngLat;
  const tiny = 0.0005; // ~50m envelope around point for live queries
  const bbox = [lng - tiny, lat - tiny, lng + tiny, lat + tiny];

  const results = [];

  for (const hazard of HAZARDS) {
    if (onlyActive && !layerManager.isActive(hazard.id)) continue;

    let hits = [];
    try {
      const features = await layerManager.getFeaturesIntersecting(hazard.id, bbox);
      hits = features.filter(f => safeBooleanPointInPolygon(point, f));
    } catch (e) {
      console.warn(`scorePoint(${hazard.id}) failed:`, e);
    }

    let score = 0;
    let topFeature = null;
    for (const f of hits) {
      const s = hazard.risk.score(f.properties || {});
      if (s > score) { score = s; topFeature = f; }
    }

    results.push({
      hazardId: hazard.id,
      hazardName: hazard.name,
      hit: hits.length > 0,
      score,
      weighted: score * hazard.risk.weight,
      topFeature,
      hazard,
    });
  }

  const composite = results.reduce((sum, r) => sum + r.weighted, 0);
  const bucket = bucketFor(composite);

  return { results, composite, bucket };
}

export function bucketFor(score) {
  for (const b of RISK_BUCKETS) {
    if (score <= b.max) return b;
  }
  return RISK_BUCKETS[RISK_BUCKETS.length - 1];
}

/**
 * Polygon analysis: for a drawn polygon, compute, per hazard:
 *   - total area of the polygon intersecting hazard features (m²)
 *   - percent of polygon covered
 *   - max risk score seen
 *   - hazard subzones encountered (set of categorical values)
 */
export async function scorePolygon(polygon, layerManager) {
  const polyBbox = turf.bbox(polygon);
  const polyAreaM2 = turf.area(polygon);

  const out = [];

  for (const hazard of HAZARDS) {
    let features = [];
    try {
      features = await layerManager.getFeaturesIntersecting(hazard.id, polyBbox);
    } catch (e) {
      console.warn(`scorePolygon(${hazard.id}) failed:`, e);
    }

    let coverM2 = 0;
    let maxScore = 0;
    const categories = new Set();
    const catField = hazard.colorMap?.field || hazard.popup?.fields?.[0]?.field;

    for (const feat of features) {
      let inter = null;
      try {
        if (feat.geometry?.type?.includes('Polygon')) {
          inter = turf.intersect(turf.featureCollection([polygon, feat]));
        }
      } catch (_) { /* turf can throw on invalid geometries; skip */ }
      if (!inter) continue;

      coverM2 += turf.area(inter);
      const s = hazard.risk.score(feat.properties || {});
      if (s > maxScore) maxScore = s;
      if (catField && feat.properties?.[catField] != null) {
        categories.add(String(feat.properties[catField]));
      }
    }

    out.push({
      hazardId: hazard.id,
      hazardName: hazard.name,
      coverM2,
      coverPct: polyAreaM2 > 0 ? (coverM2 / polyAreaM2) * 100 : 0,
      maxScore,
      weighted: maxScore * hazard.risk.weight,
      categories: [...categories],
      hazard,
    });
  }

  const composite = out.reduce((s, r) => s + r.weighted, 0);
  return { results: out, composite, bucket: bucketFor(composite), polyAreaM2 };
}

function safeBooleanPointInPolygon(point, feature) {
  if (!feature.geometry) return false;
  const t = feature.geometry.type;
  try {
    if (t === 'Polygon' || t === 'MultiPolygon') {
      return turf.booleanPointInPolygon(point, feature);
    }
  } catch (_) { return false; }
  return false;
}
