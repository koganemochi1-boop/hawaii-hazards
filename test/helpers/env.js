// Test environment helpers.
//
// Sets up the minimum browser-like globals the app code expects (window,
// localStorage, turf) so we can import js/profile.js and js/synthesis.js
// directly under node --test. Call setupEnv() BEFORE importing the modules
// under test — ES module imports are evaluated immediately and cached, so
// you can't fake globals after the fact.

import { booleanPointInPolygon as turfBooleanPointInPolygon, point as turfPoint } from './turf-min.js';

/** Build a fake localStorage backed by an in-memory Map. */
export function makeFakeStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    _store: store,
  };
}

/** Install fake window + localStorage + turf onto globalThis. Idempotent. */
export function setupEnv() {
  if (!globalThis.window) {
    globalThis.window = { localStorage: makeFakeStorage() };
  }
  if (!globalThis.turf) {
    globalThis.turf = {
      point: turfPoint,
      booleanPointInPolygon: turfBooleanPointInPolygon,
    };
  }
  return globalThis.window.localStorage;
}

/** Reset the in-memory localStorage between tests. */
export function clearStorage() {
  if (globalThis.window?.localStorage?.clear) {
    globalThis.window.localStorage.clear();
  }
}
