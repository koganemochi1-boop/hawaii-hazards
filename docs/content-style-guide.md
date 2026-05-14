# Content style guide

How to write entries in `content/hazards.json` and `content/actions.json`.
The schema is in `content/schemas/`, and `node scripts/validate-content.js`
runs the checks. Read this before adding or revising content.

## Audience

A worried Hawaiʻi resident, on a phone, who searched their home address.
They are not a planner, not a GIS person, and not necessarily a native
English speaker. They want to know:

1. Am I in danger?
2. How bad is it?
3. What do I do?

Every word we write either answers one of those questions or it's noise.

## Voice

- **Direct and calm.** No alarmism. No marketing.
- **Plain English at an 8th-grade reading level.** Hemingway Editor or a
  similar tool is helpful.
- **Second person.** "Your address," "you should," "your route."
- **Active voice.** "If a warning is issued, evacuate." Not "If a warning
  has been issued, evacuation should be initiated."
- **Specific over generic.** "A magnitude-9 quake off Japan" beats "a
  major earthquake somewhere."
- **No jargon in primary text.** Technical codes belong only in the
  `technicalCode` field, shown in the expanded view.
- **No emojis. No exclamation points.**

## Per-hazard fields

### `id`, `displayName`, `shortName`

`id` is the lowercase snake_case key the code uses. Permanent.

`displayName` is what appears in detail views. `shortName` is what
appears on the cards. Keep `shortName` ≤ 12 characters.

### `severity`

One of: `none`, `low`, `moderate`, `high`.

| Severity | When to use |
|---|---|
| `high` | Direct evacuation order, life-safety scenario, or near-certain property loss in a credible event. Examples: extreme tsunami evac zone; coastal high-hazard flood zone (V/VE); lava zone 1. |
| `moderate` | Damage likely but mitigatable with preparedness. Property at meaningful risk but residents have time to act. Examples: 100-year flood zone (A/AE); coastal flooding with 3.2 ft SLR scenario; medium wildfire-risk community; lava zones 2–3. |
| `low` | Increased awareness warranted; nuisance flooding, smoke exposure, or proximity matters. Examples: X-shaded 500-year flood zone; low-risk wildfire community; lava zones 4–6; tsunami safe zone (positive framing). |
| `none` | The hazard does not apply at this address. Used in the `noMatch` block. |

When mapping a multi-zone hazard (e.g., FEMA flood has V, AE, A, X, D)
to three severity bands, lean toward consistency: collapse similar zones
to the same severity unless the difference matters to a resident
(e.g., V vs. AE matters; X-shaded vs. X-unshaded usually doesn't).

### `oneLiner`

The single line that appears on the collapsed hazard card.

- **≤ 90 characters.**
- Plain English, no jargon.
- Answers "am I in danger and what kind?" in one breath.
- Examples:
  - ✅ "If a tsunami warning is issued, you must evacuate."
  - ❌ "Your parcel intersects the Hawaiʻi DOT-mapped Extreme Tsunami Evacuation Zone (XTEZ) per the 2017 inundation modeling."

### `plainExplanation`

The 1–3 sentence body of the expanded hazard card.

- 8th-grade reading level.
- Explains what the zone means in real terms.
- May reference a concrete past event ("the 1960 Hilo tsunami").
- Does not list every technical caveat — link to authoritative sources
  for that.

### `probabilityFraming`

Optional but recommended. Calibrates "how scared should I be?"

- Anchor on either historical frequency ("on average every 10–20 years")
  or a recent event the reader will remember.
- Avoid false precision. "About every 100 years" is fine; "every 97.4
  years" is silly.
- It's okay to say "we don't know" if the science is uncertain.

### `technicalCode`

The actual zone label from the source dataset. Shown only in the
expanded "Technical details" subsection. Lets a planner, insurance
agent, or curious resident verify.

### `actionIds`

References by ID into `actions.json`. List every action that's relevant
to this zone — the synthesis engine handles dedupe and severity gating.

Order doesn't matter; the engine sorts by hazard-coverage and time
horizon.

### `noMatch`

The fallback when the address is **outside** all polygons for this
hazard. Used so the hazard still appears in the report (with positive
framing) instead of being silently omitted.

Severity is almost always `none`. For tsunami, `noMatch` may still
suggest `sign_up_for_alerts` because the resident could be on the coast
some other time.

### `authoritativeSources`

Two or three is plenty. Prefer:

1. The Hawaiʻi agency that owns the program (HI-EMA, county DEM, DLNR).
2. The federal authority (FEMA, NOAA, USGS).
3. A trusted non-profit (Red Cross Hawaiʻi, Hawaiʻi Wildfire Management
   Organization).

URLs must be `https://`. Validator rejects http or missing.

### `dataProvenance`

For the "Sources" footer and our internal refresh process. `service`
identifies the spatial dataset; `lastDownloaded` should be updated
whenever bundled GeoJSON is refreshed.

## Per-action fields

### `id`

`lowercase_snake_case`. Permanent — used by hazards.json and dedupe.

### `title`

Imperative, ≤ 60 characters. "Know your tsunami evacuation route."
Not "Tsunami evacuation route awareness."

### `description`

1–3 sentences. Specific enough that the resident knows what to do
*next*, not just the abstract category.

- ✅ "Walk or drive your route from home to the nearest tsunami safe
  zone in daylight, before you need it. Maps for every island are at
  the HI-EMA link below."
- ❌ "Be prepared to evacuate."

Include exact app paths or settings names where useful ("iPhone:
Settings → Notifications → Government Alerts").

### `timeHorizon`

| Value | Meaning |
|---|---|
| `right_now` | Today, this evening. Things you can do in under an hour with no special purchases. |
| `this_week` | A weekend project. May require a shopping trip. |
| `this_month` | Slower, longer, may need help from an insurance agent, contractor, or family meeting. Ongoing habits also go here. |

### `estimatedTime`

A user-facing string like "10 minutes," "1 hour," "ongoing." Resident
sees this on the card so they can pick quick wins.

### `hazardIds`

Every hazard the action helps with. Used by the synthesis engine to:

1. Render the multi-hazard badge ("[tsunami, surge, fire]").
2. Decide whether to surface the action at all.

If you're tempted to write "all hazards", list them explicitly. It makes
the dedupe & ranking deterministic.

### `appliesToSeverities`

Only render this action if the hazard hit's severity is in this set.

- A "know your tsunami route" action lists `["high"]` — it's not
  relevant if you're not in an evac zone.
- A "sign up for alerts" action lists `["low", "moderate", "high"]` —
  always helpful.

### `dedupeKey`

The most important field for clean synthesis. Two actions with the
same `dedupeKey` collapse to one row in the action plan. The resident
sees one "Build a kit" entry with badges for every hazard it helps
with, not five.

If two actions are *almost* the same but truly different ("build a
flood-specific kit" vs. "build a general 14-day kit"), give them
different dedupeKeys.

### `sources`

At least one. URLs must be `https://`. Validator rejects empty or
plain-http.

## Severity-to-tone calibration

| Severity | Plain-explanation tone |
|---|---|
| `high` | Direct. Don't soften life-safety language. "You must evacuate." Not "You may wish to consider evacuating." |
| `moderate` | Practical. Frame as "damage is likely; here's how to limit it." |
| `low` | Informational. "Worth knowing. Most years nothing happens." |
| `none` | Reassuring but not dismissive. Note any caveats (e.g., tsunami: you could still be on the coast when a warning is issued). |

## Localization

Every user-visible string is a localized-string object:

```json
"label": { "en": "In an extreme tsunami evacuation zone" }
```

For v1 we ship English-only. To add a language later, add the locale
key:

```json
"label": {
  "en": "In an extreme tsunami evacuation zone",
  "tl": "Sa isang grabe na zone para sa paglikas mula sa tsunami"
}
```

No code changes needed — the synthesis engine reads whichever locale
key the user has selected.

## Review process before publishing

1. Run `node scripts/validate-content.js`. Resolve all errors. Read
   every warning and decide whether to act.
2. Send the JSON files to the HI-EMA outreach contact for review.
3. Send to a Red Cross Hawaiʻi reviewer for additional plain-language
   feedback.
4. Apply changes, re-run the validator, commit.
5. Tag the content version: the `version` field in each file follows
   semver. Patch for typo fixes; minor for new actions or zones; major
   for breaking schema changes.

## Things to avoid

- **Insurance advice that goes beyond "review your coverage."** Don't
  tell anyone they "don't need" insurance. Always link to an
  authoritative source and let them decide.
- **Specific evacuation destinations.** Reference HI-EMA's zone maps
  instead. Routes and shelters change.
- **Specific drill dates or events.** Stale before the file ships.
- **Comparisons to mainland US.** Hawaiʻi's emergency posture is
  unusual (14-day kit, single supply chain, etc.) — frame in
  Hawaiʻi-native terms.
- **Anything you can't back with a source.** If you can't cite it,
  don't write it.
