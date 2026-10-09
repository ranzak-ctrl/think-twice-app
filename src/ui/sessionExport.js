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
