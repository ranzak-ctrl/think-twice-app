// Builds the comparison table CI writes into the run summary.
//
// The point is the DELTA. A judge score of 4.2 after the registrar means nothing
// on its own; 4.6 before and 4.2 after means something, and it is the only form of
// this number worth acting on.

import { readFileSync, existsSync } from 'node:fs';

const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const before = read('gates-before.txt.json');
const after = read('gates-after.txt.json');

const DIMS = ['empathy', 'non_judgment', 'ownership', 'active_listening', 'natural_hebrew'];
const THRESHOLD = 4;
const out = [];

out.push('## שערי קבלה\n');

if (!before || !after) {
  out.push('> ⚠ אחת ההרצות לא הפיקה דוח. ראה את הלוגים המלאים (Artifacts).\n');
}

for (const [label, r] of [['לפני (הרשם כבוי)', before], ['אחרי (הרשם דלוק)', after]]) {
  if (!r) continue;
  const judge = { ran: '✅ רץ', skipped: '⚠ דילג — המפתח חסר', rejected: '⚠ המפתח נדחה' }[r.judge];
  out.push(`**${label}** — בדיקות: ${r.exitCode === 0 ? '✅ עברו' : '❌ נפלו'} · שופט: ${judge}`);
}
out.push('');

if (before?.judge === 'ran' && after?.judge === 'ran') {
  out.push('| ממד | לפני | אחרי | שינוי | |');
  out.push('|---|---|---|---|---|');
  for (const d of DIMS) {
    const b = before.scores[d], a = after.scores[d];
    if (b == null && a == null) continue;
    const delta = b != null && a != null ? (a - b) : null;
    const arrow = delta == null ? '' : delta > 0.05 ? `▲ +${delta.toFixed(1)}` : delta < -0.05 ? `▼ ${delta.toFixed(1)}` : '=';
    // The threshold is what decides, not the direction: a drop that stays above 4
    // is information, a score below 4 is a blocker.
    out.push(`| \`${d}\` | ${b ?? '—'} | ${a ?? '—'} | ${arrow} | ${a >= THRESHOLD ? '✅' : '❌ מתחת ל-4'} |`);
  }
  out.push('');
  const failing = DIMS.filter((d) => after.scores[d] != null && after.scores[d] < THRESHOLD);
  out.push(failing.length
    ? `> ❌ **לא לפרוס.** מתחת לסף: ${failing.join(' · ')}. הרץ \`npm run registrar:off\`, או תקן ונסה שוב.`
    : '> ✅ **כל הממדים מעל הסף.** מוכן לבדיקה חיה — פרוס ל-preview והרץ ראיון אחד אמיתי.');
} else {
  out.push('> השוואה לא אפשרית — השופט לא רץ בשתי ההרצות. בדוק שהסוד `ANTHROPIC_API_KEY` מוגדר ב-GitHub.');
}

console.log(out.join('\n'));
