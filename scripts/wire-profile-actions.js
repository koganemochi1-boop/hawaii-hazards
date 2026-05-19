#!/usr/bin/env node
//
// One-shot script: append the v2.1 profile-gated action IDs to every relevant
// hazard zone in content/hazards.json. Idempotent — safe to run multiple
// times; existing IDs are skipped.
//
// Severity policy:
//   high     → add all 9 profile-gated actions
//   moderate → add the 7 that have appliesToSeverities including moderate
//              (everything except find_accessible_shelter — that one is for
//              high-severity evac only)
//   low/none → add nothing
//
// Run from project root:
//   node scripts/wire-profile-actions.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');
const HZ_PATH    = path.join(ROOT, 'content', 'hazards.json');

const HIGH_ADDS = [
  'build_infant_kit',
  'build_pet_evacuation_kit',
  'register_special_needs_medical',
  'register_special_needs_mobility',
  'plan_power_for_medical',
  'find_accessible_shelter',
  'plan_non_vehicle_evacuation',
  'renter_emergency_contact_check',
  'multi_unit_evac_plan',
];

const MODERATE_ADDS = HIGH_ADDS.filter(a => a !== 'find_accessible_shelter');

const doc = JSON.parse(fs.readFileSync(HZ_PATH, 'utf8'));

let touched = 0;
let already = 0;

for (const hazard of doc.hazards) {
  for (const zone of hazard.zones || []) {
    let adds;
    if (zone.severity === 'high')     adds = HIGH_ADDS;
    else if (zone.severity === 'moderate') adds = MODERATE_ADDS;
    else continue;

    const existing = new Set(zone.actionIds || []);
    for (const aid of adds) {
      if (existing.has(aid)) { already++; continue; }
      existing.add(aid);
      touched++;
    }
    zone.actionIds = [...existing];
  }
}

fs.writeFileSync(HZ_PATH, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wired profile-gated actions into hazards.json:`);
console.log(`  ${touched} new action references added`);
console.log(`  ${already} references already present (skipped)`);
