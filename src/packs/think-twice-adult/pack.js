// Think Twice for adults — the interview pack.
//
// docs/interview-platform-plan.md: the engine holds the craft of interviewing and
// knows no topic; a pack holds the professional model of ONE interview. This file
// is that model's structure, written as data.
//
// ── IT IS DATA, AND THAT IS THE CONTRACT ──
// No functions, no imports, nothing that does not survive JSON.stringify. A pack
// is what an interview editor will read and write, and what the engine validates
// before it runs one (core/pack.js, validatePack). Behaviour is never written
// here: a stage NAMES a component from the engine's closed catalog and sets its
// parameters, and the engine owns what the component does — principle 1, "the
// model proposes, the code decides", one level up: the pack configures, the
// engine decides. tests/core/pack.test.js fails if this stops being plain data.
//
// ── EVERYTHING THE ENGINE KNOWS ABOUT THESE SEVEN STAGES IS HERE ──
// Phase 1 moved the configuration out in three slices, each guarded by
// tests/core/prompt-fingerprint.test.js (docs/interview-platform-plan.md, phase 1).
// The last one (10.10.2026) took the turn loop off the number seven: which slot is
// barred or a mind, where the cast is gated, where intensity is measured and how
// the map lays the story out used to be constants in session.js, vocabulary.js,
// state.js and storyMap.js, and are now the flags, components and `map` below.
// What the engine still holds in Hebrew is its own craft — the summary and opener
// mechanics, the fallbacks — and it moves with the craft/content split of phase 2.
//
// ── WHO OWNS WHAT HERE ──
// Two kinds of content share this file. The labels and signposts are Natali's
// wording. The routing numbers, `requires` and the components are the Router's
// rules — tests/transitions/router.test.js pins every one of them, so an edit
// here fails the matrix until the change is made on purpose. Any change to this
// file gets router-guard's review, as a change to router.js would (Ran, 9.10.2026).
//
// Clinical source of truth: the "Think Twice" Drive folder, and
// docs/transition-protocol.md for the slots and the transition rules.

export const thinkTwiceAdult = {
  // Who this interview is. The id is fixed: exports and code refer to it, so it
  // never changes. The name is for people — it heads every export, and the guide's
  // interview picker will show it (plan §2א). Ran named both models on 9.10.2026:
  // "Think Twice · אישי" for this one, "Think Twice · הורים" for the parents'. The
  // version goes up whenever this file or the interview's texts change in a way an
  // analysis of a run would need to know about.
  id: 'think-twice-adult',
  name: 'Think Twice · אישי',
  // 2 (24.10.2026): the interviewer's texts changed — no routine restating, one
  // question per turn, the headers no longer reach the model — and the drawing is
  // the registrar's record. 3 (24.10.2026, later that day): an emotion in stage 1
  // is recorded, not asked; the evaluator stops reporting the map layer; a
  // checklist closes the turn prompt. The state's shape did not change either
  // time (migrations.js).
  version: 3,

  // The Router's numbers. Each is a pack decision; none is clinically validated
  // beyond what docs/questions-for-natali.md records (§1 load guard, §13 grace).
  routing: {
    softThreshold: 0.8,  // share of core slots at 2 for the soft path
    saturationLimit: 2,  // consecutive turns with no new information
    loadGuard: 20,       // TEMPORARY backstop — placeholder, questions-for-natali §1; see router.js
    rejectGrace: 3,      // turns bought by "לתקן"
  },

  // Order is the interview's order. A stage's key is `stage{n}` by position: the
  // StateDocument, exports and every "stageN.slot" reference are keyed that way,
  // so the key is a fact of the export format and validatePack holds it.
  //
  // `label` is what the stage rail shows the person; `signpost` is the static
  // fallback when a generated opener fails. Both are Natali's register and must
  // never carry a stage number or a clinical term. `name` is the stage's working
  // name for the guide panel — clinical shorthand a tester reads, never the person.
  //
  // A slot's flags are clinical rules, not display settings:
  //   barred — the wound and the ADHD pattern are never drawn or recited to the
  //            person (CLAUDE.md "כללים קליניים — שלב 2"; Natali, 14.8.2026). They
  //            are still stored, scored and probed — stage 2 needs them.
  //   mental — a mind, which alone can be "about" something (docs/event-vocabulary.md).
  stages: [
    {
      key: 'stage1',
      name: 'עובדות',
      label: 'מה קרה',
      slots: [
        { id: 'trigger' },
        { id: 'timeline' },
        { id: 'actors' },
        { id: 'status' },
        { id: 'auto_reaction' },
      ],
      // No advance on a muddled cast; the code derives `actors` from its clarity.
      components: [{ type: 'castClarity', slot: 'actors' }],
    },
    {
      key: 'stage2',
      name: 'פרשנות',
      label: 'איך הבנת את זה',
      signpost: 'מיפינו את מה שקרה. עכשיו אני רוצה להבין איך אתה רואה את זה.',
      slots: [
        { id: 'causal', mental: true },
        { id: 'meaning', mental: true },
        { id: 'wound', mental: true, barred: true },
        { id: 'adhd_pattern', mental: true, barred: true },
      ],
    },
    {
      key: 'stage3',
      name: 'רגש',
      label: 'מה הרגשת',
      signpost: 'הבנו איך אתה רואה את זה. עכשיו בוא נראה מה הרגשת.',
      slots: [{ id: 'emotion', mental: true }, { id: 'intensity' }, { id: 'past_echo', mental: true }],
      // The baseline of the emotion delta (רף הקבלה: "דלתא רגש נרשמת בכל ראיון מלא").
      components: [{ type: 'intensity' }],
    },
    {
      key: 'stage4',
      name: 'תגובה',
      label: 'איך הגבת',
      signpost: 'זיהינו את הרגש. עכשיו בוא נדבר על מה עשית ומה אתה שוקל לעשות.',
      slots: [{ id: 'auto_reaction' }, { id: 'planned_reaction', mental: true }],
    },
    {
      key: 'stage5',
      name: 'פרשנות חלופית',
      label: 'זווית אחרת',
      signpost: 'הבנו את התגובה. עכשיו בוא ננסה לראות את זה מנקודת מבט אחרת.',
      slots: [
        { id: 'perspective', mental: true },
        { id: 'intention', mental: true },
        { id: 'alt_formulation', mental: true },
        { id: 're_emotion', mental: true },
      ],
      requires: ['stage2'],
      loadGuard: 15, // TEMPORARY backstop — placeholder, questions-for-natali §1
      // The re-measure: the same feeling, after the move out of self.
      components: [{ type: 'intensity' }],
    },
    {
      key: 'stage6',
      name: 'חלופות',
      label: 'מה אפשר לעשות',
      signpost: 'יש לנו תמונה רחבה יותר. בוא נחשוב מה עוד אפשר לעשות.',
      slots: [{ id: 'alternatives' }, { id: 'zero_action' }, { id: 'alt_from_transform' }],
      components: [{ type: 'collector' }],
    },
    {
      key: 'stage7',
      name: 'הכרעה',
      label: 'מה תבחר',
      signpost: 'יש לנו אפשרויות על השולחן. הגיע הזמן לבחור.',
      slots: [
        { id: 'goal', mental: true },
        { id: 'board_presented' },
        { id: 'sharp_decision' },
        { id: 'package_test' },
      ],
      // The goal gates the board, not entry here — it is this stage's first question.
      requires: ['stage6'],
      components: [{ type: 'decision' }],
    },
  ],

  // The story map (storyMap.js). `narrative` is the order slots are laid out in
  // until the person says what led to what — the interview's own arc, event →
  // interpretation → feeling → what was done, and only a fallback: an edge he
  // stated always outranks it. Stages 6 and 7 are not on it: the alternatives and
  // the decision belong to the decision board, which has rules of its own
  // (design/brief.md:62 — nothing ranks, stars or pre-selects an option).
  // `timeline` is the slot whose certainty re-forms the map from a scene into a
  // journey — "then timing arrives" (Ran, 4.9.2026).
  map: {
    // The drawing is the registrar's record (Ran, 24.10.2026): the cubes, their
    // order and their links come from what the registrar wrote down, not from what
    // the interviewer reports in the same turn as its question.
    source: 'record',
    narrative: [
      { kind: 'fact', slots: ['stage1.trigger', 'stage1.timeline', 'stage1.status'] },
      { kind: 'thought', slots: ['stage2.causal', 'stage2.meaning'] },
      { kind: 'feeling', slots: ['stage3.emotion', 'stage3.past_echo'] },
      { kind: 'action', slots: ['stage1.auto_reaction', 'stage4.auto_reaction'] },
      { kind: 'plan', slots: ['stage4.planned_reaction'] },
      { kind: 'other', slots: ['stage5.perspective', 'stage5.intention', 'stage5.alt_formulation'] },
    ],
    timeline: 'stage1.timeline',
  },
};
