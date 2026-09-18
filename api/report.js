// Technical error sink. Writes nothing and stores nothing — it only prints to
// the function's stdout, which Vercel collects into Runtime Logs. That is the
// whole mechanism: the log that already exists becomes the destination, so no
// storage is introduced and principle 6 is untouched.
//
// It does NOT trust the client. A browser bug (or a tampered page) could put
// interview content in this payload, and logging a body verbatim would be
// exactly the thing the principle forbids. So nothing is echoed: every field is
// re-read from a whitelist, coerced to its expected type and clamped. Anything
// not named here is dropped on the floor.

const MAX_FAILURES = 20;
const MAX_LEN = 120;

// `detail` is the only free-text field. Its sources are all enumerations —
// Anthropic's error.type, the parser's no_json/invalid_json/missing_message, a
// network error message. It is clamped and stripped of anything but plain
// identifier-ish text so a stray sentence cannot ride along.
const clean = (v) =>
  typeof v === 'string' ? v.replace(/[^\w .:/@-]+/g, ' ').trim().slice(0, MAX_LEN) : null;

const num = (v) => (Number.isFinite(v) ? v : null);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Same door as the proxy. A report cannot be sent by someone who never got in,
  // and the one failure that gate blocks — a wrong password — the proxy already
  // logs itself, so nothing is lost.
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers['x-app-password'] !== appPassword) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: 'Malformed report' });
      return;
    }
  }

  const failures = Array.isArray(body?.failures) ? body.failures.slice(0, MAX_FAILURES) : [];

  console.log(
    JSON.stringify({
      event: 'client_error_report',
      at: new Date().toISOString(),
      bundle: clean(body?.app?.bundle),
      stage: num(body?.stage),
      questionCount: num(body?.questionCount),
      // Rebuilt field by field. Note what is absent: no transcript, no prompt,
      // no state document, no map, and no user agent string (it identifies a
      // person's machine and diagnoses nothing the bundle hash does not).
      failures: failures.map((f) => ({
        kind: clean(f?.kind),
        status: num(f?.status),
        requestId: clean(f?.requestId),
        stage: num(f?.stage),
        mode: clean(f?.mode),
        attempt: num(f?.attempt),
        detail: clean(f?.detail),
      })),
    })
  );

  res.status(204).end();
}
