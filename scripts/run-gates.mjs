// `npm run gates` — the acceptance gates, as one command.
//
// Written because the instructions for running them were written for a developer
// and Ran is not one. Everything the manual route needed him to know — which shell
// he is in, that a local .env does NOT reach process.env for a non-VITE_ variable,
// that the judge needs RUN_JUDGE=1 on top of a key, that `1 skipped` means it
// silently did not run — is handled here instead of explained.
//
// Output is Hebrew because it is read by Ran. Comments are English, per CLAUDE.md.
// THE KEY IS NEVER PRINTED, not even partially.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// `--out=<name>` lets CI keep the two runs apart. Two reports that cannot be told
// apart are worthless, which is the whole reason this is run twice.
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : 'gates-output.txt';
const line = '─'.repeat(64);

// A local .env is the normal place for the key on Ran's machine, and vitest does
// NOT put a non-VITE_ variable into process.env. Reading it here is the whole
// reason the manual route needed a shell incantation.
function keyFromEnvFile() {
  if (!existsSync('.env')) return '';
  for (const raw of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/.exec(raw);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return '';
}

const key = process.env.ANTHROPIC_API_KEY || keyFromEnvFile();
const keyLooksReal = key.startsWith('sk-ant-') && key.length > 30;

console.log(`\n${line}\n  שערי הקבלה — Think Twice\n${line}\n`);

if (!keyLooksReal) {
  console.log(
    'חסר מפתח ה-API, ובלעדיו שופט-ה-LLM לא ירוץ.\n\n' +
    'מה לעשות:\n' +
    '  1. פתח את הקובץ  .env  בתיקיית הפרויקט (אם אין — צור אותו)\n' +
    '  2. הוסף שורה אחת:\n' +
    '       ANTHROPIC_API_KEY=sk-ant-...\n' +
    '     (המפתח נמצא ב-Vercel, בפרויקט think-twice1, תחת Settings ← Environment Variables)\n' +
    '  3. שמור, והרץ שוב:  npm run gates\n\n' +
    'הערה: הקובץ .env לא נכנס לגיט ולא נשלח לשום מקום.\n',
  );
  process.exit(1);
}

// Which switch state we are measuring. Printed into the report so two runs can
// never be confused for each other — which is the whole point of running twice.
let registrar = 'לא ידוע';
try {
  const src = readFileSync('src/core/promptBuilder.js', 'utf8');
  registrar = /REGISTRAR_ENABLED\s*=\s*true/.test(src) ? 'דלוק ✅' : 'כבוי ⬜';
} catch { /* leave as unknown */ }

console.log(`מצב הרשם בהרצה הזו:  ${registrar}`);
console.log('מריץ את כל הבדיקות + שופט-ה-LLM. זה לוקח דקה-שתיים ועולה כמה סנטים.\n');

const child = spawn('npx', ['vitest', 'run', '--no-file-parallelism'], {
  env: { ...process.env, ANTHROPIC_API_KEY: key, RUN_JUDGE: '1' },
  shell: true,
});

let log = '';
const capture = (chunk) => {
  const text = chunk.toString();
  log += text;
  process.stdout.write(text);
};
child.stdout.on('data', capture);
child.stderr.on('data', capture);

child.on('close', (code) => {
  const scores = [...log.matchAll(/(empathy|non_judgment|ownership|active_listening|natural_hebrew)\D{0,12}(\d(?:\.\d+)?)/g)];
  // Three outcomes, not two. "It ran" and "the key was rejected" look identical in
  // a scroll of vitest output, and reporting the second as the first is exactly the
  // kind of quiet false pass this script exists to prevent.
  const judgeSkipped = !/LLM-judge acceptance/.test(log);
  const keyRejected = /authentication_error|invalid x-api-key|401/i.test(log);
  const judgeRan = !judgeSkipped && !keyRejected;

  const header =
    `שערי הקבלה — Think Twice\n` +
    `תאריך: ${new Date().toISOString()}\n` +
    `מצב הרשם: ${registrar}\n` +
    `${line}\n\n`;
  writeFileSync(OUT, header + log);

  // A machine-readable twin, so CI can build one comparison table instead of
  // asking anyone to read two logs side by side.
  writeFileSync(`${OUT}.json`, JSON.stringify({
    registrar,
    judge: judgeSkipped ? 'skipped' : keyRejected ? 'rejected' : 'ran',
    scores: Object.fromEntries(scores.map(([, d, v]) => [d, Number(v)])),
    exitCode: code ?? 1,
  }, null, 2));

  console.log(`\n${line}`);
  console.log(`  מצב הרשם בהרצה זו:  ${registrar}`);
  if (judgeSkipped) {
    // The failure that looks like success: `1 skipped` scrolls past unnoticed.
    console.log('  ⚠ שופט-ה-LLM דילג — לא רץ בכלל. בדוק שהמפתח מתחיל ב-sk-ant-');
  } else if (keyRejected) {
    console.log('  ⚠ המפתח נדחה ע"י השרת. העתק אותו שוב מ-Vercel — ייתכן שחסר תו או שפג תוקפו.');
  } else if (scores.length) {
    console.log('  ציוני השופט (הסף: 4 בכל ממד):');
    for (const [, dim, val] of scores) {
      console.log(`    ${Number(val) >= 4 ? '✅' : '❌'}  ${dim.padEnd(18)} ${val}`);
    }
  } else {
    console.log('  השופט רץ. הציונים בקובץ המלא.');
  }
  console.log(`\n  ${code === 0 ? '✅ הכול עבר' : '❌ משהו נפל — הפרטים בקובץ'}`);
  console.log(`\n  📄 שלח לי את הקובץ:  ${OUT}`);
  console.log(`${line}\n`);
  process.exit(code ?? 1);
});
