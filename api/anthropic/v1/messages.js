// Serverless proxy (Vercel) — fixed path matching the client's only call:
// POST /api/anthropic/v1/messages. Keeps ANTHROPIC_API_KEY server-side; the
// browser never sees it. Optional shared-password gate via APP_PASSWORD.

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

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers['x-app-password'] !== appPassword) {
    res.status(401).json({ error: 'Unauthorized' });
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
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
