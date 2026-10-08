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
// ── WHAT IS NOT HERE YET ──
// Phase 1 moves the configuration out in slices, each guarded by
// tests/core/prompt-fingerprint.test.js. Still in the core and still to move: the
// stage agent prompts, the barred and mental slot sets, the map layers, the
// intensity KPI and the re-open framing in session.js.
//
// Clinical source of truth: the "Think Twice" Drive folder, and
// docs/transition-protocol.md for the slots and the transition rules.

export const thinkTwiceAdult = {
  id: 'think-twice-adult',
  version: 1,

  // The Router's numbers. Each is a pack decision; none is clinically validated
  // beyond what docs/questions-for-natali.md records (§1 load guard, §13 grace).
  routing: {
    softThreshold: 0.8,  // share of core slots at 2 for the soft path
    saturationLimit: 2,  // consecutive turns with no new information
    loadGuard: 20,       // TEMPORARY backstop — see router.js
    rejectGrace: 3,      // turns bought by "לתקן"
  },

  // Order is the interview's order. A stage's key is `stage{n}` by position: the
  // StateDocument, exports and every "stageN.slot" reference are keyed that way,
  // so the key is a fact of the export format and validatePack holds it.
  //
  // `label` is what the stage rail shows the person; `signpost` is the static
  // fallback when a generated opener fails. Both are Natali's register and must
  // never carry a stage number or a clinical term.
  stages: [
    {
      key: 'stage1',
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
      label: 'איך הבנת את זה',
      signpost: 'מיפינו את מה שקרה. עכשיו אני רוצה להבין איך אתה רואה את זה.',
      slots: [{ id: 'causal' }, { id: 'meaning' }, { id: 'wound' }, { id: 'adhd_pattern' }],
    },
    {
      key: 'stage3',
      label: 'מה הרגשת',
      signpost: 'הבנו איך אתה רואה את זה. עכשיו בוא נראה מה הרגשת.',
      slots: [{ id: 'emotion' }, { id: 'intensity' }, { id: 'past_echo' }],
    },
    {
      key: 'stage4',
      label: 'איך הגבת',
      signpost: 'זיהינו את הרגש. עכשיו בוא נדבר על מה עשית ומה אתה שוקל לעשות.',
      slots: [{ id: 'auto_reaction' }, { id: 'planned_reaction' }],
    },
    {
      key: 'stage5',
      label: 'זווית אחרת',
      signpost: 'הבנו את התגובה. עכשיו בוא ננסה לראות את זה מנקודת מבט אחרת.',
      slots: [{ id: 'perspective' }, { id: 'intention' }, { id: 'alt_formulation' }, { id: 're_emotion' }],
      requires: ['stage2'],
      loadGuard: 15,
    },
    {
      key: 'stage6',
      label: 'מה אפשר לעשות',
      signpost: 'יש לנו תמונה רחבה יותר. בוא נחשוב מה עוד אפשר לעשות.',
      slots: [{ id: 'alternatives' }, { id: 'zero_action' }, { id: 'alt_from_transform' }],
      components: [{ type: 'collector' }],
    },
    {
      key: 'stage7',
      label: 'מה תבחר',
      signpost: 'יש לנו אפשרויות על השולחן. הגיע הזמן לבחור.',
      slots: [{ id: 'goal' }, { id: 'board_presented' }, { id: 'sharp_decision' }, { id: 'package_test' }],
      // The goal gates the board, not entry here — it is this stage's first question.
      requires: ['stage6'],
      components: [{ type: 'decision' }],
    },
  ],
};
