// What a session export is — and the first thing it says.
//
// Ran, 9.10.2026: the first thing at the top of an interview's export is which
// interview model it was and which version of the app produced it. With more than
// one interview under one shell, an export that does not say which one it is
// cannot be analysed, compared with another run, or safely loaded back.
//
// Pure, so the shape is tested (tests/ui/session-export.test.js) rather than
// trusted to a click handler.

export function interviewHeader(pack) {
  return { id: pack.id, name: pack.name, version: pack.version };
}

// The shape of a session export, as a number. It goes up when the shape changes,
// with a step in FORMAT_MIGRATIONS below — a person's interview file must load in
// every later version of the app (Ran, 10.10.2026).
export const SESSION_FORMAT = 1;

export function buildSessionExport({ pack, appVersion, bundle, exportedAt, history, state, revisions, map, mapSvg }) {
  return {
    // First by key order, so they are the first lines of the file.
    interview: interviewHeader(pack),
    app: { version: appVersion, bundle: bundle ?? null },
    format: SESSION_FORMAT,
    exportedAt,
    history,
    state,
    revisions,
    map,
    mapSvg,
  };
}

// A person's interview file — what is sealed into the encrypted file at the end
// of an interview, or when they leave it (plan 2ב, stage 4.7). The interview and
// nothing more: the transcript, the state the interview continues from, and the
// guide-mode revisions so a tester's sealed file loses nothing. Not the drawings —
// the map is rebuilt from the state when the file is opened.
export function buildInterviewFile({ pack, appVersion, bundle, savedAt, history, state, revisions }) {
  return {
    interview: interviewHeader(pack),
    app: { version: appVersion, bundle: bundle ?? null },
    format: SESSION_FORMAT,
    exportedAt: savedAt,
    history,
    state,
    revisions: revisions ?? [],
  };
}


// Whether an export can be loaded into this interview. Ran, 9.10.2026: old export
// files are not supported — "a negligible number". So an export loads only into
// the same interview model AT THE SAME VERSION. Restoring one recorded under other
// stages would show what the person said as if it were missing (its slots would
// read as 0), which is worse than refusing. An export from before the header
// existed is refused for the same reason: nothing in it says what it is.
export function importCompatibility(parsed, pack) {
  const header = parsed?.interview;
  if (!header || typeof header.id !== 'string' || !header.id) return { ok: false, reason: 'no-header' };
  if (header.id !== pack.id) return { ok: false, reason: 'other-interview', name: header.name || header.id };
  if (header.version !== pack.version) {
    return { ok: false, reason: 'other-version', from: header.version, current: pack.version };
  }
  return { ok: true };
}

// ── A person's interview file: backward compatible ──
//
// Ran, 10.10.2026 (plan 2ב, stage 4.7): the encrypted file a person downloads is
// the thread between sessions on the same event, and only they keep it. So,
// unlike the testers' readable exports above, it must load in every later version
// of the app. Two things can have moved since it was saved, and each has its own
// chain of steps, run in order from the file's version up to the current one:
//
//   format        the shape of the export itself      FORMAT_MIGRATIONS, here
//   interview     the interview model's version      the pack's own migrations
//                                                     (src/packs/<id>/migrations.js)
//
// A step takes the session as it was at version n and returns it as version n+1
// has it; the header is advanced here, so a step only moves the data. A missing
// step refuses the file instead of loading it half-understood — and
// tests/ui/interview-file.test.js fails while any shipped version lacks one, so
// that refusal is a bug that cannot ship. A file from a NEWER version than this
// app is refused: the app cannot know what a later version meant.
export const FORMAT_MIGRATIONS = {};

// The last argument is for the tests, which exercise a chain of more than one
// format; the app always runs the real one.
export function upgradeSession(
  session,
  pack,
  packMigrations = {},
  { format: currentFormat = SESSION_FORMAT, formatMigrations = FORMAT_MIGRATIONS } = {}
) {
  const header = session?.interview;
  if (!header || typeof header.id !== 'string' || !header.id) return { ok: false, reason: 'no-header' };
  if (header.id !== pack.id) return { ok: false, reason: 'other-interview', name: header.name || header.id };
  if (!Number.isInteger(session.format) || session.format < 1) return { ok: false, reason: 'no-header' };
  if (session.format > currentFormat) return { ok: false, reason: 'newer-file' };
  if (!Number.isInteger(header.version) || header.version < 1) return { ok: false, reason: 'no-header' };
  if (header.version > pack.version) {
    return { ok: false, reason: 'newer-version', from: header.version, current: pack.version };
  }

  let s = session;
  for (let f = s.format; f < currentFormat; f++) {
    const step = formatMigrations[f];
    if (typeof step !== 'function') return { ok: false, reason: 'no-migration', what: 'format', from: f };
    s = { ...step(s), format: f + 1 };
  }
  for (let v = s.interview.version; v < pack.version; v++) {
    const step = packMigrations[v];
    if (typeof step !== 'function') return { ok: false, reason: 'no-migration', what: 'interview', from: v };
    const next = step(s);
    s = { ...next, interview: { ...next.interview, ...interviewHeader(pack), version: v + 1 } };
  }
  return { ok: true, session: s, upgraded: s !== session };
}
