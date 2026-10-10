// The graph's vocabulary — every entity kind, edge kind and axis value, in one place.
//
// Ran, 18.9.2026: "אני רוצה לנהל רשימה של יישויות וקשתות שמהן ייבנה הגרף של כל
// מקרה." It could not be read from one place: these sets were split across
// state.js and eventRecord.js, and the label cap was declared twice under two
// names with nothing keeping them equal.
//
// ── WHERE THE REASONING LIVES, AND WHY NOT HERE ──
// docs/event-vocabulary.md is the full reference: every item's decision test, what
// was rejected and why, and the argument behind each ruling. The dashboard's מילון
// tab renders the same list. This file carries the VALUES plus what the CODE
// enforces — Ran's division, 18.9.2026, after the full rationale had ended up in
// all three: "ההנמקה המלאה נשארת במסמך, והערות הקוד מתקצרות להפניה."
//
// tests/core/vocabulary.test.js fails if this file and those documents disagree.
//
// ── IT IMPORTS NOTHING, AND THAT IS LOAD-BEARING ──
// Putting the shared vocabulary at the bottom of the import graph removed the
// state.js ↔ eventRecord.js cycle that existed only because the barred slots lived
// in state.js. router-guard called that cycle a latent trap: a future module-scope
// read of the `const` it re-entered would throw a TDZ ReferenceError in ONE import
// order only. A test asserts this file stays import-free.

// ── Entities ──
// stance vs emotion: CAN YOU ARGUE WITH IT? A stance can be contradicted by a
// fact; a feeling cannot.
export const STANCE_TYPES = new Set(['want', 'goal', 'reading']);

// Ran's three feeling timescales: circumstantial, brought-in beforehand, and
// standing (a trait of the actor).
export const EMOTION_PACES = new Set(['situational', 'prior', 'trait']);

// ── Edges ──
// EVERY ADDITION COSTS SOMETHING: a new kind is a new way for the model to
// classify wrongly. Each of these was added one at a time with a case that had no
// home. The decision tests, and the candidates ruled against, are in the doc.
export const EDGE_KINDS = new Set([
  'then',           // succession — "ואז"
  'because',        // cause — "בגלל ש"
  'agent',          // an actor did this beat
  'echo',           // resemblance to something OUTSIDE the event — "ככה הרגשתי אז"
  'derives_from',   // derivation — an alternative out of a reinterpretation (מבחן החלחול)
  'about',          // aboutness — a mind directed at something INSIDE the event
  'despite',        // concession — "למרות ש" / "אבל"
  'alternative_to', // instead-of — the challenger → the incumbent. Relates, never ranks
]);

// Only these two may say "this came before that". The rest are relations that are
// not precedence, and storyMap.js names this set rather than testing two kinds
// inline, so a new edge cannot silently acquire ordering power. A test locks it.
// Why each of the others is excluded: docs/event-vocabulary.md.
export const ORDERING_EDGE_KINDS = new Set(['then', 'because']);

// A container is a claim, so all three kinds are gated on `confirmed`.
export const GROUP_KINDS = new Set(['community', 'process', 'perspective']);

// ── Cross-cutting axes ──
// Attribution — the protocol's מבחן הבעלות as a field: `inferred` is what the
// INTERVIEWER offered, and stays worth less until he adopts it in his own words.
export const SOURCES = new Set(['stated', 'attributed', 'inferred', 'unknown']);

// The two clocks. The axis is STATE vs INCIDENT, never duration — evaluator.md v7
// was corrected on exactly this.
export const NODE_SCALES = new Set(['episode', 'ongoing']);

// ── The barred slots and the minds are not here any more ──
// They name SLOTS, and slots are an interview's, not the graph's: which slots are
// never drawn (the wound and the ADHD pattern) and which are minds that alone may be
// `about` something are flags on the slots in each pack (`barred`, `mental` —
// src/packs/think-twice-adult/pack.js), read through core/pack.js. Moved there on
// 10.10.2026 so a second interview can bar its own sensitive slots (plan §3.1).
//
// THE LINE THE BARRED FLAG DRAWS, because it is easy to get backwards: barred from
// being DRAWN, not from being stored. coverage.stage2.wound cannot reach 2 unless
// the record holds the evidence, and stage 2 cannot probe a subject it is not told
// about — so the ledger keeps them and the interviewer's account carries them.
// Every PROJECTION applies it: setMapLabel and mergeNodes/Edges/Groups refuse them
// at the write, eventMap.js filters on them, and renderEvent redacts them for every
// builder whose output is recited to the person rather than used to ask a question.
//
// What the code enforces about `about`: it belongs to MINDS — a beat cannot be
// "about" anything — and mergeEdges refuses an `about` whose source is not a mind,
// refusing rather than flipping, because flipping would invent a relation. That is
// the half of the direction rule code can decide. Whether a mind→fact pair is
// `about` or `because` is a reading of his wording and lives in registrar.md.

// ── Shared limit ──
// Over-long is REFUSED, never trimmed: a label that needs cutting is not a label,
// and trimming would put back the sentence this field exists to keep out.
export const LABEL_MAX = 24;
