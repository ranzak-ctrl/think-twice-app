// The interview file by email, from the browser's side (Ran, 14.10.2026).
//
// The sealed file goes to /api/send-interview (api/send-interview.js), which
// proves it is a real interview file and mails it as an attachment. The
// addresses are typed on the end screen, sent once, and kept nowhere — not here,
// not in the file, not on the server.
//
//   mailAvailable()  → true | false — whether this deployment can send mail
//   sendInterviewMail({ file, self, other, fileName })
//                    → { ok: true, results } | { ok: false, error, results?, unauthorized? }

import { getAppPassword } from './appAuth.js';
import { callApi } from './interviewFile.js';

const API_URL = '/api/send-interview';

export async function mailAvailable({ fetchImpl = fetch, apiUrl = API_URL } = {}) {
  try {
    const headers = {};
    const pw = getAppPassword();
    if (pw) headers['x-app-password'] = pw;
    const res = await fetchImpl(apiUrl, { method: 'GET', headers, cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.available === true;
  } catch {
    return false;
  }
}

export async function sendInterviewMail({ file, self, other, fileName }, { fetchImpl = fetch, apiUrl = API_URL } = {}) {
  const out = await callApi({ file, self: self || undefined, other: other || undefined, fileName }, { fetchImpl, apiUrl });
  if (!out.ok) return out;
  return { ok: true, results: out.results ?? {} };
}
