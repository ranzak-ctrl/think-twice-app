// Think Twice for adults — how a saved interview from an earlier version of this
// interview is brought up to the current one.
//
// Ran, 10.10.2026: a person's interview file must load in every later version of
// the app. It is the thread between sessions on the same event, and only that
// person keeps it. So every bump of `version` in pack.js ships with a step here:
//
//   [n]: (session) => the session as version n + 1 has it
//
// keyed by the version it starts from. A file saved at version 1 runs every step
// up to the current one (src/ui/sessionExport.js, upgradeSession, which also
// advances the header). tests/ui/interview-file.test.js fails while any version
// below the current one has no step.
//
// Code, not data, which is why it is not in pack.js. A step changes what a saved
// interview means to the Router, so it gets router-guard's review with the bump.
//
export const thinkTwiceAdultMigrations = {
  // 1 → 2 (24.10.2026): the texts changed, the drawing moved onto the registrar's
  // record, and nothing in a saved interview changed shape — every slot, every
  // field is the same. The step is the identity, and it exists so a version-1 file
  // keeps opening (the test refuses a shipped version with no step).
  1: (session) => session,
  // 2 → 3 (24.10.2026): the stage-1 agent, the evaluator and the guidelines changed
  // — an emotion in stage 1 is recorded, not asked; the interviewer no longer
  // reports the map layer; a checklist closes the turn prompt; a framing sentence
  // opens a stage and answers a drift — and no slot, field or state shape moved.
  // A version-2 file is a version-3 file.
  2: (session) => session,
  // 3 → 4 (24.10.2026): the end-of-stage confirmation went (Ran: a stage closes on
  // a brief summary and moves on). A file saved while the old shell waited for the
  // person to confirm carries the waiting fields; nothing reads them any more, and
  // they are dropped so the file is what version 4 would have written. Every slot,
  // every other field is the same; the Router decides the pending transition again
  // on the next turn, since the stage is still covered.
  3: (session) => {
    const meta = { ...(session.state?.meta ?? {}) };
    for (const k of ['awaitingConfirmation', 'pendingNextStage', 'pendingClose', 'confirmationFloor']) delete meta[k];
    return { ...session, state: { ...session.state, meta } };
  },
};
