// Tests for the two bugs v2.1.1 is fixing. These are intentionally written
// BEFORE the fix so they fail (capturing current broken behavior), then
// they pass after the fix lands.

import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupEnv } from './helpers/env.js';

setupEnv();

const { synthesize, ACTION_LIMITS } = await import('../js/synthesis.js');

// -- Shared fixture helpers (copies of the patterns in synthesis.test.js;
//    inlined here so this file is independent and the bug capture is
//    self-contained).

const WORLD_POLY = {
  type: 'Polygon',
  coordinates: [[[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]],
};
const feature = (properties = {}) => ({ type: 'Feature', properties, geometry: WORLD_POLY });
const stubLM  = (byHazard) => ({
  getFeaturesIntersecting: async (id) => byHazard[id] || [],
});
const makeHazard = (id, zones, opts = {}) => ({
  id, displayName: id, shortName: id, spatialKey: id,
  sortHint: opts.sortHint ?? 0,
  zones,
  noMatch: { severity: 'none', label: { en: '' }, oneLiner: { en: '' }, plainExplanation: { en: '' }, actionIds: [] },
  authoritativeSources: [], dataProvenance: {},
});
const makeZone = (matchField, matchValue, severity, actionIds = []) => ({
  match: { field: matchField, equals: matchValue },
  severity,
  label: { en: '' }, oneLiner: { en: '' }, plainExplanation: { en: '' },
  actionIds,
});
const makeAction = (id, opts = {}) => ({
  id,
  title: { en: id },
  description: { en: '' },
  timeHorizon: opts.timeHorizon || 'this_week',
  estimatedTime: opts.estimatedTime,
  hazardIds: opts.hazardIds || ['hA'],
  appliesToSeverities: opts.appliesToSeverities || ['low', 'moderate', 'high'],
  sources: [{ label: 's', url: 'https://example.org' }],
  ...(opts.requirements ? { requirements: opts.requirements } : {}),
  ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  ...(opts.pinned ? { pinned: opts.pinned } : {}),
});
const ANYWHERE = [0, 0];

// =====================================================================
//   BUG 1: build_emergency_kit (and other foundational universals) get
//   pushed out of the action plan when enough profile-gated actions sort
//   ahead of them and the cap fires.
//
//   Fix: a `pinned: true` field on actions; pinned entries are guaranteed
//   slots in their horizon's cap (i.e. they're kept first, then the cap
//   takes the next-best regular entries to fill remaining slots).
// =====================================================================

test('BUG 1: a pinned action survives even when the cap fires from other matches', async () => {
  // Construct: cap for this_week is 6. Put 7 actions eligible for the same
  // zone, one of which is the pinned "build_emergency_kit"-style action with
  // a longer estimatedTime so the sort would normally push it past the cap.
  const cap = ACTION_LIMITS.this_week;
  const fillIds = Array.from({ length: cap }, (_, i) => `fast_${i}`);
  const allIds = [...fillIds, 'kit_pinned'];

  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', allIds)])],
    actions: [
      ...fillIds.map(id => makeAction(id, { timeHorizon: 'this_week', estimatedTime: '10 minutes' })),
      makeAction('kit_pinned', {
        timeHorizon: 'this_week',
        estimatedTime: '2 hours', // would lose the time tie-breaker
        pinned: true,
      }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);

  const ids = r.plan.this_week.map(e => e.action.id);
  assert.ok(ids.includes('kit_pinned'),
    `Expected kit_pinned in plan, got: ${ids.join(', ')}`);
  // Cap still enforced.
  assert.equal(r.plan.this_week.length, cap);
});

test('BUG 1: pinned action that fails its severity gate is still excluded', async () => {
  // Pinning protects against cap-eviction, not against severity gating.
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'low', ['high_only'])])],
    actions: [
      makeAction('high_only', { pinned: true, appliesToSeverities: ['high'] }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(Object.values(r.plan).flat().length, 0,
    'Pinning must not bypass severity gating');
});

test('BUG 1: pinned action that fails its requirements gate is still excluded', async () => {
  // Pinning protects against cap-eviction, not against requirements gating.
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['needs_infant'])])],
    actions: [
      makeAction('needs_infant', { pinned: true, requirements: { hasInfant: true } }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(Object.values(r.plan).flat().length, 0,
    'Pinning must not bypass requirements gating');
});

// =====================================================================
//   BUG 2: `matchedRequirements` is computed only on first dedupe-key
//   encounter and never updated. So if a no-requirements action is added
//   first and a requires-something action merges in later, the entry
//   reports matchedRequirements=false even though a personalized action
//   contributed.
//
//   Fix: when merging an action that has non-empty requirements, set
//   `matchedRequirements = true` on the merged entry.
// =====================================================================

test('BUG 2: matchedRequirements is true when ANY merged action had matching requirements', async () => {
  // Two actions sharing dedupeKey. One has no requirements (added first),
  // one requires hasInfant (would merge in second). User has an infant.
  // Expected: matchedRequirements = true.
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['universal', 'for_infant'])])],
    actions: [
      // Order matters: universal is listed first, so it lands in `merged`
      // before for_infant has a chance.
      makeAction('universal', { dedupeKey: 'shared' }),
      makeAction('for_infant', { dedupeKey: 'shared', requirements: { hasInfant: true } }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content, { profile: { ages: ['infant'] } });

  const entries = Object.values(r.plan).flat();
  assert.equal(entries.length, 1, 'Both actions should collapse via dedupeKey');
  assert.equal(entries[0].matchedRequirements, true,
    'matchedRequirements should reflect that a personalized action contributed');
});

test('BUG 2: matchedRequirements stays false when no merged action had requirements', async () => {
  // Sanity check: when there's truly no personalization at play, the flag
  // should remain false.
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['a'])])],
    actions: [makeAction('a')],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  const entries = Object.values(r.plan).flat();
  assert.equal(entries[0].matchedRequirements, false);
});
