// `npm run registrar:on` / `npm run registrar:off` — flip REGISTRAR_ENABLED without
// opening a file.
//
// Ran works on a Mac and is not a developer. Telling him to open promptBuilder.js
// and change one word means opening a .js file in TextEdit, which can save it as
// RTF and break the build in a way that looks nothing like its cause. One command
// removes the whole class of problem.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/core/promptBuilder.js';
const want = process.argv[2] === 'on';
const src = readFileSync(FILE, 'utf8');

const current = /REGISTRAR_ENABLED\s*=\s*(true|false)/.exec(src);
if (!current) {
  console.error('\n  ❌ לא מצאתי את המתג בקובץ. אל תשנה ידנית — ספר לי.\n');
  process.exit(1);
}

const state = (on) => (on ? 'דלוק ✅' : 'כבוי ⬜');
if ((current[1] === 'true') === want) {
  console.log(`\n  הרשם כבר ${state(want)} — לא שיניתי כלום.\n`);
  process.exit(0);
}

writeFileSync(FILE, src.replace(
  /REGISTRAR_ENABLED\s*=\s*(?:true|false)/,
  `REGISTRAR_ENABLED = ${want}`,
));
console.log(`\n  הרשם עכשיו ${state(want)}\n\n  השלב הבא:  npm run gates\n`);
