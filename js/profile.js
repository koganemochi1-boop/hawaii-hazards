// Household profile — client-side only.
//
// All functions are pure or touch only window.localStorage on the active
// origin. Profile is OPTIONAL: a missing or empty profile is the normal,
// non-personalized case. The synthesis engine sees this through `profileFlags`
// which always returns a flat boolean-map.
//
// Storage key:    hi-hazards/household-profile-v1
// URL hash:       MUST NOT include profile data — privacy invariant.
// Failure mode:   if localStorage is blocked or throws (private mode,
//                 storage quota), the rest of the app continues unaffected
//                 with an empty profile.

const STORAGE_KEY = 'hi-hazards/household-profile-v1';
const SCHEMA_VERSION = 1;

/**
 * Read the profile from localStorage. Returns `null` if absent, unreadable,
 * or stored under an unrecognized schema version.
 *
 * @returns {Profile | null}
 */
export function loadProfile() {
  if (!hasStorage()) return null;
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (_) { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed._schemaVersion !== undefined && parsed._schemaVersion !== SCHEMA_VERSION) {
      // Future migrations would land here. For v1, drop unrecognized versions.
      return null;
    }
    return parsed;
  } catch (_) { return null; }
}

/**
 * Persist the profile. Strips undefined/null/empty before storing so
 * `loadProfile().fieldName` is reliably either a value or absent.
 *
 * @param {Profile} profile
 * @returns {boolean} true on success, false if storage failed
 */
export function saveProfile(profile) {
  if (!hasStorage()) return false;
  const cleaned = stripEmpty(profile);
  cleaned._schemaVersion = SCHEMA_VERSION;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return true;
  } catch (e) {
    console.warn('[profile] save failed:', e);
    return false;
  }
}

/**
 * Remove the profile entirely. Used by the "Forget my household details"
 * button. Returns true on success.
 */
export function clearProfile() {
  if (!hasStorage()) return false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (_) { return false; }
}

/**
 * Derive boolean flags from a profile for the synthesis engine. Empty or
 * null profile yields all-false flags (i.e., no personalization gates fire).
 *
 * Returned shape is the contract that `content/actions.json` requirements
 * blocks key off of — keep the field names stable. The field names ARE
 * the ProfileFlagName enum, type-checked by tsc.
 *
 * @param {Profile | null | undefined} profile
 * @returns {ProfileFlags}
 */
export function profileFlags(profile) {
  /** @type {ProfileFlags} */
  const empty = {
    hasInfant: false,
    hasYoungChild: false,
    hasSchoolAge: false,
    hasTeen: false,
    hasSenior: false,
    hasPet: false,
    hasDog: false,
    hasCat: false,
    hasMobilityNeeds: false,
    usesWheelchair: false,
    isNonAmbulatory: false,
    powerDependentMedical: false,
    needsOxygen: false,
    needsDialysis: false,
    needsRefrigeratedMeds: false,
    needsCPAP: false,
    noVehicle: false,
    sharedVehicle: false,
    isSingleFamily: false,
    isApartmentOrCondo: false,
    isRenter: false,
    isOwner: false,
    language: 'en',
  };
  if (!profile) return empty;

  const ages = new Set(profile.ages || []);
  const pets = new Set(profile.pets || []);
  const med  = new Set(profile.powerDependentMedical || []);
  const mobility = profile.mobility || 'none';

  return {
    ...empty,
    hasInfant:     ages.has('infant'),
    hasYoungChild: ages.has('young_child'),
    hasSchoolAge:  ages.has('school_age'),
    hasTeen:       ages.has('teen'),
    hasSenior:     ages.has('senior'),

    hasPet: pets.size > 0,
    hasDog: pets.has('dog'),
    hasCat: pets.has('cat'),

    hasMobilityNeeds: mobility !== 'none',
    usesWheelchair:   mobility === 'wheelchair',
    isNonAmbulatory:  mobility === 'non_ambulatory',

    powerDependentMedical: med.size > 0,
    needsOxygen:           med.has('oxygen'),
    needsDialysis:         med.has('dialysis'),
    needsRefrigeratedMeds: med.has('refrigerated_meds'),
    needsCPAP:             med.has('cpap'),

    noVehicle:     profile.vehicle === 'none',
    sharedVehicle: profile.vehicle === 'shared',

    isSingleFamily:     profile.homeType === 'single_family',
    isApartmentOrCondo: ['apartment', 'condo', 'multi_unit'].includes(profile.homeType ?? ''),

    isRenter: profile.tenure === 'renter',
    isOwner:  profile.tenure === 'owner',

    language: profile.language || 'en',
  };
}

/**
 * Check whether a profile is "active" — i.e., the user has supplied at least
 * one meaningful field. Used to decide whether to render the personalized-for
 * pill on the report.
 *
 * @param {Profile | null | undefined} profile
 * @returns {boolean}
 */
export function isProfileActive(profile) {
  if (!profile) return false;
  const meaningfulKeys = [
    'householdSize', 'ages', 'pets', 'mobility', 'powerDependentMedical',
    'vehicle', 'language', 'homeType', 'tenure',
  ];
  return meaningfulKeys.some(k => {
    const v = profile[k];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

// -- internals ----------------------------------------------------------

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (_) {
    return false;
  }
}

function stripEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}
