// Tests for scripts/validate-content.js — the content validator. We import
// the pure `validate` function (no I/O, no exit) and feed it hand-rolled
// hazards/actions documents covering happy paths and known-bad shapes.
//
// We also load the real content files and confirm the production data still
// passes (no errors). Acceptable warnings are documented inline.

import test from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const { validate } = await import('../scripts/validate-content.js');

// -- Fixture builders ---------------------------------------------------

function goodAction(overrides = {}) {
  return {
    id: 'a_good',
    title: { en: 'Good action' },
    description: { en: 'Description' },
    timeHorizon: 'right_now',
    hazardIds: ['hA'],
    appliesToSeverities: ['high'],
    sources: [{ label: 'Src', url: 'https://example.org' }],
    ...overrides,
  };
}

function goodHazard(overrides = {}) {
  return {
    id: 'hA',
    displayName: 'Hazard A',
    shortName: 'A',
    spatialKey: 'hA',
    zones: [{
      match: { field: 'z', equals: 'red' },
      severity: 'high',
      label: { en: 'Red zone' },
      oneLiner: { en: 'one' },
      plainExplanation: { en: 'expl' },
      actionIds: [],
    }],
    noMatch: {
      severity: 'none',
      label: { en: 'Not in zone' },
      oneLiner: { en: 'one' },
      plainExplanation: { en: 'expl' },
      actionIds: [],
    },
    authoritativeSources: [{ label: 'Source', url: 'https://example.org' }],
    dataProvenance: {},
    ...overrides,
  };
}

const wrap = (hazards, actions) => ({
  hazardsDoc: { hazards },
  actionsDoc: { actions },
});

// -- Happy path ---------------------------------------------------------

test('validate: minimal happy path with no content has no errors', () => {
  const { errors, warnings } = validate({ hazards: [] }, { actions: [] });
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

test('validate: one good hazard + one good action passes clean', () => {
  const { hazardsDoc, actionsDoc } = wrap([goodHazard()], [goodAction()]);
  const { errors, warnings } = validate(hazardsDoc, actionsDoc);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

// -- Action-level errors ------------------------------------------------

test('validate: action missing id reported as error', () => {
  const a = goodAction(); delete a.id;
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /missing id/i.test(m)), errors.join('\n'));
});

test('validate: action missing title.en reported', () => {
  const a = goodAction(); delete a.title;
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /title.en/.test(m)));
});

test('validate: action with invalid timeHorizon reported', () => {
  const a = goodAction({ timeHorizon: 'tomorrow' });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /timeHorizon/.test(m)));
});

test('validate: action with empty hazardIds reported', () => {
  const a = goodAction({ hazardIds: [] });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /hazardIds/.test(m)));
});

test('validate: action with invalid appliesToSeverities value reported', () => {
  const a = goodAction({ appliesToSeverities: ['catastrophic'] });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /appliesToSeverities/.test(m)));
});

test('validate: action with no sources is rejected', () => {
  const a = goodAction({ sources: [] });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /at least one source/i.test(m)));
});

test('validate: action with non-https source URL rejected', () => {
  const a = goodAction({ sources: [{ label: 'L', url: 'ftp://nope' }] });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /not http\(s\)/.test(m)));
});

test('validate: duplicate action id reported', () => {
  const { errors } = validate(
    { hazards: [] },
    { actions: [goodAction({ id: 'dup' }), goodAction({ id: 'dup' })] }
  );
  assert.ok(errors.some(m => /Duplicate action id/.test(m)));
});

// -- Requirements gating errors -----------------------------------------

test('validate: action with unknown requirements flag reported', () => {
  const a = goodAction({ requirements: { hasAlien: true } });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /unknown profile flag/.test(m)));
});

test('validate: requirements with non-boolean value reported', () => {
  const a = goodAction({ requirements: { hasInfant: 'yes' } });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /must be a boolean/.test(m)));
});

test('validate: empty requirements object warns (not errors)', () => {
  const a = goodAction({ requirements: {} });
  const { errors, warnings } = validate({ hazards: [] }, { actions: [a] });
  assert.equal(errors.length, 0);
  assert.ok(warnings.some(m => /empty requirements/.test(m)));
});

test('validate: requirements that is not an object is rejected', () => {
  const a = goodAction({ requirements: ['hasInfant'] });
  const { errors } = validate({ hazards: [] }, { actions: [a] });
  assert.ok(errors.some(m => /must be an object/.test(m)));
});

// -- Hazard-level errors ------------------------------------------------

test('validate: hazard missing id reported', () => {
  const h = goodHazard(); delete h.id;
  const { errors } = validate({ hazards: [h] }, { actions: [] });
  assert.ok(errors.some(m => /Hazard missing id/.test(m)));
});

test('validate: zone missing severity reported', () => {
  const h = goodHazard();
  h.zones[0].severity = 'extreme';
  const { errors } = validate({ hazards: [h] }, { actions: [] });
  assert.ok(errors.some(m => /severity invalid/.test(m)));
});

test('validate: zone referencing unknown actionId reported', () => {
  const h = goodHazard();
  h.zones[0].actionIds = ['nonexistent'];
  const { errors } = validate({ hazards: [h] }, { actions: [] });
  assert.ok(errors.some(m => /unknown actionId/.test(m)));
});

// -- Cross-reference warnings -------------------------------------------

test('validate: action referenced by zone but missing the hazardId warns', () => {
  // Action only lists hazardIds: ['otherHazard'], but it's referenced by hA's zone.
  const a = goodAction({ id: 'cross', hazardIds: ['otherHazard'] });
  const h = goodHazard();
  h.zones[0].actionIds = ['cross'];
  const { warnings } = validate({ hazards: [h] }, { actions: [a] });
  assert.ok(warnings.some(m => /doesn't list/.test(m)));
});

test('validate: zone references action whose severity gating excludes the zone (warn)', () => {
  const a = goodAction({ id: 'high_only', appliesToSeverities: ['high'] });
  const h = goodHazard();
  h.zones[0].severity = 'low';
  h.zones[0].actionIds = ['high_only'];
  const { warnings } = validate({ hazards: [h] }, { actions: [a] });
  assert.ok(warnings.some(m => /only applies to severities/.test(m)));
});

test('validate: action listing unknown hazardId warns', () => {
  const a = goodAction({ hazardIds: ['hA', 'ghost'] });
  const h = goodHazard();
  const { warnings } = validate({ hazards: [h] }, { actions: [a] });
  assert.ok(warnings.some(m => /unknown hazardId/.test(m)));
});

test('validate: _TODO marker warns but does not error', () => {
  const a = goodAction({ _TODO: 'come back to this' });
  const { errors, warnings } = validate({ hazards: [] }, { actions: [a] });
  assert.equal(errors.length, 0);
  assert.ok(warnings.some(m => /_TODO/.test(m)));
});

test('validate: shared dedupeKey across actions warns (intentional in our content)', () => {
  const a1 = goodAction({ id: 'a1', dedupeKey: 'shared' });
  const a2 = goodAction({ id: 'a2', dedupeKey: 'shared' });
  const { warnings } = validate({ hazards: [] }, { actions: [a1, a2] });
  assert.ok(warnings.some(m => /shared by multiple actions/.test(m)));
});

// -- Production content -------------------------------------------------

test('validate: real content/hazards.json + content/actions.json have zero errors', () => {
  const hz = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/hazards.json'), 'utf8'));
  const ac = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/actions.json'), 'utf8'));
  const { errors } = validate(hz, ac);
  assert.deepEqual(errors, [], `Real content has errors:\n  ${errors.join('\n  ')}`);
});
