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

export function buildSessionExport({ pack, appVersion, bundle, exportedAt, history, state, revisions, map, mapSvg }) {
  return {
    // First by key order, so they are the first lines of the file.
    interview: interviewHeader(pack),
    app: { version: appVersion, bundle: bundle ?? null },
    exportedAt,
    history,
    state,
    revisions,
    map,
    mapSvg,
  };
}

// The interview an export came from, or null for an export from before the
// header existed (all of those are Think Twice for adults).
//
// Only the id is compared on import today. OPEN (router-guard, 9.10.2026): once a
// pack's version goes up because its stages or slots changed, an export from the
// older version would be restored under the new structure, its missing slots
// reading as 0. Whether a version mismatch is refused or only warned about has to
// be decided before the first such bump (docs/interview-platform-plan.md §11).
export function exportedInterviewId(parsed) {
  const id = parsed?.interview?.id;
  return typeof id === 'string' && id ? id : null;
}
