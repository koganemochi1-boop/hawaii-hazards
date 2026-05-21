// Tests for js/profile.js — localStorage round-trip, flag derivation, and the
// is-the-profile-meaningful check.

import test, { beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { setupEnv, clearStorage } from './helpers/env.js';

setupEnv();

// Import after env is set up so module-level code sees window.localStorage.
const { loadProfile, saveProfile, clearProfile, profileFlags, isProfileActive } =
  await import('../js/profile.js');

beforeEach(() => clearStorage());

// -- loadProfile / saveProfile / clearProfile ---------------------------

test('loadProfile returns null when nothing is stored', () => {
  assert.equal(loadProfile(), null);
});

test('saveProfile then loadProfile round-trips', () => {
  /** @type {Profile} */
  const p = { householdSize: 4, ages: ['infant', 'adult'], pets: ['dog'] };
  assert.equal(saveProfile(p), true);
  const back = loadProfile();
  assert.ok(back, 'expected profile after save');
  assert.equal(back.householdSize, 4);
  assert.deepEqual(back.ages, ['infant', 'adult']);
  assert.deepEqual(back.pets, ['dog']);
});

test('saveProfile strips empty/null/undefined/[] fields before storing', () => {
  // Test cast: we deliberately pass shape-invalid values to verify stripping.
  saveProfile(/** @type {any} */ ({
    householdSize: 2,
    ages: [],          // empty array → drop
    pets: null,        // null → drop
    mobility: '',      // empty string → drop
    vehicle: undefined,// undefined → drop
    homeType: 'apartment',
  }));
  const back = loadProfile();
  assert.ok(back, 'expected profile after save');
  assert.equal(back.householdSize, 2);
  assert.equal(back.homeType, 'apartment');
  assert.equal('ages' in back, false);
  assert.equal('pets' in back, false);
  assert.equal('mobility' in back, false);
  assert.equal('vehicle' in back, false);
});

test('saveProfile stamps _schemaVersion: 1', () => {
  saveProfile({ householdSize: 3 });
  const back = loadProfile();
  assert.ok(back);
  assert.equal(back._schemaVersion, 1);
});

test('clearProfile removes the saved profile', () => {
  saveProfile({ householdSize: 5 });
  assert.equal(clearProfile(), true);
  assert.equal(loadProfile(), null);
});

test('loadProfile returns null when stored under a different schema version', () => {
  // Simulate a future-version profile written by a newer client.
  globalThis.window.localStorage.setItem(
    'hi-hazards/household-profile-v1',
    JSON.stringify({ _schemaVersion: 99, householdSize: 5 })
  );
  assert.equal(loadProfile(), null);
});

test('loadProfile returns null when stored value is unparseable JSON', () => {
  globalThis.window.localStorage.setItem('hi-hazards/household-profile-v1', '{not-json');
  assert.equal(loadProfile(), null);
});

// -- profileFlags -------------------------------------------------------

test('profileFlags(null) returns all-false flags with language defaulted to "en"', () => {
  const f = profileFlags(null);
  assert.equal(f.hasInfant, false);
  assert.equal(f.hasPet, false);
  assert.equal(f.hasMobilityNeeds, false);
  assert.equal(f.powerDependentMedical, false);
  assert.equal(f.noVehicle, false);
  assert.equal(f.isRenter, false);
  assert.equal(f.isOwner, false);
  assert.equal(f.isSingleFamily, false);
  assert.equal(f.isApartmentOrCondo, false);
  assert.equal(f.language, 'en');
});

test('profileFlags derives age flags from ages array', () => {
  const f = profileFlags({ ages: ['infant', 'senior'] });
  assert.equal(f.hasInfant, true);
  assert.equal(f.hasSenior, true);
  assert.equal(f.hasYoungChild, false);
  assert.equal(f.hasSchoolAge, false);
  assert.equal(f.hasTeen, false);
});

test('profileFlags derives pet flags from pets array', () => {
  const f = profileFlags({ pets: ['dog'] });
  assert.equal(f.hasPet, true);
  assert.equal(f.hasDog, true);
  assert.equal(f.hasCat, false);

  const both = profileFlags({ pets: ['dog', 'cat'] });
  assert.equal(both.hasPet, true);
  assert.equal(both.hasDog, true);
  assert.equal(both.hasCat, true);
});

test('profileFlags derives mobility flags from the mobility string', () => {
  assert.equal(profileFlags({ mobility: 'none' }).hasMobilityNeeds, false);
  assert.equal(profileFlags({ mobility: 'walking_aid' }).hasMobilityNeeds, true);

  const w = profileFlags({ mobility: 'wheelchair' });
  assert.equal(w.hasMobilityNeeds, true);
  assert.equal(w.usesWheelchair, true);
  assert.equal(w.isNonAmbulatory, false);

  const na = profileFlags({ mobility: 'non_ambulatory' });
  assert.equal(na.hasMobilityNeeds, true);
  assert.equal(na.usesWheelchair, false);
  assert.equal(na.isNonAmbulatory, true);
});

test('profileFlags derives medical flags from powerDependentMedical array', () => {
  const f = profileFlags({ powerDependentMedical: ['oxygen', 'cpap'] });
  assert.equal(f.powerDependentMedical, true);
  assert.equal(f.needsOxygen, true);
  assert.equal(f.needsCPAP, true);
  assert.equal(f.needsDialysis, false);
  assert.equal(f.needsRefrigeratedMeds, false);
});

test('profileFlags derives vehicle flags from the vehicle string', () => {
  assert.equal(profileFlags({ vehicle: 'own' }).noVehicle, false);
  assert.equal(profileFlags({ vehicle: 'shared' }).sharedVehicle, true);
  assert.equal(profileFlags({ vehicle: 'shared' }).noVehicle, false);
  assert.equal(profileFlags({ vehicle: 'none' }).noVehicle, true);
});

test('profileFlags derives home-type flags', () => {
  assert.equal(profileFlags({ homeType: 'single_family' }).isSingleFamily, true);
  assert.equal(profileFlags({ homeType: 'apartment' }).isApartmentOrCondo, true);
  assert.equal(profileFlags({ homeType: 'condo' }).isApartmentOrCondo, true);
  assert.equal(profileFlags({ homeType: 'multi_unit' }).isApartmentOrCondo, true);
  assert.equal(profileFlags({ homeType: 'single_family' }).isApartmentOrCondo, false);
});

test('profileFlags derives tenure flags', () => {
  assert.equal(profileFlags({ tenure: 'renter' }).isRenter, true);
  assert.equal(profileFlags({ tenure: 'renter' }).isOwner, false);
  assert.equal(profileFlags({ tenure: 'owner' }).isOwner, true);
  assert.equal(profileFlags({ tenure: 'owner' }).isRenter, false);
});

test('profileFlags passes through language preference', () => {
  assert.equal(profileFlags({}).language, 'en');
  assert.equal(profileFlags({ language: 'tl' }).language, 'tl');
  assert.equal(profileFlags({ language: '' }).language, 'en');
});

// -- isProfileActive ----------------------------------------------------

test('isProfileActive: null and empty profiles are inactive', () => {
  assert.equal(isProfileActive(null), false);
  assert.equal(isProfileActive(undefined), false);
  assert.equal(isProfileActive({}), false);
  assert.equal(isProfileActive({ _schemaVersion: 1 }), false);
});

test('isProfileActive: a profile with at least one meaningful field is active', () => {
  assert.equal(isProfileActive({ householdSize: 2 }), true);
  assert.equal(isProfileActive({ ages: ['adult'] }), true);
  assert.equal(isProfileActive({ tenure: 'renter' }), true);
});

test('isProfileActive: empty arrays and empty strings do not count as meaningful', () => {
  assert.equal(isProfileActive({ ages: [] }), false);
  // Cast: empty string is shape-invalid but isProfileActive must still treat it as "no value."
  assert.equal(isProfileActive(/** @type {any} */ ({ mobility: '' })), false);
  assert.equal(isProfileActive({ pets: [], ages: [] }), false);
});
