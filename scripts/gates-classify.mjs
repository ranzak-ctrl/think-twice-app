// Turning a vitest log into a verdict about the judge — the one piece of
// run-gates.mjs worth testing on its own.
//
// It lives here because every bug this gate has had was in exactly this step, and
// all three were the same mistake: reading vitest's OUTPUT to infer what the judge
// DID.
//   1. "did it run?" grepped for a describe name the reporter prints only on
//      failure, so a judge that scored 5/5 was reported as "skipped".
//   2. scores were scraped from assertion messages, which exist only on failure,
//      so a passing run reported no scores.
//   3. "was the key rejected?" grepped the log for /401/, and matched the NAME of
//      a passing test — "a 401 is a locked door, not a model failure" — reporting
//      a working key as rejected on a fully green run, and suppressing the
//      comparison table downstream.
//
// The rule that kills all three: the judge test prints one JSON line about itself,
// pass or fail, and that line is the only witness. A log can contain any string —
// in a test name, a fixture, or a deliberate error-path assertion — and none of it
// says what the API did.

export const AUTH_PATTERN = /authentication_error|invalid x-api-key|401|credit|billing/i;

// `log` is the captured vitest output, ANSI already stripped.
// → { status: 'skipped' | 'rejected' | 'ran', judged, scores, judgeError, unitFailures }
export function classifyJudge(log) {
  const marker = /JUDGE_RESULT (\{.*\})/.exec(log ?? '');
  let judged = null;
  if (marker) {
    try { judged = JSON.parse(marker[1]); } catch { /* malformed — treat as absent */ }
  }

  // Which files failed, so "the judge failed" is never reported as "the suite is
  // broken". They are different verdicts calling for different actions.
  const unitFailures = [...(log ?? '').matchAll(/FAIL\s+(\S+)/g)]
    .map((m) => m[1])
    .filter((f) => !f.includes('judge'));

  if (!judged) {
    // No usable marker: the test never reached its own reporting line, so the log
    // is the only witness there is. This is the ONLY place log-scanning is sound.
    return {
      status: AUTH_PATTERN.test(log ?? '') ? 'rejected' : 'skipped',
      judged: null,
      scores: {},
      judgeError: '',
      salvaged: false,
      unitFailures,
    };
  }

  const judgeError = judged.ok
    ? ''
    : [judged.error, judged.raw].filter(Boolean).join(' | ').slice(0, 400);

  return {
    status: judged.ok ? 'ran' : 'rejected',
    judged,
    scores: judged.scores ?? {},
    judgeError,
    // The scores are trustworthy either way — salvage validates them exactly as
    // the strict path does — but a judge emitting invalid JSON is worth saying.
    salvaged: judged.salvaged === true,
    unitFailures,
  };
}

// Whether a failure is the credential's fault. Decided from the judge call's own
// error text, never from the surrounding log — see the note at the top.
export function looksLikeAuthFailure({ judged }) {
  if (!judged || judged.ok) return false;
  return AUTH_PATTERN.test(`${judged.error ?? ''} ${judged.raw ?? ''}`);
}

// The registrar's live call, read the same way and for the same reason: one JSON
// line the test prints about itself. It is a separate verdict from the judge's —
// the judge grades the interview, this only asks whether a real model can produce
// the ledger's shape at all. Collapsing them would hide which one broke.
export function classifyRegistrar(log) {
  const m = /REGISTRAR_RESULT (\{.*\})/.exec(log ?? '');
  if (!m) return { ran: false, ok: false, counts: {}, error: '', raw: '' };
  try {
    const r = JSON.parse(m[1]);
    return {
      ran: true,
      ok: r.ok === true,
      counts: r.counts ?? {},
      hasSetting: Boolean(r.hasSetting),
      error: r.error ?? '',
      raw: r.raw ?? '',
    };
  } catch {
    return { ran: false, ok: false, counts: {}, error: 'unparseable_marker', raw: '' };
  }
}
