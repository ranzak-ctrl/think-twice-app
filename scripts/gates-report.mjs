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

out.push('## רף הקבלה\n');

if (!before || !after) {
  out.push('> ⚠ אחת ההרצות לא הפיקה דוח. ראה את הלוגים המלאים (Artifacts).\n');
}

for (const [label, r] of [['לפני (הרשם כבוי)', before], ['אחרי (הרשם דלוק)', after]]) {
  if (!r) continue;
  const judge = { ran: '✅ רץ', skipped: '⚠ דילג — המפתח חסר', rejected: '❌ נכשל' }[r.judge];
  // The unit suite and the judge are separate verdicts. A red judge with a green
  // suite means the code is fine and the API call is not, and collapsing the two
  // into one ❌ sends you looking in the wrong place.
  const units = (r.unitFailures ?? []).length
    ? `❌ נפלו: ${r.unitFailures.join(' · ')}`
    : '✅ עברו';
  out.push(`**${label}** — בדיקות היחידה: ${units} · שופט: ${judge}`);
}
out.push('');

const err = after?.judgeError || before?.judgeError;
if (err) {
  out.push('**מה השרת החזיר:**');
  out.push('```');
  out.push(err);
  out.push('```');
  // Advice has to match the error. This block used to say "re-paste your key" for
  // ANY judge failure — and the first real failure was a parsing bug in our own
  // code, where that advice would have cost a wasted cycle on a correct key.
  const looksLikeAuth = /authentication|invalid x-api-key|401|credit|billing/i.test(err);
  out.push(looksLikeAuth
    ? '> הבדיקות עצמן ירוקות — **הקוד תקין.** מה שנכשל הוא הקריאה ל-API.\n' +
      '> הסיבה הנפוצה ביותר: **רווח או שורה חדשה שנדבקו עם המפתח** לתוך הסוד ב-GitHub.\n' +
      '> מחק את הסוד, העתק את המפתח מחדש **בלי רווחים בקצוות**, והרץ שוב.'
    : '> **המפתח עבד והמודל ענה** — מה שנכשל הוא קריאת התשובה. זו לא בעיה במפתח\n' +
      '> ולא בראיון: אל תיגע בסוד. הטקסט למעלה הוא מה שהמודל באמת החזיר.');
  out.push('');
}

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
  // Why the comparison is missing decides what to do about it, and the two reasons
  // call for opposite actions. Saying "check the secret" under a block that just
  // said the key worked sends Ran to fix the one thing that is not broken.
  const skipped = [before, after].some((r) => r && r.judge === 'skipped');
  out.push(skipped
    ? '> השוואה לא אפשרית — השופט **לא רץ**. הגדר את הסוד `ANTHROPIC_API_KEY` ב-GitHub תחת Settings ← Secrets and variables ← Actions.'
    : '> השוואה לא אפשרית — השופט רץ אך לא החזיר ציונים בשתי ההרצות. הסיבה למעלה; **הסוד תקין ואין מה לשנות בו**.');
}

console.log(out.join('\n'));
