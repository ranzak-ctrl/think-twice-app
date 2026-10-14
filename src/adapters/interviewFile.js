// The interview file, from the browser's side: seal what is on screen into the
// encrypted file, and open such a file back into an interview.
//
// Both go through POST /api/interview-file (api/interview-file.js), because the
// key lives on the server only — the browser never holds it, so it cannot open a
// file by itself, and neither can anyone who has the file but not the app (Ran,
// 10.10.2026; docs/interview-platform-plan.md 2ב, decision 8). The function
// stores nothing; this module stores nothing either: what it sends and what it
// gets back live in memory until the caller drops them (principle 6).
//
// The same door as the model proxy: the shared app password, per tab.
//
// Outcomes, never a throw:
//   { ok: true, file }      sealInterview
//   { ok: true, payload }   openInterviewFile
//   { ok: false, error, unauthorized? }
// `error` is the function's code (not-a-file · newer-file · unknown-key ·
// tampered · not-configured · too-large · …) or 'network'.

import { getAppPassword, clearAppPassword } from './appAuth.js';

export const FILE_FORMAT = 'think-twice-interview';
// What the downloaded file is called after its date. A name of its own, so it
// reads as "open this in the app" rather than as a document to double-click.
export const FILE_EXTENSION = '.thinktwice';

const API_URL = '/api/interview-file';

// One POST to one of the app's file functions, with the door and no cache.
// Shared with interviewMail.js.
export async function callApi(body, opts) {
  return call(body, opts);
}

async function call(body, { fetchImpl = fetch, apiUrl = API_URL } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const pw = getAppPassword();
  if (pw) headers['x-app-password'] = pw;
  let res;
  try {
    res = await fetchImpl(apiUrl, {
      method: 'POST',
      headers,
      // An interview in transit is nothing a cache may keep.
      cache: 'no-store',
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (res.status === 401) {
    clearAppPassword();
    return { ok: false, error: 'unauthorized', unauthorized: true };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    const out = { ok: false, error: json?.error ?? `http-${res.status}` };
    if (typeof json?.reason === 'string') out.reason = json.reason;
    if (json?.results && typeof json.results === 'object') out.results = json.results;
    return out;
  }
  return { ok: true, ...json };
}

export async function sealInterview(payload, opts) {
  const out = await call({ action: 'seal', payload }, opts);
  if (!out.ok) return out;
  if (out.file?.format !== FILE_FORMAT) return { ok: false, error: 'internal' };
  return { ok: true, file: out.file };
}

export async function openInterviewFile(file, opts) {
  const out = await call({ action: 'open', file }, opts);
  if (!out.ok) return out;
  if (!out.payload || typeof out.payload !== 'object') return { ok: false, error: 'internal' };
  return { ok: true, payload: out.payload };
}

// Whether parsed JSON is a sealed interview file rather than a testers' readable
// export. Only the envelope's marker is read — nothing else in it is readable.
export const isSealedFile = (parsed) => parsed?.format === FILE_FORMAT;

// "think-twice-2026-10-10-1432.thinktwice" — the date and time, in the person's
// own clock, so two files from the same day stay apart in a folder. Nothing else:
// a file name is read by every program and mailbox that touches the file.
export function interviewFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const d = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `think-twice-${d}-${p(date.getHours())}${p(date.getMinutes())}${FILE_EXTENSION}`;
}
