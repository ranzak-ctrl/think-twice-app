// Think Twice for parents — how a saved interview from an earlier version of this
// interview is brought up to the current one. The rule and the shape are the
// adult pack's (src/packs/think-twice-adult/migrations.js): every bump of
// `version` in pack.js ships with a step here, keyed by the version it starts from.
//
// Version 1 is the first, so there is nothing to migrate yet. For the first step
// (1 → 2): a version-1 file saved before 24.10.2026 may still carry the shell's
// old waiting fields (`awaitingConfirmation`, `pendingNextStage`, `pendingClose`,
// `confirmationFloor`) — nothing reads them, and the adult pack's step 3 shows
// how they are dropped.

export const thinkTwiceParentsMigrations = {};
