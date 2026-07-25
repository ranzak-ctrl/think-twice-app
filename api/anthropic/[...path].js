// Serverless proxy (Vercel) — keeps the Anthropic API key server-side.
// The browser calls /api/anthropic/v1/messages WITHOUT any key; this function
// injects ANTHROPIC_API_KEY (a server-only env var) and forwards to Anthropic.
//
// Optional shared-password gate: if APP_PASSWORD is set, every request must
// carry a matching `x-app-password` header, so a leaked URL can't burn credits.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Server not configured: ANTHROPIC_API_KEY missing' });
    return;
  }

  // Shared-password gate (only enforced when APP_PASSWORD is set on the server).
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers['x-app-password'] !== appPassword) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Reconstruct the Anthropic path, e.g. ['v1','messages'] -> v1/messages
  const parts = req.query.path;
  const path = Array.isArray(parts) ? parts.join('/') : String(parts || '');
  const url = `https://api.anthropic.com/${path}`;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
