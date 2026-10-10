// The interview file — sealed and opened on the server, kept nowhere.
//
// Ran, 10.10.2026 (docs/interview-platform-plan.md 2ב, stage 4.7): when an
// interview ends — or the person leaves it midway — the whole interview is
// downloaded as a file that is encrypted in full. Only this app opens it, to view
// the interview or to continue it, so the person comes back to the app to return
// to the interview, and the email provider that will carry the file sees
// ciphertext only. The encryption is also clinical, and that part does not depend
// on who holds the file: it carries the interview's internal state — the gaps and
// the barred findings — which the person must never read (gap-management §1;
// CLAUDE.md, "אסור").
//
// This module seals and opens in memory and stores nothing (principle 6). It is
// shared by the serverless function (api/interview-file.js) and the dev server
// (vite.config.js), and imports only Node.
//
// ── KEYS ──
//   INTERVIEW_FILE_KEYS = "k1:<base64 of 32 bytes>,k2:<base64 of 32 bytes>"
// The LAST key seals; every listed key opens. A key is never removed: a file
// sealed with it lives on someone's computer, and losing the key loses the file
// for good. Rotating is appending a key. Every key is backed up outside Vercel
// (scripts/new-file-key.mjs). The value is a secret: never VITE_-prefixed,
// never logged, never echoed in an error.
//
// ── FORMAT ──
// The envelope is JSON and holds no content in the clear:
//   { format: 'think-twice-interview', v: 1, kid, iv, tag, data }
// `data` is AES-256-GCM over the gzip of the payload's JSON. The header is bound
// as additional authenticated data, so changing any field of it fails the open.
// `v` is the ENVELOPE version — how the bytes are wrapped. What is inside, and its
// own backward compatibility, is the client's (src/ui/sessionExport.js).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const FILE_FORMAT = 'think-twice-interview';
export const ENVELOPE_VERSION = 1;

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KID = /^[a-z0-9]{1,16}$/;
const KEY_B64 = /^[A-Za-z0-9+/]{43}=$/; // exactly 32 bytes
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
// A sealed interview is well under a megabyte. The cap stops a crafted file from
// inflating without limit when it is opened.
export const MAX_PLAIN_BYTES = 20 * 1024 * 1024;

export class FileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// "k1:...,k2:..." → { keys: Map(kid → Buffer), current: last kid }. Throws on any
// malformed entry rather than skipping it: a key silently dropped is a set of
// files that silently stop opening. The message never carries key material.
export function parseKeys(raw) {
  const keys = new Map();
  let current = null;
  for (const entry of String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = entry.indexOf(':');
    const kid = i > 0 ? entry.slice(0, i) : '';
    const b64 = i > 0 ? entry.slice(i + 1) : '';
    if (!KID.test(kid) || !KEY_B64.test(b64) || keys.has(kid)) {
      throw new FileError('bad-keys');
    }
    keys.set(kid, Buffer.from(b64, 'base64'));
    current = kid;
  }
  return { keys, current };
}

const aad = (kid) => Buffer.from(`${FILE_FORMAT}|${ENVELOPE_VERSION}|${kid}`, 'utf8');

const fromB64 = (s) => {
  if (typeof s !== 'string' || !B64.test(s)) throw new FileError('not-a-file');
  return Buffer.from(s, 'base64');
};

export function seal(payload, { keys, current }) {
  if (!current || !keys?.has(current)) throw new FileError('no-key');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new FileError('bad-payload');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keys.get(current), iv);
  cipher.setAAD(aad(current));
  const plain = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  // `format` first, so the file announces what it is and nothing else.
  return {
    format: FILE_FORMAT,
    v: ENVELOPE_VERSION,
    kid: current,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

export function open(envelope, { keys }) {
  if (!envelope || typeof envelope !== 'object' || envelope.format !== FILE_FORMAT) {
    throw new FileError('not-a-file');
  }
  if (envelope.v !== ENVELOPE_VERSION) {
    // A wrapping this server does not know yet came from a newer version of the app.
    throw new FileError(Number.isInteger(envelope.v) && envelope.v > ENVELOPE_VERSION ? 'newer-file' : 'not-a-file');
  }
  if (typeof envelope.kid !== 'string' || !KID.test(envelope.kid)) throw new FileError('not-a-file');
  const key = keys?.get(envelope.kid);
  if (!key) throw new FileError('unknown-key');
  const iv = fromB64(envelope.iv);
  const tag = fromB64(envelope.tag);
  const data = fromB64(envelope.data);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new FileError('not-a-file');
  let plain;
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAAD(aad(envelope.kid));
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    // Wrong key, a changed byte, a changed header: GCM cannot tell them apart,
    // and neither should the caller.
    throw new FileError('tampered');
  }
  try {
    return JSON.parse(gunzipSync(plain, { maxOutputLength: MAX_PLAIN_BYTES }).toString('utf8'));
  } catch {
    throw new FileError('not-a-file');
  }
}
