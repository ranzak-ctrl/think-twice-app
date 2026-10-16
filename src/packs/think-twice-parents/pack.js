// Think Twice for parents — the interview pack.
//
// The second interview the engine runs (docs/interview-platform-plan.md: the
// engine is the craft of interviewing, a pack is one professional model). This
// file is that model's structure, written as data — the same contract as
// src/packs/think-twice-adult/pack.js, which says why it must stay plain data.
//
// ── WHERE IT COMES FROM ──
// Natali's seven practice steps ("הדרכת הורים (חלק שני)") are the skeleton, in her
// order: the event, the behaviour, the ADHD trait it comes from, the child's need,
// where it meets the parent, what the parent does instead, and what the parent
// practises for next time. docs/parent-app/interview-model.md turns them into
// slots and transition rules; the approval doc Natali answered (8–16.10.2026) is
// recorded in its §9.
//
// ── EIGHT STAGES FOR SEVEN STEPS ──
// Her step 6 is two moves in one direction — gather options without judging, then
// choose — exactly Think Twice's stages 6 and 7, and the engine runs them as two
// stages because the board is built from a basket filled BEFORE it (validatePack).
// So the person sees eight labels where Natali wrote seven steps, and the last two
// labels say what her step 6 says. Her step 7 follows the decision and closes the
// interview: the `closing` component, which the engine gained for this pack.
//
// ── A DRAFT FOR QA, NOT A CLINICAL RELEASE ──
// Natali has not approved the structure (the approval table is still empty), and
// her questions 2 and 3 — which she marked as blocking — are open. Ran asked for
// this to run on the QA link anyway (16.10.2026), so what stands in for an answer
// is the plan's own proposal, and every such place says so below. Nothing here is
// for a real parent until Natali signs it off.
//
// ── WHAT THE ENGINE DOES NOT DO YET, THAT THE PLAN ASKS FOR ──
// router-guard's review (16.10.2026), kept here so nobody reads the plan as built:
//   - Dependencies: the plan (interview-model.md §5.1) lists five; none is encoded.
//     Stages run in order, and a `requires` that cannot be met strands the parent —
//     stage 7 requiring stage 6 would, since stage 6's two slots must both reach 2
//     and the dependency is checked before the load guard (the adult interview's
//     known issue D). So nothing here `requires` anything.
//   - Summaries: the engine asks for one at the end of EVERY stage, eight in all;
//     the plan wants them after stages 1, 5 and 7 only.
//   - Re-open triggers and the coherence chain (§5.1, §5.2) are not checked in code.
//   - The "operating instructions" card (§5.3) does not exist; the interview ends on
//     the closing stage's ordinary summary.
//   - No cast gate, although questions-for-natali §15 assumed one here.
//
// ── THE LOAD GUARD PACES THIS INTERVIEW ──
// In the adult interview the guard is a backstop set high so it rarely fires. Here
// it is the usual way a stage ends: a two-slot stage at a 0.8 threshold needs both
// slots at 2 (so saturation never helps), and `U` does not count toward the
// threshold — stage 5, with `prognosis` and `parent_self` allowed to stay U, cannot
// reach it. The low per-stage guards are what move the parent on. That includes the
// closing stage: after its guard it asks for the summary even if little is
// covered, and the parent's confirmation ends the interview. All of it is for
// Natali to set (interview-model.md §9), and none of it is validated.
//
// ── WHO OWNS WHAT HERE ──
// As in the adult pack: the labels and signposts are Natali's register (drafts
// until she approves them); the routing numbers and the components are the
// Router's rules, and any change to this file gets router-guard's review.
// tests/core/parents-pack.test.js pins them.

export const thinkTwiceParents = {
  id: 'think-twice-parents',
  // Ran's name for this model, 9.10.2026.
  name: 'Think Twice · הורים',
  version: 1,

  routing: {
    softThreshold: 0.8,
    saturationLimit: 2,
    // The fallback guard. Every stage but the decision sets its own, from the
    // plan's per-stage ceilings (interview-model.md §4) — placeholders, chosen so
    // that a flooded parent is not held long in a stage: "better an unexhausted
    // stage than a flooded parent" (the approval doc). See the header: here the
    // guard paces the interview.
    loadGuard: 20,
    rejectGrace: 3,
  },

  // No `map`: this interview runs without the registrar for now (prompts.js), so
  // there is no event record to lay out. Its evaluator reports no nodes either, so
  // the map stays empty and the shell does not offer the drawing (App.jsx hides
  // the toggle while the map is empty).
  //
  // Barred, as in the adult pack, means stored, scored and probed but never drawn
  // or recited: `parent_self` is "which parent am I", which only the parent may
  // word — the interviewer never phrases it, reflects it or confronts them with it
  // (interview-model.md §4, stage 5: "the same rule as `wound`").
  stages: [
    {
      key: 'stage1',
      name: 'אירוע',
      label: 'מה קרה',
      slots: [
        { id: 'context' },
        { id: 'demand' },
        { id: 'child_behavior' },
        { id: 'parent_response' },
        { id: 'ending' },
        // Sleep, hunger, the school day, the medication hour. U is a fine answer.
        { id: 'setting_events' },
      ],
      loadGuard: 7,
    },
    {
      key: 'stage2',
      name: 'התנהגות',
      label: 'מה ראינו',
      signpost: 'עכשיו נסתכל רגע על מה שהוא עשה שם.',
      slots: [{ id: 'behavior_label' }, { id: 'coping_frame', mental: true }],
      // A short stage: three to four questions.
      loadGuard: 4,
    },
    {
      key: 'stage3',
      name: 'מאפיין',
      label: 'מאיפה זה בא',
      signpost: 'נראה עכשיו מאיפה זה מגיע אצלו.',
      slots: [{ id: 'trait_link', mental: true }, { id: 'parent_ownership', mental: true }],
      loadGuard: 5,
    },
    {
      key: 'stage4',
      name: 'צורך',
      label: 'מה הוא היה צריך',
      signpost: 'ננסה עכשיו להסתכל על הרגע הזה מהצד שלו.',
      slots: [{ id: 'child_need', mental: true }, { id: 'child_feeling', mental: true }],
      // The hardest step, so the tightest ceiling.
      loadGuard: 5,
    },
    {
      key: 'stage5',
      name: 'ההורה',
      label: 'איפה זה פגש אותי',
      signpost: 'עכשיו נסתכל על מה שקרה בך באותו רגע.',
      slots: [
        { id: 'parent_emotion', mental: true },
        { id: 'parent_thought_then', mental: true },
        { id: 'prognosis', mental: true },
        { id: 'parent_self', mental: true, barred: true },
        { id: 'coping_style' },
        { id: 'gap_insight', mental: true },
      ],
      loadGuard: 6,
      // The emotion's intensity at the time of the event. One measure only: the
      // plan's second one ("and now?") sits in this same stage, and the engine
      // records one intensity per stage — so there is no delta KPI yet.
      components: [{ type: 'intensity' }],
    },
    {
      key: 'stage6',
      name: 'חלופות',
      label: 'מה אפשר לעשות',
      signpost: 'יש לנו תמונה רחבה יותר. נחשוב מה אפשר לעשות ברגע כזה.',
      // The parent proposes first; then the interviewer adds tools from the
      // trait → need → tool table, and the parent chooses (Natali, question 4).
      slots: [{ id: 'alternatives' }, { id: 'need_match' }],
      loadGuard: 8,
      components: [{ type: 'collector' }],
    },
    {
      key: 'stage7',
      name: 'הכרעה',
      label: 'מה אעשה ברגע הבא',
      signpost: 'יש אפשרויות על השולחן. הגיע הזמן לבחור.',
      slots: [
        { id: 'goal', mental: true },
        { id: 'board_presented' },
        { id: 'sharp_decision' },
        { id: 'package_test' },
      ],
      // No `requires`: see the header — stage 6 could never be left.
      components: [{ type: 'decision' }],
    },
    {
      key: 'stage8',
      name: 'תרגול',
      label: 'מה אתרגל',
      signpost: 'נחשוב עכשיו על הפעם הבאה, ועל מה אפשר להכין מראש.',
      slots: [
        { id: 'recurring_situation' },
        { id: 'prevention_step' },
        { id: 'parent_practice' },
        { id: 'implementation' },
        { id: 'feasibility' },
      ],
      loadGuard: 6,
      // The interview ends here: when this stage is covered and the parent
      // confirms its summary.
      components: [{ type: 'closing' }],
    },
  ],
};
