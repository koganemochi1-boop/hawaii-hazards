#!/usr/bin/env node
//
// Sanity-checks content/hazards.json and content/actions.json without
// pulling in heavy JSON-Schema dependencies. Run before every commit
// that touches content/*.
//
// Usage:
//   node scripts/validate-content.js
//
// Exit codes:
//   0  all checks passed (warnings may still print)
//   1  one or more hard errors — content is not synthesizable

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const HAZARDS_PATH = path.join(ROOT, 'content', 'hazards.json');
const ACTIONS_PATH = path.join(ROOT, 'content', 'actions.json');

const SEVERITIES = new Set(['none', 'low', 'moderate', 'high']);
const APPLY_SEVERITIES = new Set(['low', 'moderate', 'high']);
const TIME_HORIZONS = new Set(['right_now', 'this_week', 'this_month']);
const PROFILE_FLAGS = new Set([
  'hasInfant', 'hasYoungChild', 'hasSchoolAge', 'hasTeen', 'hasSenior',
  'hasPet', 'hasDog', 'hasCat',
  'hasMobilityNeeds', 'usesWheelchair', 'isNonAmbulatory',
  'powerDependentMedical', 'needsOxygen', 'needsDialysis',
  'needsRefrigeratedMeds', 'needsCPAP',
  'noVehicle', 'sharedVehicle',
  'isSingleFamily', 'isApartmentOrCondo',
  'isRenter', 'isOwner',
]);

let errors = 0;
let warnings = 0;
function err(msg) { console.error('❌', msg); errors++; }
function warn(msg) { console.warn('⚠️ ', msg); warnings++; }
function ok(msg) { console.log('✓ ', msg); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { err(`Failed to read/parse ${p}: ${e.message}`); return null; }
}

const hazards = readJson(HAZARDS_PATH);
const actions = readJson(ACTIONS_PATH);

if (!hazards || !actions) {
  console.error('Aborting — could not load both files.');
  process.exit(1);
}

ok(`Loaded ${HAZARDS_PATH} (${hazards.hazards.length} hazards)`);
ok(`Loaded ${ACTIONS_PATH} (${actions.actions.length} actions)`);

// Build an action ID map for cross-referencing
const actionById = new Map();
for (const a of actions.actions) {
  if (actionById.has(a.id)) err(`Duplicate action id: ${a.id}`);
  actionById.set(a.id, a);
}

// Validate actions
const dedupeKeys = new Map(); // dedupeKey -> [action ids]
for (const a of actions.actions) {
  if (!a.id) { err(`Action missing id`); continue; }
  if (!a.title?.en) err(`Action ${a.id}: missing title.en`);
  if (!a.description?.en) err(`Action ${a.id}: missing description.en`);
  if (!TIME_HORIZONS.has(a.timeHorizon)) err(`Action ${a.id}: invalid timeHorizon "${a.timeHorizon}"`);
  if (!Array.isArray(a.hazardIds) || a.hazardIds.length === 0) err(`Action ${a.id}: hazardIds must be a non-empty array`);
  for (const s of a.appliesToSeverities || []) {
    if (!APPLY_SEVERITIES.has(s)) err(`Action ${a.id}: appliesToSeverities contains invalid value "${s}"`);
  }
  if (!Array.isArray(a.sources) || a.sources.length === 0) err(`Action ${a.id}: must cite at least one source`);
  for (const s of a.sources || []) {
    if (!s.label || !s.url) err(`Action ${a.id}: source missing label/url`);
    if (s.url && !/^https?:\/\//.test(s.url)) err(`Action ${a.id}: source url is not http(s) — ${s.url}`);
  }
  if (a._TODO) warn(`Action ${a.id}: has _TODO — ${a._TODO}`);
  if (a.requirements !== undefined) {
    if (typeof a.requirements !== 'object' || Array.isArray(a.requirements) || a.requirements === null) {
      err(`Action ${a.id}: requirements must be an object`);
    } else {
      for (const [flag, val] of Object.entries(a.requirements)) {
        if (!PROFILE_FLAGS.has(flag)) {
          err(`Action ${a.id}: unknown profile flag "${flag}" in requirements (see content/schemas/actions.schema.json for the allowed list)`);
        }
        if (typeof val !== 'boolean') {
          err(`Action ${a.id}: requirements.${flag} must be a boolean (got ${typeof val})`);
        }
      }
      if (Object.keys(a.requirements).length === 0) {
        warn(`Action ${a.id}: empty requirements object — omit the field entirely to mean "no requirements"`);
      }
    }
  }
  if (a.dedupeKey) {
    if (!dedupeKeys.has(a.dedupeKey)) dedupeKeys.set(a.dedupeKey, []);
    dedupeKeys.get(a.dedupeKey).push(a.id);
  }
}

// Validate hazards
const hazardIds = new Set();
for (const h of hazards.hazards) {
  if (!h.id) { err(`Hazard missing id`); continue; }
  if (hazardIds.has(h.id)) err(`Duplicate hazard id: ${h.id}`);
  hazardIds.add(h.id);

  if (!h.displayName) err(`Hazard ${h.id}: missing displayName`);
  if (!h.spatialKey) err(`Hazard ${h.id}: missing spatialKey`);
  if (!Array.isArray(h.zones)) err(`Hazard ${h.id}: zones must be an array`);
  if (!h.noMatch) err(`Hazard ${h.id}: missing noMatch block`);
  if (h._TODO) warn(`Hazard ${h.id}: has _TODO — ${h._TODO}`);

  // Walk zones
  for (const z of h.zones || []) {
    if (!z.match?.field || !('equals' in z.match)) err(`Hazard ${h.id}: zone missing match.field/equals`);
    if (!SEVERITIES.has(z.severity)) err(`Hazard ${h.id}: zone severity invalid: ${z.severity}`);
    if (!z.label?.en)             err(`Hazard ${h.id}: zone "${z.match?.equals}" missing label.en`);
    if (!z.oneLiner?.en)          err(`Hazard ${h.id}: zone "${z.match?.equals}" missing oneLiner.en`);
    if (!z.plainExplanation?.en)  err(`Hazard ${h.id}: zone "${z.match?.equals}" missing plainExplanation.en`);
    for (const aid of z.actionIds || []) {
      if (!actionById.has(aid)) {
        err(`Hazard ${h.id} zone "${z.match?.equals}" references unknown actionId: ${aid}`);
      } else {
        const a = actionById.get(aid);
        if (!a.hazardIds.includes(h.id)) {
          warn(`Action ${aid} is referenced by hazard ${h.id} but doesn't list ${h.id} in its hazardIds`);
        }
        if (z.severity !== 'none' && !a.appliesToSeverities.includes(z.severity)) {
          warn(`Hazard ${h.id} zone "${z.match?.equals}" (severity ${z.severity}) references action ${aid}, but ${aid} only applies to severities ${a.appliesToSeverities.join(',')}`);
        }
      }
    }
  }

  // noMatch
  if (h.noMatch) {
    if (!SEVERITIES.has(h.noMatch.severity)) err(`Hazard ${h.id}: noMatch severity invalid`);
    if (!h.noMatch.label?.en) err(`Hazard ${h.id}: noMatch missing label.en`);
    if (!h.noMatch.oneLiner?.en) err(`Hazard ${h.id}: noMatch missing oneLiner.en`);
    for (const aid of h.noMatch.actionIds || []) {
      if (!actionById.has(aid)) err(`Hazard ${h.id} noMatch references unknown actionId: ${aid}`);
    }
  }

  if (!Array.isArray(h.authoritativeSources) || h.authoritativeSources.length === 0) {
    warn(`Hazard ${h.id}: no authoritativeSources cited`);
  }
}

// Cross-check: every action's hazardIds should refer to known hazards
for (const a of actions.actions) {
  for (const hid of a.hazardIds || []) {
    if (!hazardIds.has(hid)) warn(`Action ${a.id} references unknown hazardId: ${hid}`);
  }
}

// Dedupe-key sanity
for (const [key, ids] of dedupeKeys) {
  if (ids.length > 1) {
    warn(`dedupeKey "${key}" shared by multiple actions: ${ids.join(', ')} (intentional? otherwise rename)`);
  }
}

console.log();
console.log(`Summary: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
process.exit(errors > 0 ? 1 : 0);
