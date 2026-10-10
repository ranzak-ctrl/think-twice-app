// Seal or open an interview file — POST /api/interview-file.
//
//   { action: 'seal', payload }  →  { file }      the encrypted envelope
//   { action: 'open', file }     →  { payload }   the interview, back in the clear
//
// The interview passes through this function in both directions and is kept by
// it in neither: no write, no store, and no log of a body — the same contract as
// the model proxy (principle 6; CLAUDE.md "מינימום נתונים"). The only trace is a
// technical log line per request, as in api/anthropic/v1/messages.js. The
// encryption itself is server/interviewFile.js, where the format, the keys and
// why the whole file is encrypted are explained.
//
// Same door as the proxy: the shared APP_PASSWORD until accounts exist (plan,
// stage 4). Whoever holds a file and the door can open it; what sits on a
// person's own computer is that person's responsibility (Ran, 10.10.2026).

import { parseKeys, seal, open, FileError } from '../server/interviewFile.js';

// A sealed interview is well under a megabyte; Vercel caps a request body at
// 4.5 MB. Refused above this rather than half-read.
const MAX_BODY_CHARS = 4 * 1024 * 1024;

const STATUS = {
  'not-a-file': 400,
  'newer-file': 400,
  'unknown-key': 400,
  tampered: 400,
  'bad-payload': 400,
};

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  const started = Date.now();
  // Technical metadata only. Never the body, the payload, the file or a key.
  const log = (event, extra = {}) =>
    console.log(JSON.stringify({ rid, fn: 'interview-file', event, ms: Date.now() - started, ...extra }));

  res.setHeader('x-request-id', rid);
  // An interview in transit is not something any cache may keep.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    log('rejected', { status: 405, reason: 'method' });
    res.status(405).json({ error: 'method', rid });
    return;
  }

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers['x-app-password'] !== appPassword) {
    log('rejected', { status: 401, reason: 'bad_app_password' });
    res.status(401).json({ error: 'unauthorized', rid });
    return;
  }

  let keys;
  try {
    keys = parseKeys(process.env.INTERVIEW_FILE_KEYS);
  } catch {
    log('rejected', { status: 500, reason: 'bad_keys' });
    res.status(500).json({ error: 'not-configured', rid });
    return;
  }
  if (!keys.current) {
    // Pure misconfiguration: the deployment has no file key (DEPLOY-STATUS.md).
    log('rejected', { status: 500, reason: 'missing_file_keys' });
    res.status(500).json({ error: 'not-configured', rid });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_CHARS) {
      log('rejected', { status: 413, reason: 'too_large' });
      res.status(413).json({ error: 'too-large', rid });
      return;
    }
    try {
      body = JSON.parse(body);
    } catch {
      log('rejected', { status: 400, reason: 'malformed' });
      res.status(400).json({ error: 'malformed', rid });
      return;
    }
  }

  try {
    if (body?.action === 'seal') {
      const file = seal(body.payload, keys);
      log('ok', { action: 'seal', kid: file.kid, bytes: file.data.length });
      res.status(200).json({ file, rid });
      return;
    }
    if (body?.action === 'open') {
      const payload = open(body.file, keys);
      log('ok', { action: 'open', kid: body.file.kid });
      res.status(200).json({ payload, rid });
      return;
    }
    log('rejected', { status: 400, reason: 'unknown_action' });
    res.status(400).json({ error: 'unknown-action', rid });
  } catch (err) {
    if (err instanceof FileError && STATUS[err.code]) {
      log('rejected', { status: STATUS[err.code], reason: err.code });
      res.status(STATUS[err.code]).json({ error: err.code, rid });
      return;
    }
    log('failed', { status: 500, reason: err instanceof FileError ? err.code : 'internal' });
    res.status(500).json({ error: 'internal', rid });
  }
}
