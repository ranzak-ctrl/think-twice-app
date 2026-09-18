// The graph's vocabulary — every entity kind, edge kind and axis value, in one place.
//
// Ran, 18.9.2026: "אני רוצה לנהל רשימה של יישויות וקשתות שמהן ייבנה הגרף של כל
// מקרה." It could not be produced by reading one place. `EDGE_KINDS` and
// `GROUP_KINDS` lived in state.js, `STANCE_TYPES` / `EMOTION_PACES` / `SOURCES` in
// eventRecord.js, `NODE_SCALES` back in state.js again, and the label cap was
// declared twice under two names that had to agree and had nothing making them.
// A vocabulary nobody can see is a vocabulary nobody can manage.
//
// This module imports NOTHING, which is the point beyond tidiness: it also breaks
// the state.js ↔ eventRecord.js import cycle that existed only because the barred
// slots lived in state.js. router-guard called that cycle a latent trap — a future
// module-scope read of the `const` it re-entered would have thrown a TDZ
// ReferenceError in ONE import order only, the nastiest shape such a bug can take.
// With the shared vocabulary at the bottom of the graph, there is no cycle to trip.
//
// The reference, with each item's DECISION TEST, is docs/event-vocabulary.md and
// the מילון tab of docs/architecture-dashboard-v2.html. A test asserts that this
// file and that document agree, so drift fails in CI rather than in a live run.

// ── Entities ──
// A stance: what an actor wanted, was after, or understood.
// Decision test against an emotion: CAN YOU ARGUE WITH IT? A stance can be
// contradicted by a fact; a feeling cannot.
export const STANCE_TYPES = new Set(['want', 'goal', 'reading']);

// A feeling's timescale, in Ran's three: a circumstantial feeling, an emotional
// stance brought in beforehand, and a standing one that characterises the actor.
export const EMOTION_PACES = new Set(['situational', 'prior', 'trait']);

// ── Edges ──
// Each was added one at a time, with a case that had no home — `echo` on 5.9.2026,
// because "that is how I felt when teachers said I do not try" relates a feeling to
// its past echo and `because` would have asserted a cause he never named.
//
// EVERY ADDITION COSTS SOMETHING: a new kind is a new way for the model to classify
// wrongly. docs/event-vocabulary.md holds the open proposals (`derives_from`, which
// the protocol's percolation test already requires, and `about`) and the ones
// recommended against, with reasons.
export const EDGE_KINDS = new Set([
  'then',    // temporal succession — and then
  'because', // causal — that is why
  'agent',   // an actor did this beat
  'echo',    // resemblance — this felt like that. Never re-orders the map.
  // derivation — this came OUT OF that. Approved by Ran, 18.9.2026, and the only
  // kind on the list the protocol already required: stage 6's מבחן החלחול says
  // "לפחות חלופה אחת מקושרת לפרשנות החלופית; אם אין — סיגנל ל-Re-open של נושא 5".
  // That is an explicit link between two entities, i.e. an edge, and it had no kind.
  //
  // `because` is the WRONG word for it and that is the whole reason it needed its
  // own: the alternative was not CAUSED by the reinterpretation, it was DERIVED
  // from it. One is a claim about his life; the other is a claim about where an
  // idea came from.
  //
  // Like `echo`, it never re-orders the map — derivation is not precedence. The
  // alternative does not happen after the reading in the story's timeline; it does
  // not happen in the story at all.
  'derives_from',
  // aboutness — this feeling / reading / want is DIRECTED AT that. Approved by Ran,
  // 18.9.2026. It is what anchors the mind layer to the fact layer: without it the
  // whole mental side floats above the story without touching it at any point.
  //
  // AGAINST `because`, and the distinction is almost literally the preposition:
  //   "נעלבתי מ-מה שהיא ענתה"        → about   (object)
  //   "בגלל שהיא ענתה ככה נעלבתי"    → because (cause)
  // `because` is a causal claim about his life; `about` claims only direction. In
  // doubt, `about` — it claims less, and over-claiming causation is exactly what
  // the judge's `ownership` dimension exists to catch.
  //
  // AGAINST `echo`, one crisp test: IS THE TARGET INSIDE THIS EVENT OR OUTSIDE IT?
  // Inside → about. A past event outside the case → echo. A feeling carrying both
  // is `stage3.past_echo` with both its ends visible.
  //
  // Never orders the map: direction is not precedence. Beyond that, `about` runs
  // mind→fact while a `because` on the same two nodes runs fact→mind, so letting
  // `about` constrain the sort would manufacture a cycle out of a coherent pair.
  'about',
  // concession — this happened EVEN THOUGH that. Approved by Ran, 18.9.2026, on
  // observed need: it surfaced twice in his live run of 5.9 and collapsed into
  // `then`, which keeps the sequence and throws away the only part that made it a
  // story. "הלכתי לקניות למרות שהגב תפס" · "אמרתי שחייב לנוח אבל היא לא ויתרה".
  //
  // Direction: X → Y, where X is what happened and Y is what argued against it.
  //
  // AGAINST `then`, one question: IS AN EXPECTATION BEING DEFIED? Plain succession
  // is `then`; "and yet" is `despite`. The interviewee's own words carry it —
  // "ואז" against "למרות ש" / "אבל".
  //
  // AGAINST `because` it is the exact mirror: `because` says Y brought X about,
  // `despite` says Y was a reason for X NOT to happen and it happened anyway.
  //
  // IT DOES NOT ORDER THE MAP. A first draft of this comment said its temporal
  // direction is "the reverse of `then`", which is not quite true and made the
  // argument weaker than it is. The real reason:
  //
  //   `despite` SAYS NOTHING ABOUT TIME. Its direction is semantic — challenger →
  //   obstacle — and where the obstacle sits in the sequence varies:
  //     "הלכתי לקניות למרות שהגב תפס"        obstacle EARLIER (and `ongoing`, so
  //                                           it has no place in the sequence at all)
  //     "אמרתי שחייב לנוח אבל היא לא ויתרה"   obstacle EARLIER
  //     "הלכתי למרות שידעתי שאצטרך לחזור"     obstacle LATER — an anticipated cost
  //
  // An edge whose temporal meaning is INCONSISTENT cannot be an ordering
  // constraint. That also closes the obvious workaround — "just invert it in the
  // sort" only works if it is reversed every time, and it is not.
  //
  // What it would cost: on the first example the map would draw the shopping trip
  // BEFORE the back seized, asserting a sequence of his day he never described —
  // the exact class of claim the whole `confirmed` mechanism exists to prevent.
  //
  // Nothing is lost. Where he also stated a sequence ("קודם הגב תפס ואז הלכתי")
  // that is a `then` edge and it orders correctly. `despite` adds the CONCESSION,
  // not the order, and the two can sit on one pair in opposite directions.
  //
  // It routinely crosses the two lanes — an episode beat defying an `ongoing`
  // condition — which is exactly the cross-lane arrow Ran ruled on 5.9.2026 is
  // drawn only when the interviewee stated the link himself.
  'despite',
  // the instead-of relation — X is an alternative to Y. Approved by Ran,
  // 18.9.2026, over my own objection, which was wrong.
  //
  // I had ruled it out on brief.md:62, which forbids anything that may "highlight,
  // rank, star, pre-select or otherwise nudge one option over another". That ban is
  // on RANKING. This edge does not rank — it RELATES, and relating two things is
  // not comparing them. It says only that they answer the same moment; it says
  // nothing about which is better, and `confirmed` means he said so himself.
  //
  // What the objection cost: this is the tool's central move and it had no edge at
  // all. The whole interview is "here is what you thought → here is another way to
  // see it" and "here is what you did → here is what else you could do":
  //   stage5 alt_formulation  ──alternative_to──▶  stage2 causal / meaning
  //   stage6 alternatives     ──alternative_to──▶  stage1|4 auto_reaction
  // `derives_from` carries an alternative back to the REINTERPRETATION it grew out
  // of; nothing carried it back to the ORIGINAL it stands against.
  //
  // Direction: the challenger → the incumbent. That is a fact, not a preference —
  // the automatic reaction happened and the alternative did not.
  //
  // Does not order the map: the alternative does not occur after the original in
  // the story's timeline, it does not occur in the story at all.
  'alternative_to',
]);

// `about` belongs to MINDS. A beat cannot be "about" anything — only a reading, a
// want or a feeling can point at something. mergeEdges enforces this at the write,
// which is the half of the direction rule that code can actually decide.
//
// What code CANNOT decide is whether a given mind→fact pair is `about` or
// `because`; that is a reading of his wording, and it lives in registrar.md with
// the preposition test above. The hazard it guards against is concrete: an edge's
// identity is `from→to`, so re-reporting one ordered pair under a second kind
// REPLACES the first silently — and a pair that flipped from `about` to `because`
// would start asserting causation nobody stated.
export const MENTAL_SLOTS = new Set([
  'causal', 'meaning', 'wound', 'adhd_pattern',              // stage 2
  'emotion', 'past_echo',                                     // stage 3
  'planned_reaction',                                         // stage 4
  'perspective', 'intention', 'alt_formulation', 're_emotion', // stage 5
  'goal',                                                     // stage 7
]);


// A container is a claim, so all three kinds are gated on `confirmed`.
export const GROUP_KINDS = new Set(['community', 'process', 'perspective']);

// ── Cross-cutting axes ──
// Attribution. This is the protocol's מבחן הבעלות as a field rather than a hope:
// `inferred` is what the INTERVIEWER offered, and it stays worth less until the
// person adopts it in his own words, at which point it is re-reported as `stated`.
export const SOURCES = new Set(['stated', 'attributed', 'inferred', 'unknown']);

// The two clocks. The axis is STATE vs INCIDENT, never duration — evaluator.md v7
// was corrected on exactly this: a back that seized this morning is `ongoing` if it
// held through the whole event.
export const NODE_SCALES = new Set(['episode', 'ongoing']);

// ── The barred slots ──
// The wound (מוגלה) and the ADHD pattern. CLAUDE.md and Natali's ruling of
// 14.8.2026: he reaches the wound himself, and it is never reflected back at him as
// our reading of him.
//
// THE LINE THIS DRAWS, because it is easy to get backwards: these are barred from
// being DRAWN, not from being stored. coverage.stage2.wound cannot reach 2 unless
// the record holds the evidence, and stage 2 cannot probe a subject it is not told
// about — so the ledger keeps them and the interviewer's account carries them.
// Every PROJECTION applies this set: setMapLabel and mergeNodes/Edges/Groups refuse
// them at the write, eventMap.js filters on them, and renderEvent redacts them for
// every builder whose output is spoken to the person.
export const NEVER_SHOW_SLOTS = new Set(['wound', 'adhd_pattern']);

// ── Shared limit ──
// A cube's name is a word or two. Over-long is REFUSED, never trimmed: a label that
// needs cutting is not a label, and trimming would put back the sentence this field
// exists to keep out. Declared once because state.js and eventRecord.js both
// enforce it and nothing was keeping their two copies equal.
export const LABEL_MAX = 24;
