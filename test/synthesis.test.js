// Tests for js/synthesis.js — the engine that turns spatial hits into a
// per-hazard summary and a deduplicated, prioritized action plan.
//
// Pattern: every test builds a small fixture content + a stubbed LayerManager
// that returns the polygons we want present at the test point. The engine's
// gating, sorting, dedupe, and cap logic is exercised in isolation.

import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupEnv } from './helpers/env.js';

setupEnv();

const { synthesize, ACTION_LIMITS } = await import('../js/synthesis.js');

// -- Fixture builders ---------------------------------------------------

// A polygon that contains every point on the planet — used to force a hit.
const WORLD_POLY = {
  type: 'Polygon',
  coordinates: [[[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]],
};

function feature(properties = {}) {
  return { type: 'Feature', properties, geometry: WORLD_POLY };
}

/**
 * Build a stub LayerManager that returns hazardId -> list of features.
 * Pass { hazardA: [feature(...), feature(...)], hazardB: [] }.
 */
function stubLM(featuresByHazard) {
  return {
    getFeaturesIntersecting: async (hazardId) => featuresByHazard[hazardId] || [],
  };
}

/**
 * Minimal hazard shape that satisfies the engine's needs.
 */
function makeHazard(id, zones, opts = {}) {
  return {
    id,
    displayName: opts.displayName || id,
    shortName: id,
    spatialKey: id,
    sortHint: opts.sortHint ?? 0,
    zones,
    noMatch: opts.noMatch || {
      severity: 'none',
      label: { en: `Not in ${id} zone` },
      oneLiner: { en: '' },
      plainExplanation: { en: '' },
      actionIds: [],
    },
    authoritativeSources: [],
    dataProvenance: {},
  };
}

function makeZone(matchField, matchValue, severity, actionIds = []) {
  return {
    match: { field: matchField, equals: matchValue },
    severity,
    label: { en: `${matchValue} zone` },
    oneLiner: { en: '' },
    plainExplanation: { en: '' },
    actionIds,
  };
}

function makeAction(id, opts = {}) {
  return {
    id,
    title: { en: id },
    description: { en: '' },
    timeHorizon: opts.timeHorizon || 'right_now',
    estimatedTime: opts.estimatedTime,
    hazardIds: opts.hazardIds || ['hazardA'],
    appliesToSeverities: opts.appliesToSeverities || ['low', 'moderate', 'high'],
    sources: [{ label: 's', url: 'https://example.org' }],
    ...(opts.requirements ? { requirements: opts.requirements } : {}),
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  };
}

const ANYWHERE = [0, 0];

// -- Per-hazard evaluation ----------------------------------------------

test('synthesize: empty hits → noMatch on every hazard, overall is none', async () => {
  const content = {
    hazards: [makeHazard('hazardA', [makeZone('z', 'high', 'high')])],
    actions: [],
  };
  const r = await synthesize(ANYWHERE, stubLM({}), content);
  assert.equal(r.overall, 'none');
  assert.equal(r.hazardSummaries.length, 1);
  assert.equal(r.hazardSummaries[0].severity, 'none');
  assert.equal(r.hazardSummaries[0].zone, content.hazards[0].noMatch);
});

test('synthesize: a single hit selects the matching zone definition', async () => {
  const content = {
    hazards: [makeHazard('hazardA', [
      makeZone('z', 'red', 'high'),
      makeZone('z', 'yellow', 'moderate'),
    ])],
    actions: [],
  };
  const lm = stubLM({ hazardA: [feature({ z: 'yellow' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.hazardSummaries[0].severity, 'moderate');
});

test('synthesize: highest-severity zone wins when multiple matching features hit', async () => {
  const content = {
    hazards: [makeHazard('hazardA', [
      makeZone('z', 'red', 'high'),
      makeZone('z', 'yellow', 'moderate'),
    ])],
    actions: [],
  };
  const lm = stubLM({ hazardA: [feature({ z: 'yellow' }), feature({ z: 'red' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.hazardSummaries[0].severity, 'high');
});

test('synthesize: a hit with no matching zone rule reports ok_unmatched_zone status', async () => {
  const content = {
    hazards: [makeHazard('hazardA', [makeZone('z', 'red', 'high')])],
    actions: [],
  };
  const lm = stubLM({ hazardA: [feature({ z: 'unmapped' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.hazardSummaries[0].status, 'ok_unmatched_zone');
  assert.equal(r.hazardSummaries[0].severity, 'none');
});

test('synthesize: layer-fetch failure marks hazard as unavailable', async () => {
  const content = {
    hazards: [makeHazard('hazardA', [makeZone('z', 'red', 'high')])],
    actions: [],
  };
  const lm = {
    getFeaturesIntersecting: async () => { throw new Error('network down'); },
  };
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.hazardSummaries[0].status, 'unavailable');
  assert.equal(r.hazardSummaries[0].error, 'network down');
});

// -- Sorting / overall --------------------------------------------------

test('synthesize: hazardSummaries sorted by severity desc then sortHint asc', async () => {
  const content = {
    hazards: [
      makeHazard('hA', [makeZone('z', 'hit', 'moderate')], { sortHint: 10 }),
      makeHazard('hB', [makeZone('z', 'hit', 'high')],     { sortHint: 20 }),
      makeHazard('hC', [makeZone('z', 'hit', 'high')],     { sortHint: 5 }),
    ],
    actions: [],
  };
  const lm = stubLM({
    hA: [feature({ z: 'hit' })],
    hB: [feature({ z: 'hit' })],
    hC: [feature({ z: 'hit' })],
  });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.deepEqual(r.hazardSummaries.map(s => s.hazardId), ['hC', 'hB', 'hA']);
});

test('synthesize: overall is the max severity across hazards', async () => {
  const content = {
    hazards: [
      makeHazard('hA', [makeZone('z', 'hit', 'low')]),
      makeHazard('hB', [makeZone('z', 'hit', 'high')]),
    ],
    actions: [],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })], hB: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.overall, 'high');
});

test('synthesize: unavailable hazards do not count toward overall severity', async () => {
  const content = {
    hazards: [
      makeHazard('hA', [makeZone('z', 'hit', 'low')]),
      makeHazard('hB', [makeZone('z', 'hit', 'high')]),
    ],
    actions: [],
  };
  // hB throws — only hA's "low" counts.
  const lm = {
    getFeaturesIntersecting: async (id) =>
      id === 'hA' ? [feature({ z: 'hit' })] : (() => { throw new Error('down'); })(),
  };
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.overall, 'low');
});

// -- Action plan: severity gating ---------------------------------------

test('synthesize: actions whose appliesToSeverities miss are filtered out', async () => {
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'low', ['a_high_only', 'a_any'])])],
    actions: [
      makeAction('a_high_only', { appliesToSeverities: ['high'] }),
      makeAction('a_any',       { appliesToSeverities: ['low', 'moderate', 'high'] }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  const ids = Object.values(r.plan).flat().map(e => e.action.id);
  assert.deepEqual(ids, ['a_any']);
});

test('synthesize: noMatch actions skip severity gate but still respect requirements', async () => {
  // noMatch zone severity is 'none' — its actionIds should still surface for
  // the always-on subset, regardless of action.appliesToSeverities (which only
  // lists low/mod/high).
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high')], {
      noMatch: {
        severity: 'none',
        label: { en: 'nope' }, oneLiner: { en: '' }, plainExplanation: { en: '' },
        actionIds: ['a_alerts'],
      },
    })],
    actions: [makeAction('a_alerts', { appliesToSeverities: ['low', 'moderate', 'high'] })],
  };
  const lm = stubLM({}); // no hit → noMatch
  const r = await synthesize(ANYWHERE, lm, content);
  const ids = Object.values(r.plan).flat().map(e => e.action.id);
  assert.deepEqual(ids, ['a_alerts']);
});

// -- Action plan: profile requirements gating ---------------------------

test('synthesize: requirements: {hasInfant:true} filters action out for non-infant households', async () => {
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_infant', 'a_any'])])],
    actions: [
      makeAction('a_infant', { requirements: { hasInfant: true } }),
      makeAction('a_any', {}),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.deepEqual(Object.values(r.plan).flat().map(e => e.action.id), ['a_any']);
});

test('synthesize: requirements: {hasInfant:true} surfaces action when household has infant', async () => {
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_infant', 'a_any'])])],
    actions: [
      makeAction('a_infant', { requirements: { hasInfant: true } }),
      makeAction('a_any', {}),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content, {
    profile: { ages: ['infant', 'adult'] },
  });
  const ids = Object.values(r.plan).flat().map(e => e.action.id);
  assert.deepEqual(ids.sort(), ['a_any', 'a_infant']);
});

test('synthesize: requirements: {hasInfant:false} requires the absence of the flag', async () => {
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_no_infant'])])],
    actions: [makeAction('a_no_infant', { requirements: { hasInfant: false } })],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const without = await synthesize(ANYWHERE, lm, content);
  const withInfant = await synthesize(ANYWHERE, lm, content, { profile: { ages: ['infant'] } });
  assert.equal(Object.values(without.plan).flat().length, 1);
  assert.equal(Object.values(withInfant.plan).flat().length, 0);
});

test('synthesize: multi-key requirements are AND', async () => {
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_compound'])])],
    actions: [
      makeAction('a_compound', { requirements: { hasInfant: true, isRenter: true } }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const onlyInfant = await synthesize(ANYWHERE, lm, content, { profile: { ages: ['infant'] } });
  const onlyRenter = await synthesize(ANYWHERE, lm, content, { profile: { tenure: 'renter' } });
  const both = await synthesize(ANYWHERE, lm, content, { profile: { ages: ['infant'], tenure: 'renter' } });
  assert.equal(Object.values(onlyInfant.plan).flat().length, 0);
  assert.equal(Object.values(onlyRenter.plan).flat().length, 0);
  assert.equal(Object.values(both.plan).flat().length, 1);
});

// -- Action plan: dedupe and merging ------------------------------------

test('synthesize: actions referenced by multiple hazards merge by dedupeKey', async () => {
  const content = {
    hazards: [
      makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_universal'])]),
      makeHazard('hB', [makeZone('z', 'hit', 'high', ['a_universal'])]),
    ],
    actions: [makeAction('a_universal', { dedupeKey: 'universal', hazardIds: ['hA', 'hB'] })],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })], hB: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  const entries = Object.values(r.plan).flat();
  assert.equal(entries.length, 1);
  assert.equal([...entries[0].hazards].sort().join(','), 'hA,hB');
});

// -- Action plan: sort tie-breakers -------------------------------------

test('synthesize: within a horizon, multi-hazard actions sort before single-hazard', async () => {
  const content = {
    hazards: [
      makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_one', 'a_two'])]),
      makeHazard('hB', [makeZone('z', 'hit', 'high', ['a_two'])]),
    ],
    actions: [
      makeAction('a_one', { hazardIds: ['hA'], estimatedTime: '5 minutes' }),
      makeAction('a_two', { hazardIds: ['hA', 'hB'], estimatedTime: '60 minutes' }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })], hB: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  // a_two hits 2 hazards; a_one hits 1. Even though a_one is faster, a_two wins.
  assert.deepEqual(r.plan.right_now.map(e => e.action.id), ['a_two', 'a_one']);
});

test('synthesize: with equal hazard count, faster actions sort first', async () => {
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', ['a_slow', 'a_fast'])])],
    actions: [
      makeAction('a_slow', { estimatedTime: '2 hours' }),
      makeAction('a_fast', { estimatedTime: '10 minutes' }),
    ],
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.deepEqual(r.plan.right_now.map(e => e.action.id), ['a_fast', 'a_slow']);
});

// -- Action plan: caps --------------------------------------------------

test('synthesize: each horizon is capped per ACTION_LIMITS', async () => {
  // Build N actions where N > the cap for right_now (4).
  const actionIds = Array.from({ length: 10 }, (_, i) => `a_${i}`);
  const content = {
    hazards: [makeHazard('hA', [makeZone('z', 'hit', 'high', actionIds)])],
    actions: actionIds.map(id => makeAction(id, { estimatedTime: '10 minutes' })),
  };
  const lm = stubLM({ hA: [feature({ z: 'hit' })] });
  const r = await synthesize(ANYWHERE, lm, content);
  assert.equal(r.plan.right_now.length, ACTION_LIMITS.right_now);
});

// -- profileFlags pass-through ------------------------------------------

test('synthesize: returns the derived profileFlags on the result', async () => {
  const content = { hazards: [], actions: [] };
  const r = await synthesize(ANYWHERE, stubLM({}), content, {
    profile: { ages: ['infant'], tenure: 'renter' },
  });
  assert.equal(r.profileFlags.hasInfant, true);
  assert.equal(r.profileFlags.isRenter, true);
  assert.equal(r.profileFlags.hasPet, false);
});
