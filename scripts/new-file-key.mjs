// Print a new interview-file key, ready to append to INTERVIEW_FILE_KEYS.
//
//   node scripts/new-file-key.mjs k1
//
// Ran runs nothing on his own computer. For him the same key is made in the
// browser by docs/file-key-generator.html (published as a private page; the link
// is in DEPLOY-STATUS.md). This script is for whoever has a terminal; both write
// the format server/interviewFile.js parses.
//
// Ran adds the printed line to the Vercel project's environment (Production and
// Preview) — appended after any existing keys, comma-separated, never replacing
// one — and saves the same line in his password manager. A key that is lost is
// every file it sealed lost with it: they live on people's computers, and nothing
// else can open them (server/interviewFile.js). Never paste it into a VITE_
// variable, a commit, a chat or a doc.

import { randomBytes } from 'node:crypto';

const kid = process.argv[2] ?? 'k1';
if (!/^[a-z0-9]{1,16}$/.test(kid)) {
  console.error('The key id must be 1–16 lowercase letters or digits, e.g. k1, k2.');
  process.exit(1);
}

console.log(`${kid}:${randomBytes(32).toString('base64')}`);
console.error(
  '\nAppend this to INTERVIEW_FILE_KEYS in Vercel (Production + Preview), after the\n' +
    'existing keys and separated by a comma. Save it in your password manager too.\n' +
    'Never delete an old key: files sealed with it stop opening for good.'
);
