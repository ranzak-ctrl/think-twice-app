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
// Version 1 is the first, so there is nothing to migrate yet.

export const thinkTwiceAdultMigrations = {};
