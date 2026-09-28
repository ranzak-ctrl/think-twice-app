// Builds the table CI writes into the run summary.
//
// ── WHAT THE TWO JUDGE COLUMNS ARE, AND ARE NOT ──
// They are NOT before/after on the registrar. The judge scores a FIXED fixture
// (tests/fixtures/meat-transcript.js), and REGISTRAR_ENABLED cannot change one
// character of it — so the two columns are the same measurement taken twice, and
// any gap between them is the judge's own variance.
//
// That is worth printing, just not as a delta: identical input scoring 5 and then
// 3 means the judge is too noisy to gate on, which you cannot learn from one run.
//
// Nor does the unit suite carry the registrar's effect. Measured 18.9.2026: the
// two states produce ZERO differing test outcomes — and that is the requirement
// holding, not a gap. event-model.md §8 demands the Router decide identically with
// the registrar and without it, and registrar-neutrality.test.js enforces it. So
// what this workflow proves is that the switch BREAKS nothing. Whether it HELPS is
// not measured here and must not be read into it.
//
// Measuring the registrar against the judge needs a transcript PRODUCED by a live
// interview in each state (sim/), not a fixture. Until that exists, this file must
// not imply otherwise — an earlier version of this header did.

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

// The registrar's live call — a separate verdict from the judge's. The judge grades
// the interview; this only asks whether a real model can produce the ledger's shape
// at all. It had never once been asked before 19.9.2026.
const reg = after?.registrar?.ran ? after.registrar : before?.registrar?.ran ? before.registrar : null;
if (reg) {
  if (reg.ok) {
    const n = Object.entries(reg.counts ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(' · ');
    out.push(`**הרשם מול מודל אמיתי** — ✅ הוחזר גרף תקין ונפרס. ${n || '(ריק)'}`);
  } else {
    out.push(`**הרשם מול מודל אמיתי** — ❌ ${reg.error}`);
    if (reg.raw) { out.push('```'); out.push(reg.raw); out.push('```'); }
    out.push('> כשל כאן **אינו** נראה בראיון חי: `runRegistrar` מחזיר את ה-state כמו שהוא');
    out.push('> כדי שתקלה לא תעלה למשתמש את התור שלו. כלומר רשם שנכשל בכל תור נראה בדיוק');
    out.push('> כמו רשם שעובד. **אל תדליק את המתג עד שזה ירוק.**');
  }
  out.push('');
}

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
  out.push('**ציוני השופט** — על תמליל קבוע (fixture). שתי ההרצות מזינות לשופט את **אותו טקסט בדיוק**,');
  out.push('ולכן הפער ביניהן הוא רעש של השופט עצמו — לא השפעה של הרשם.');
  out.push('');
  out.push('| ממד | הרצה 1 | הרצה 2 | פער (רעש) | מעל הסף |');
  out.push('|---|---|---|---|---|');
  let noisy = false;
  for (const d of DIMS) {
    const b = before.scores[d], a = after.scores[d];
    if (b == null && a == null) continue;
    const gap = b != null && a != null ? Math.abs(a - b) : null;
    if (gap != null && gap >= 1) noisy = true;
    // The threshold is what decides. The gap column is a stability read on the
    // judge, and only a gap of a full point or more is worth flagging.
    const gapCell = gap == null ? '—' : gap === 0 ? 'זהה' : gap >= 1 ? `⚠ ${gap.toFixed(1)}` : gap.toFixed(1);
    const low = [b, a].filter((v) => v != null).every((v) => v >= THRESHOLD);
    out.push(`| \`${d}\` | ${b ?? '—'} | ${a ?? '—'} | ${gapCell} | ${low ? '✅' : '❌ מתחת ל-4'} |`);
  }
  out.push('');
  if (before?.judgeSalvaged || after?.judgeSalvaged) {
    out.push('> ⚠ **תשובת השופט לא הייתה JSON תקין** באחת ההרצות לפחות — הציונים חולצו ממנה.');
    out.push('> הם תקפים (עברו בדיוק אותה בדיקת טווח), אבל זה סימן ש-`judge.md` צריך לבקש');
    out.push('> במפורש לא להשתמש במירכאות בתוך `notes` — שם ציטוט של המראיין שובר את ה-JSON.');
    out.push('');
  }
  if (noisy) {
    out.push('> ⚠ **השופט אינו יציב.** אותו תמליל קיבל ציונים שרחוקים בנקודה שלמה או יותר.');
    out.push('> כל עוד זה המצב, אין להסיק מציון בודד של השופט — תקן את `judge.md` לפני שמסתמכים עליו.');
    out.push('');
  }
  out.push('**מה ההרצה הזו מוכיחה:** שהמתג לא שובר כלום. שתי ההרצות אמורות לצאת זהות —');
  out.push('‏`docs/event-model.md` §8 דורש שה-Router יכריע אותו דבר עם הרשם ובלעדיו, ו-');
  out.push('‏`registrar-neutrality.test.js` אוכף את זה. זהות = הדרישה מתקיימת.');
  out.push('');
  out.push('**מה היא לא מוכיחה:** שהרשם משפר משהו. לזה דרוש ראיון חי בכל אחד משני המצבים');
  out.push('ושיפוט של שני התמלילים שייצאו ממנו — זה עוד לא קיים.');
  out.push('');
  // Below the threshold in EITHER run is below the threshold: a dimension that
  // scored 3 once and 4 once has not passed, it has been inconsistent.
  const failing = DIMS.filter((d) => [before.scores[d], after.scores[d]].some((v) => v != null && v < THRESHOLD));
  out.push(failing.length
    ? `> ❌ **לא לפרוס.** ירד מתחת לסף לפחות פעם אחת: ${failing.join(' · ')}.`
    : '> ✅ **כל הממדים מעל הסף בשתי ההרצות.** מוכן לבדיקה חיה — פרוס ל-preview והרץ ראיון אחד אמיתי.');
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
