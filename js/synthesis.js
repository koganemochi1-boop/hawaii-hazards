// Synthesis engine — given an address point, returns a per-hazard summary
// (severity + zone copy) and a deduplicated, prioritized action plan.
//
//   synthesize(lngLat, layerManager, content, { profile }) -> {
//     hazardSummaries: [{ hazardId, hazard, zone, severity, status, matchedFeature, error? }, ...],
//     overall: 'none' | 'low' | 'moderate' | 'high',
//     plan: {
//       right_now:  [{ action, hazards: Set<hazardId>, maxSeverity }, ...],
//       this_week:  [...],
//       this_month: [...],
//     },
//     profileFlags: { hasInfant: bool, hasPet: bool, ... }
//   }
//
// `profile` is the household-profile object from js/profile.js (or null/undefined
// for a non-personalized report). The engine derives boolean flags via
// profileFlags() and filters actions whose `requirements` block does not match.
// Actions without a `requirements` block always pass the gate.

import { profileFlags } from './profile.js';

const SEVERITY_RANK = { none: 0, low: 1, moderate: 2, high: 3 };

// Tiny envelope used for the underlying bbox-based point lookup. Small enough
// that the live ArcGIS service does a true point intersection; large enough to
// avoid floating-point edge cases on polygon boundaries.
const TINY_ENVELOPE_DEG = 0.0005;

// Resident-facing caps per time horizon. The engine returns all applicable
// actions ranked, then trims to these limits so the report stays scannable.
export const ACTION_LIMITS = {
  right_now: 4,
  this_week: 6,
  this_month: 8,
};

export async function synthesize(lngLat, layerManager, content, options = {}) {
  if (!Array.isArray(content?.hazards)) {
    throw new Error('synthesize: content.hazards is required');
  }
  if (!Array.isArray(content?.actions)) {
    throw new Error('synthesize: content.actions is required');
  }

  const flags = profileFlags(options.profile || null);

  const hazardSummaries = await Promise.all(
    content.hazards.map(hazard => evaluateHazard(hazard, lngLat, layerManager))
  );

  hazardSummaries.sort(bySeverityThenSortHint);

  const overall = maxSeverity(hazardSummaries);
  const plan = buildActionPlan(hazardSummaries, content.actions, flags);

  return {
    hazardSummaries,
    overall,
    plan,
    profileFlags: flags,
    queriedAt: new Date().toISOString(),
  };
}

// -- Per-hazard evaluation -------------------------------------------------

async function evaluateHazard(hazard, lngLat, layerManager) {
  const spatialKey = hazard.spatialKey;
  if (!spatialKey) {
    return makeSummary(hazard, hazard.noMatch, null, 'ok');
  }

  const [lng, lat] = lngLat;
  const bbox = [
    lng - TINY_ENVELOPE_DEG, lat - TINY_ENVELOPE_DEG,
    lng + TINY_ENVELOPE_DEG, lat + TINY_ENVELOPE_DEG,
  ];
  const point = turf.point(lngLat);

  let candidateFeatures = [];
  try {
    candidateFeatures = await layerManager.getFeaturesIntersecting(spatialKey, bbox);
  } catch (err) {
    return {
      hazardId: hazard.id,
      hazard,
      zone: null,
      severity: 'none',
      status: 'unavailable',
      error: err?.message || String(err),
      matchedFeature: null,
    };
  }

  const hits = candidateFeatures.filter(f => safeBooleanPointInPolygon(point, f));
  if (hits.length === 0) {
    return makeSummary(hazard, hazard.noMatch, null, 'ok');
  }

  // For each hit feature, find the zone whose match rule applies, then keep
  // the highest-severity zone across all hits.
  let bestZone = null;
  let bestRank = -1;
  let bestFeature = null;
  for (const feat of hits) {
    const zone = findMatchingZone(hazard, feat);
    if (!zone) continue;
    const rank = SEVERITY_RANK[zone.severity] ?? 0;
    if (rank > bestRank) {
      bestZone = zone;
      bestRank = rank;
      bestFeature = feat;
    }
  }

  // Hit but no zone rule matched — this indicates a content gap. Surface as
  // a noMatch (with a different status flag so callers can distinguish).
  if (!bestZone) {
    return makeSummary(hazard, hazard.noMatch, hits[0], 'ok_unmatched_zone');
  }

  return makeSummary(hazard, bestZone, bestFeature, 'ok');
}

function findMatchingZone(hazard, feature) {
  const props = feature.properties || {};
  for (const zone of hazard.zones || []) {
    const field = zone.match?.field;
    const equals = zone.match?.equals;
    if (field == null || equals == null) continue;
    if (String(props[field]) === String(equals)) return zone;
  }
  return null;
}

function makeSummary(hazard, zone, matchedFeature, status) {
  return {
    hazardId: hazard.id,
    hazard,
    zone,
    severity: zone?.severity ?? 'none',
    status,
    matchedFeature,
  };
}

function safeBooleanPointInPolygon(point, feature) {
  if (!feature?.geometry) return false;
  const t = feature.geometry.type;
  try {
    if (t === 'Polygon' || t === 'MultiPolygon') {
      return turf.booleanPointInPolygon(point, feature);
    }
  } catch (_) { return false; }
  return false;
}

// -- Summary aggregation ---------------------------------------------------

function bySeverityThenSortHint(a, b) {
  const diff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
  if (diff !== 0) return diff;
  return (a.hazard.sortHint ?? 999) - (b.hazard.sortHint ?? 999);
}

function maxSeverity(summaries) {
  let best = 'none';
  let bestRank = 0;
  for (const s of summaries) {
    if (s.status !== 'ok' && s.status !== 'ok_unmatched_zone') continue;
    const rank = SEVERITY_RANK[s.severity] ?? 0;
    if (rank > bestRank) { best = s.severity; bestRank = rank; }
  }
  return best;
}

// -- Action plan -----------------------------------------------------------

function buildActionPlan(hazardSummaries, actions, flags) {
  const actionsById = new Map(actions.map(a => [a.id, a]));
  // dedupeKey -> { action, hazards: Set, maxSeverityRank, matchedRequirements: boolean }
  const merged = new Map();

  for (const summary of hazardSummaries) {
    if (!summary.zone) continue;
    if (summary.status !== 'ok' && summary.status !== 'ok_unmatched_zone') continue;

    const isNoMatch = summary.zone === summary.hazard.noMatch;
    const actionIds = summary.zone.actionIds || [];

    for (const actionId of actionIds) {
      const action = actionsById.get(actionId);
      if (!action) continue;

      // appliesToSeverities gates actions for matched zones. For the noMatch
      // block, the hazard author already chose the always-on subset, so we
      // skip the severity gate.
      if (!isNoMatch) {
        if (!action.appliesToSeverities?.includes(summary.severity)) continue;
      }

      // Profile requirements gate: every listed flag must match the household
      // profile (true = required-present, false = required-absent). Actions
      // without a requirements block always pass.
      if (!meetsRequirements(action, flags)) continue;

      const key = action.dedupeKey || action.id;
      const entry = merged.get(key);
      const rank = SEVERITY_RANK[summary.severity] ?? 0;
      if (!entry) {
        merged.set(key, {
          action,
          hazards: new Set([summary.hazardId]),
          maxSeverityRank: rank,
          matchedRequirements: action.requirements != null && Object.keys(action.requirements).length > 0,
        });
      } else {
        entry.hazards.add(summary.hazardId);
        if (rank > entry.maxSeverityRank) entry.maxSeverityRank = rank;
      }
    }
  }

  const plan = { right_now: [], this_week: [], this_month: [] };
  for (const entry of merged.values()) {
    const horizon = entry.action.timeHorizon;
    if (plan[horizon]) plan[horizon].push(entry);
  }

  for (const horizon of Object.keys(plan)) {
    plan[horizon].sort(byPlanRank);
    const cap = ACTION_LIMITS[horizon];
    if (cap && plan[horizon].length > cap) plan[horizon] = plan[horizon].slice(0, cap);
  }

  return plan;
}

/**
 * True if the action's requirements block is satisfied by the household
 * profile flags. Action with no requirements always passes. Flag set to
 * true means "household must have it"; flag set to false means
 * "household must lack it."
 */
function meetsRequirements(action, flags) {
  const req = action.requirements;
  if (!req || typeof req !== 'object') return true;
  for (const [flag, required] of Object.entries(req)) {
    const have = !!flags?.[flag];
    if (have !== required) return false;
  }
  return true;
}

function byPlanRank(a, b) {
  // 1. Number of hazards addressed, descending — multi-hazard wins first.
  if (b.hazards.size !== a.hazards.size) return b.hazards.size - a.hazards.size;
  // 2. Max severity rank descending.
  if (b.maxSeverityRank !== a.maxSeverityRank) return b.maxSeverityRank - a.maxSeverityRank;
  // 3. Estimated time ascending — quick wins before slow ones.
  const aTime = parseEstimatedTime(a.action.estimatedTime);
  const bTime = parseEstimatedTime(b.action.estimatedTime);
  if (aTime !== bTime) return aTime - bTime;
  // 4. Alphabetical by title (en).
  return localized(a.action.title).localeCompare(localized(b.action.title));
}

function parseEstimatedTime(s) {
  if (!s) return 9999;
  const lower = String(s).toLowerCase();
  if (lower.includes('ongoing')) return 9999;
  const m = lower.match(/(\d+)\s*(min|hour|hr|day)/);
  if (!m) return 9999;
  const n = parseInt(m[1], 10);
  if (/day/.test(m[2])) return n * 1440;
  if (/hour|hr/.test(m[2])) return n * 60;
  return n;
}

// -- Locale helper ---------------------------------------------------------

export function localized(obj, locale = 'en') {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[locale] ?? obj.en ?? '';
}
