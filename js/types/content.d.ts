// Shared type definitions for the content schemas + engine output.
// Available as global types (no import needed) — this is a script-style .d.ts.
//
// Whenever you add/rename a field in content/hazards.json or
// content/actions.json, update the matching type here AND
// content/schemas/*.schema.json. The validator enforces the schema at
// runtime; tsc enforces the types at author-time.

// =====================================================================
//   Profile
// =====================================================================

/**
 * Names of the boolean flags derived from a household profile by
 * profileFlags() in js/profile.js. Used as keys in action `requirements`
 * blocks.
 */
type ProfileFlagName =
  | 'hasInfant' | 'hasYoungChild' | 'hasSchoolAge' | 'hasTeen' | 'hasSenior'
  | 'hasPet' | 'hasDog' | 'hasCat'
  | 'hasMobilityNeeds' | 'usesWheelchair' | 'isNonAmbulatory'
  | 'powerDependentMedical' | 'needsOxygen' | 'needsDialysis'
  | 'needsRefrigeratedMeds' | 'needsCPAP'
  | 'noVehicle' | 'sharedVehicle'
  | 'isSingleFamily' | 'isApartmentOrCondo'
  | 'isRenter' | 'isOwner';

/** Boolean flags derived from a profile, plus a string `language`. */
type ProfileFlags =
  & { language: string }
  & { [K in ProfileFlagName]: boolean };

/** Raw household profile as stored in localStorage. All fields optional. */
interface Profile {
  householdSize?: number;
  ages?: Array<'infant' | 'young_child' | 'school_age' | 'teen' | 'adult' | 'senior'>;
  pets?: Array<'dog' | 'cat' | 'other'>;
  petCount?: number;
  mobility?: 'none' | 'walking_aid' | 'wheelchair' | 'non_ambulatory';
  powerDependentMedical?: Array<'oxygen' | 'dialysis' | 'refrigerated_meds' | 'cpap'>;
  vehicle?: 'own' | 'shared' | 'none';
  language?: string;
  homeType?: 'single_family' | 'apartment' | 'condo' | 'multi_unit';
  tenure?: 'renter' | 'owner';
  _schemaVersion?: 1;
}

// =====================================================================
//   Content (hazards.json + actions.json)
// =====================================================================

type Severity = 'none' | 'low' | 'moderate' | 'high';
type ApplySeverity = 'low' | 'moderate' | 'high';
type TimeHorizon = 'right_now' | 'this_week' | 'this_month';

interface LocalizedString {
  en: string;
  [locale: string]: string;
}

interface Source {
  label: string;
  url: string;
}

/** Requirements gate on an action. Map of ProfileFlag → required boolean. */
type Requirements = Partial<Record<ProfileFlagName, boolean>>;

interface MatchRule {
  field: string;
  equals: string;
}

interface Zone {
  match: MatchRule;
  severity: Severity;
  label: LocalizedString;
  oneLiner: LocalizedString;
  plainExplanation: LocalizedString;
  probabilityFraming?: LocalizedString | null;
  technicalCode?: string;
  actionIds: string[];
}

interface NoMatchBlock {
  severity: Severity;
  label: LocalizedString;
  oneLiner: LocalizedString;
  plainExplanation: LocalizedString;
  actionIds: string[];
}

interface Hazard {
  id: string;
  displayName: string;
  shortName: string;
  iconKey?: string;
  spatialKey: string;
  sortHint?: number;
  zones: Zone[];
  noMatch: NoMatchBlock;
  authoritativeSources: Source[];
  dataProvenance?: {
    service?: string;
    spatialAttribution?: string;
    lastDownloaded?: string | null;
    refreshCadence?: string;
  };
  _TODO?: string;
}

interface Action {
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  timeHorizon: TimeHorizon;
  estimatedTime?: string;
  hazardIds: string[];
  appliesToSeverities: ApplySeverity[];
  dedupeKey?: string;
  pinned?: boolean;
  requirements?: Requirements;
  sources: Source[];
  _TODO?: string;
}

interface Content {
  hazards: Hazard[];
  actions: Action[];
}

// =====================================================================
//   Synthesis engine output
// =====================================================================

interface HazardSummary {
  hazardId: string;
  hazard: Hazard;
  zone: Zone | NoMatchBlock | null;
  severity: Severity;
  status: 'ok' | 'ok_unmatched_zone' | 'unavailable';
  matchedFeature: any | null;
  error?: string;
}

interface ActionPlanEntry {
  action: Action;
  hazards: Set<string>;
  maxSeverityRank: number;
  matchedRequirements: boolean;
}

interface Plan {
  right_now: ActionPlanEntry[];
  this_week: ActionPlanEntry[];
  this_month: ActionPlanEntry[];
}

interface SynthesisResult {
  hazardSummaries: HazardSummary[];
  overall: Severity;
  plan: Plan;
  profileFlags: ProfileFlags;
  queriedAt: string;
}
