// Sends the technical failure metadata to /api/report, which only prints it to
// the Vercel Runtime Log. Fire-and-forget by design: a diagnostic must never be
// able to break the turn it is diagnosing, so every failure here is swallowed.
//
// Metadata only. The caller passes what model.js built, which carries no
// interview content — see describeUpstream in model.js.
import { getAppPassword } from './appAuth.js';

export function reportFailure({ failures, stage, questionCount, bundle }) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const pw = getAppPassword();
    if (pw) headers['x-app-password'] = pw;

    // keepalive so a report still leaves if the tab is closing on the error.
    void fetch('/api/report', {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({ failures, stage, questionCount, app: { bundle } }),
    }).catch(() => {});
  } catch {
    // Reporting is best-effort. Never surface, never rethrow.
  }
}
