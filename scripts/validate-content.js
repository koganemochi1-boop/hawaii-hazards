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
//
// Library shape:
//   import { validate } from './scripts/validate-content.js';
//   const result = validate(hazardsDoc, actionsDoc);
//   // result = { errors: string[], warnings: string[] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEVERITIES = new Set(['none', 'low', 'moderate', 'high']);
export const APPLY_SEVERITIES = new Set(['low', 'moderate', 'high']);
export const TIME_HORIZONS = new Set(['right_now', 'this_week', 'this_month']);
export const PROFILE_FLAGS = new Set([
  'hasInfant', 'hasYoungChild', 'hasSchoolAge', 'hasTeen', 'hasSenior',
  'hasPet', 'hasDog', 'hasCat',
  'hasMobilityNeeds', 'usesWheelchair', 'isNonAmbulatory',
  'powerDependentMedical', 'needsOxygen', 'needsDialysis',
  'needsRefrigeratedMeds', 'needsCPAP',
  'noVehicle', 'sharedVehicle',
  'isSingleFamily', 'isApartmentOrCondo',
  'isRenter', 'isOwner',
]);

/**
 * Pure validator. Takes parsed hazards.json and actions.json documents and
 * returns lists of error/warning messages. No I/O, no side effects, no exit.
 *
 * @param {{hazards: Array}} hazardsDoc
 * @param {{actions: Array}} actionsDoc
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validate(hazardsDoc, actionsDoc) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!hazardsDoc || !Array.isArray(hazardsDoc.hazards)) {
    err('hazardsDoc.hazards is missing or not an array');
    return { errors, warnings };
  }
  if (!actionsDoc || !Array.isArray(actionsDoc.actions)) {
    err('actionsDoc.actions is missing or not an array');
    return { errors, warnings };
  }

  // Build an action ID map for cross-referencing.
  const actionById = new Map();
  for (const a of actionsDoc.actions) {
    if (!a.id) { err(`Action missing id`); continue; }
    if (actionById.has(a.id)) err(`Duplicate action id: ${a.id}`);
    actionById.set(a.id, a);
  }

  // Validate actions.
  const dedupeKeys = new Map();
  for (const a of actionsDoc.actions) {
    if (!a.id) continue; // already reported
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
    if ('pinned' in a && typeof a.pinned !== 'boolean') {
      err(`Action ${a.id}: pinned must be a boolean if present (got ${typeof a.pinned})`);
    }
  }

  // Validate hazards.
  const hazardIds = new Set();
  for (const h of hazardsDoc.hazards) {
    if (!h.id) { err(`Hazard missing id`); continue; }
    if (hazardIds.has(h.id)) err(`Duplicate hazard id: ${h.id}`);
    hazardIds.add(h.id);

    if (!h.displayName) err(`Hazard ${h.id}: missing displayName`);
    if (!h.spatialKey) err(`Hazard ${h.id}: missing spatialKey`);
    if (!Array.isArray(h.zones)) err(`Hazard ${h.id}: zones must be an array`);
    if (!h.noMatch) err(`Hazard ${h.id}: missing noMatch block`);
    if (h._TODO) warn(`Hazard ${h.id}: has _TODO — ${h._TODO}`);

    for (const z of h.zones || []) {
      if (!z.match?.field || !('equals' in (z.match || {}))) err(`Hazard ${h.id}: zone missing match.field/equals`);
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

  // Cross-check: every action's hazardIds should refer to known hazards.
  for (const a of actionsDoc.actions) {
    if (!a.id) continue;
    for (const hid of a.hazardIds || []) {
      if (!hazardIds.has(hid)) warn(`Action ${a.id} references unknown hazardId: ${hid}`);
    }
  }

  // Dedupe-key sanity.
  for (const [key, ids] of dedupeKeys) {
    if (ids.length > 1) {
      warn(`dedupeKey "${key}" shared by multiple actions: ${ids.join(', ')} (intentional? otherwise rename)`);
    }
  }

  return { errors, warnings };
}

// -- CLI -----------------------------------------------------------------

function isMainModule() {
  // True only when this file is invoked directly (`node validate-content.js`).
  if (!process.argv[1]) return false;
  const invoked = fileURLToPath(import.meta.url);
  return invoked === fs.realpathSync(process.argv[1]);
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const ROOT = path.join(__dirname, '..');
  const HAZARDS_PATH = path.join(ROOT, 'content', 'hazards.json');
  const ACTIONS_PATH = path.join(ROOT, 'content', 'actions.json');

  let hazardsDoc, actionsDoc;
  try { hazardsDoc = JSON.parse(fs.readFileSync(HAZARDS_PATH, 'utf8')); }
  catch (e) { console.error('❌', `Failed to read ${HAZARDS_PATH}: ${e.message}`); process.exit(1); }
  try { actionsDoc = JSON.parse(fs.readFileSync(ACTIONS_PATH, 'utf8')); }
  catch (e) { console.error('❌', `Failed to read ${ACTIONS_PATH}: ${e.message}`); process.exit(1); }

  console.log('✓ ', `Loaded ${HAZARDS_PATH} (${hazardsDoc.hazards.length} hazards)`);
  console.log('✓ ', `Loaded ${ACTIONS_PATH} (${actionsDoc.actions.length} actions)`);

  const { errors, warnings } = validate(hazardsDoc, actionsDoc);
  for (const m of warnings) console.warn('⚠️ ', m);
  for (const m of errors)   console.error('❌', m);

  console.log();
  console.log(`Summary: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  process.exit(errors.length > 0 ? 1 : 0);
}

if (isMainModule()) main();
