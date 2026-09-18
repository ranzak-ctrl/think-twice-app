// Serverless proxy (Vercel) — fixed path matching the client's only call:
// POST /api/anthropic/v1/messages. Keeps ANTHROPIC_API_KEY server-side; the
// browser never sees it. Optional shared-password gate via APP_PASSWORD.
//
// Logging: Vercel collects a function's console output into Runtime Logs, and
// that is the only server-side trace this app has — the proxy is stateless by
// principle 6 and stores nothing itself. So it logs technical metadata ONLY.
// Never log `req.body` or the upstream text: both carry interview content, and
// putting that in a log is storing user content outside the browser.
//
// Each request gets an id, returned as `x-request-id`. The browser's error
// report carries the same id, so a downloaded report and a log line can be
// matched to one another without either of them holding any transcript.

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  const started = Date.now();
  const log = (event, extra = {}) =>
    console.log(JSON.stringify({ rid, event, ms: Date.now() - started, ...extra }));

  res.setHeader('x-request-id', rid);

  if (req.method !== 'POST') {
    log('rejected', { status: 405, reason: 'method', method: req.method });
    res.status(405).json({ error: 'Method not allowed', rid });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // The one failure that is pure misconfiguration: the deployment has no key.
    log('rejected', { status: 500, reason: 'missing_api_key' });
    res.status(500).json({ error: 'Server not configured: ANTHROPIC_API_KEY missing', rid });
    return;
  }

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers['x-app-password'] !== appPassword) {
    // A locked door, not a model failure. Logged so a tester reporting "it broke"
    // can be told apart from a real outage.
    log('rejected', { status: 401, reason: 'bad_app_password' });
    res.status(401).json({ error: 'Unauthorized', rid });
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    });

    const text = await upstream.text();

    // Anthropic's error envelope names the failure type (invalid_request_error,
    // authentication_error, rate_limit_error, overloaded_error). That type is the
    // diagnosis and holds no interview content, so it is worth logging; the
    // message beside it can echo the request, so it is not.
    if (!upstream.ok) {
      let type = 'unknown';
      try {
        type = JSON.parse(text)?.error?.type ?? 'unknown';
      } catch {
        type = 'unparseable_error_body';
      }
      log('upstream_error', { status: upstream.status, type });
    } else {
      log('ok', { status: upstream.status, bytes: text.length });
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    // Network-level failure reaching Anthropic at all.
    log('upstream_unreachable', { status: 502, detail: String(err?.message ?? err) });
    res.status(502).json({ error: 'Upstream request failed', detail: String(err), rid });
  }
}
