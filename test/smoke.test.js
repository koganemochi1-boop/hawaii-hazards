import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupEnv } from './helpers/env.js';

test('smoke: test runner works and env helpers load', () => {
  const ls = setupEnv();
  ls.setItem('k', 'v');
  assert.equal(ls.getItem('k'), 'v');
  const g = /** @type {any} */ (globalThis);
  assert.equal(typeof g.turf.booleanPointInPolygon, 'function');
});
