// Mail the encrypted interview file — /api/send-interview.
//
//   GET                                  →  { available }   whether mail is set up here
//   POST { file, self?, other?, fileName } →  { results: { self?, other? } }
//
// The file arrives sealed (api/interview-file.js) and leaves sealed, attached. It
// is opened here only to prove it is a real interview file of this deployment and
// to learn which model it is, so the mail names the model from the server's own
// list — a request cannot put words of its own into a mail. The interview is
// dropped the moment that is known; nothing is stored, and the log holds counts,
// never an address (principle 6; server/mail.js says why and how).
//
// Same door as the other functions: the shared APP_PASSWORD until accounts exist.
// At most two recipients a request — the person, and one more they chose.

import { parseKeys, open, FileError } from '../server/interviewFile.js';
import { MODEL_NAMES, normalizeAddress, safeFileName, buildMail, sendMail, MailError } from '../server/mail.js';

const MAX_BODY_CHARS = 4 * 1024 * 1024;

const configured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.INTERVIEW_FILE_KEYS);

const appUrlOf = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `https://${String(host).split(',')[0].trim()}` : 'https://think-twice-nine.vercel.app';
};

export default async function handler(req, res, { fetchImpl } = {}) {
  const rid = Math.random().toString(36).slice(2, 10);
  const started = Date.now();
  // Technical metadata only. Never an address, the file, the interview or a key.
  const log = (event, extra = {}) =>
    console.log(JSON.stringify({ rid, fn: 'send-interview', event, ms: Date.now() - started, ...extra }));

  res.setHeader('x-request-id', rid);
  res.setHeader('Cache-Control', 'no-store');

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers['x-app-password'] !== appPassword) {
    log('rejected', { status: 401, reason: 'bad_app_password' });
    res.status(401).json({ error: 'unauthorized', rid });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ available: configured(), rid });
    return;
  }
  if (req.method !== 'POST') {
    log('rejected', { status: 405, reason: 'method' });
    res.status(405).json({ error: 'method', rid });
    return;
  }
  if (!configured()) {
    log('rejected', { status: 500, reason: 'mail_not_configured' });
    res.status(500).json({ error: 'mail-not-configured', rid });
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

  // Recipients: the person's own address and one more, each optional, at least one.
  const self = body?.self ? normalizeAddress(body.self) : null;
  let other = body?.other ? normalizeAddress(body.other) : null;
  if ((body?.self && !self) || (body?.other && !other)) {
    log('rejected', { status: 400, reason: 'bad_address' });
    res.status(400).json({ error: 'bad-address', rid });
    return;
  }
  if (other && other === self) other = null;
  if (!self && !other) {
    log('rejected', { status: 400, reason: 'no_address' });
    res.status(400).json({ error: 'no-address', rid });
    return;
  }

  // A real file of this deployment, of a model we know.
  let modelName;
  try {
    const payload = open(body?.file, parseKeys(process.env.INTERVIEW_FILE_KEYS));
    modelName = MODEL_NAMES[payload?.interview?.id];
  } catch (err) {
    const code = err instanceof FileError ? err.code : 'not-a-file';
    log('rejected', { status: 400, reason: code });
    res.status(400).json({ error: code === 'bad-keys' ? 'mail-not-configured' : code, rid });
    return;
  }
  if (!modelName) {
    log('rejected', { status: 400, reason: 'unknown_interview' });
    res.status(400).json({ error: 'unknown-interview', rid });
    return;
  }

  const attachment = {
    filename: safeFileName(body.fileName),
    content: Buffer.from(JSON.stringify(body.file), 'utf8').toString('base64'),
  };
  const appUrl = appUrlOf(req);
  const results = {};
  for (const [to, address] of [['self', self], ['other', other]]) {
    if (!address) continue;
    const mail = buildMail({ modelName, to, appUrl, sender: to === 'other' ? self : null });
    try {
      await sendMail(
        { apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM, to: address, ...mail, attachment },
        { fetchImpl }
      );
      results[to] = 'sent';
    } catch (err) {
      results[to] = err instanceof MailError ? err.code : 'mail-failed';
    }
  }

  const sent = Object.values(results).filter((r) => r === 'sent').length;
  const failed = Object.keys(results).length - sent;
  log(sent ? 'ok' : 'failed', { sent, failed, codes: Object.values(results).filter((r) => r !== 'sent') });
  res.status(sent ? 200 : 502).json(sent ? { results, rid } : { error: Object.values(results)[0], results, rid });
}
