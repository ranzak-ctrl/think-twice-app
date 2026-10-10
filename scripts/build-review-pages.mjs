// Build the two review-and-edit pages Ran asked for on 10.10.2026:
//
//   "ממשק צפייה ועריכה בכל הקבצים שמשתנים בין מודל ראיון למודל אחר"
//   "ממשק קריאה ועריכה לכל הקבצים שמהווים תשתית מקצועית גנרית לכלל הראיונות"
//
//   node scripts/build-review-pages.mjs <out-dir>
//
// Writes <out-dir>/model-files.html and <out-dir>/shared-files.html, each a page
// for the Artifact tool (no doctype; the tool wraps it). The pages carry the files
// as they are on this branch, read straight from the repo, so rebuilding after a
// change is rerunning this script and republishing.
//
// EDITING HERE NEVER CHANGES THE CODE. A change made on a page is saved as a
// PROPOSAL in the page's own store (the artifact's `db` capability). Claude reads
// the proposals and applies them the way every change is applied: texts through
// prompt-editor, the structure with router-guard after, the gates of
// docs/model-update-test-plan.md, then a commit — and marks each proposal applied
// or declined on the page. That keeps CLAUDE.md's rules ("only prompt-editor edits
// the prompts", "router-guard reviews pack.js") while letting Ran and Natali edit.
//
// Which file is a model's and which is shared is docs/model-update-test-plan.md §1.
// The output holds the interview's prompts: publish it as a private artifact only.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/build-review-pages.mjs <out-dir>');
  process.exit(1);
}

const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).toString().trim();
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
const built = ((d) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`)(new Date());

const { thinkTwiceAdult: pack } = await import(pathToFileURL(join(root, 'src/packs/think-twice-adult/pack.js')).href);

// ── What each file is, who changes it, and what runs after ──

const GATES = {
  text: 'טביעות האצבע · lint התור · תסריטי הזהב · פרסונות ההתנגדות · שופט · הרצה חיה (`/live-test`)',
  shared: 'כל שערי הטקסט, על **כל** המודלים · קריאה מול הבלוקים הייחודיים של כל מודל · הרצה חיה לכל מודל',
  structure: 'מטריצת המעברים · החוזה הכתוב ביד · `validatePack` · ראיון שלם (`pack-run`). אם משתנה משמעות ה-state: גרסה + צעד הסבה + קובץ קפוא',
  mapping: 'טביעות האצבע (מיפוי שגוי נתפס רק שם)',
  migration: 'קובץ קפוא מכל גרסה נפתח · צעד לכל גרסה (`tests/ui/interview-file.test.js`)',
  safety: 'אישור מפורש של נטלי · 100% תסריטי בטיחות בכל מודל · אף דפוס לא מוסר או נחלש',
  doc: 'אין שער בקוד. בסתירה קלינית — הדרייב מכריע',
  code: '`router-guard` · כל הבדיקות',
};

const stageTitle = (n) => {
  const s = pack.stages[n - 1];
  return `שלב ${n} · ${s.name} — ${s.label}`;
};

const MODEL = {
  id: 'model',
  title: 'קבצי מודל הראיון',
  accent: ['#2f4fb3', '#8aa6ff'],
  lede: 'כל הקבצים שמשתנים בין מודל ראיון אחד לאחר: המבנה, הטקסטים של המודל, השופט, ההסבות והמסמכים שלו.',
  models: [
    { id: 'think-twice-adult', name: 'Think Twice · אישי', ready: true },
    { id: 'think-twice-parent', name: 'Think Twice · הורים', ready: false, why: 'המודל עוד לא נבנה. נטלי שולחת השבוע מודל מעודכן, וכשייבנה הקבצים שלו יופיעו כאן. בינתיים אפשר לרשום הערה כללית למודל.' },
  ],
  groups: [
    ['המבנה', [
      ['src/packs/think-twice-adult/pack.js', 'המבנה של הראיון', 'שלבים, slots, דגלים (חסום · תודעה), ספי ה-Router, תלויות, תוויות ו-signposts. נתונים בלבד.', 'Claude, אחרי הכרעה קלינית · `router-guard` סוקר', 'structure'],
      ['src/packs/think-twice-adult/prompts.js', 'מיפוי הטקסטים', 'איזה קובץ טקסט הוא איזה חלק בראיון.', '`prompt-editor` בלבד', 'mapping'],
      ['src/packs/think-twice-adult/migrations.js', 'הסבת קבצים בין גרסאות', 'צעד לכל העלאת גרסה, כדי שקובץ של משתמש מגרסה קודמת ייפתח.', 'Claude · `router-guard` סוקר', 'migration'],
    ]],
    ['הנחיות המראיין', [
      ['src/content/prompts/guidelines/think-twice-adult.md', 'הנחיות ייחודיות למודל', 'גוברות על הנחיות-העל, בלוק מול בלוק. בלוק נעול של העל אי אפשר לדרוס.', '`prompt-editor` בלבד', 'text'],
    ]],
    ['סוכני השלבים', [1, 2, 3, 4, 5, 6, 7].map((n) => {
      const file = ['stage1-intake', 'stage2-interpretation', 'stage3-feel', 'stage4-react', 'stage5-transform', 'stage6-alternatives', 'stage7-decision'][n - 1];
      return [`src/content/prompts/agents/${file}.md`, stageTitle(n), 'הסוכן של השלב: מה המראיין מחפש בו ואיך הוא שואל.', '`prompt-editor` בלבד', 'text'];
    })],
    ['דיווח ורישום — מעורב', [
      ['src/content/prompts/evaluator.md', 'המעריך', 'חוזה הדיווח, והגדרות ה-slots של המבוגרים. יושב בתיקייה המשותפת, אבל התוכן שלו של המודל. יפוצל.', '`prompt-editor` בלבד', 'text'],
      ['src/content/prompts/registrar.md', 'הרשם', 'מפרק כל תור לגרף. עם דוגמאות של המבוגרים. יפוצל.', '`prompt-editor` בלבד', 'text'],
    ]],
    ['השופט', [
      ['src/content/prompts/judge.md', 'רובריקת השופט', 'איך שופט-LLM מדרג תמליל. לבדיקות בלבד, לא נשלח לדפדפן.', '`prompt-editor` בלבד · הרובריקה ממתינה לנטלי (§3)', 'text'],
      ['src/packs/think-twice-adult/judge.js', 'חיבור השופט', 'מחבר את הרובריקה לחבילה, מחוץ ל-bundle.', '`prompt-editor` בלבד', 'mapping'],
    ]],
    ['מסמכים של המודל', [
      ['docs/presenting-document.md', 'המסמך המציג', 'הכלי במלואו. האמת הטכנית; האמת הקלינית בדרייב.', 'Claude, לפי הדרייב', 'doc'],
      ['docs/transition-protocol.md', 'מערך הראיון', 'Slots, מבחני מדידה ותנאי מעבר.', 'Claude, לפי הדרייב', 'doc'],
      ['docs/questions-for-natali.md', 'שאלות לנטלי', 'שאלות קליניות פתוחות והכרעות שהתקבלו.', '`clinical-triage` · `/natali-decided`', 'doc'],
    ]],
  ],
};

const SHARED = {
  id: 'shared',
  title: 'תשתית מקצועית משותפת',
  accent: ['#0a6a65', '#55c4b9'],
  lede: 'הקבצים שכל מודלי הראיון חולקים. שינוי כאן הוא שינוי בכל הראיונות בבת אחת, ולכן נבדק על כולם.',
  models: null,
  groups: [
    ['הנחיות המראיין', [
      ['src/content/prompts/guidelines/super.md', 'הנחיות-העל', 'חלות על כל מראייני Think Twice. בלוק נעול (`locked`) — היום "שאלה אחת בכל תור" — אי אפשר לדרוס במודל.', '`prompt-editor` בלבד', 'shared'],
    ]],
    ['אומנות הראיון', [
      ['src/content/prompts/resistance.md', 'פרוטוקול ההתנגדויות', 'הנמנע, הבורח, המוצף, הציני, מחפש העצה.', '`prompt-editor` בלבד', 'shared'],
      ['src/content/prompts/summary.md', 'הסיכום', 'איך מסכמים שלב לאישור המשתמש.', '`prompt-editor` בלבד', 'shared'],
      ['src/content/prompts/opener.md', 'הפתיח המעוגן', 'איך נפתח שלב חדש, או חזרה לנושא, מתוך דברי המשתמש.', '`prompt-editor` בלבד', 'shared'],
      ['src/content/prompts/board.md', 'לוח ההכרעה', 'איך מוצגות החלופות לפני ההכרעה.', '`prompt-editor` בלבד', 'shared'],
    ]],
    ['גבולות', [
      ['src/content/forbidden.js', 'רשימת ה"אסור"', 'נכנסת לכל פרומפט. שורת הז\'רגון היא כלל של המבוגרים בלבד, ותצא למודל לפני ראיון ההורים.', '`prompt-editor` בלבד', 'shared'],
      ['src/safety/index.js', 'שכבת הבטיחות', 'דפוסי המצוקה, הודעת העצירה וקו העזרה. אסור להסיר, לעקוף או להחליש.', 'רק באישור נטלי', 'safety'],
    ]],
    ['אוצר המילים והמנגנון', [
      ['src/core/vocabulary.js', 'אוצר המילים של הגרף', 'יישויות, קשתות וצירים שהרשם והמפה מכירים.', 'Claude · `router-guard` סוקר', 'code'],
      ['src/core/guidelines.js', 'הרכבת ההנחיות', 'המנגנון שמרכיב על + ייחודי, ואוכף בלוק נעול.', 'Claude · `router-guard` סוקר', 'code'],
    ]],
    ['עקרונות מקצועיים', [
      ['docs/principle-zero.md', 'עיקרון 0', 'הובלה, התנגדויות ורשימות "אסור".', 'Claude, לפי הדרייב', 'doc'],
      ['docs/core-assumptions.md', 'הנחות היסוד', 'הנחות היסוד הקליניות של Think Twice. ייבדקו מול ראיון ההורים.', 'Claude, לפי הדרייב', 'doc'],
      ['docs/gap-management.md', 'ניהול פערים', 'התפיסה: סתירות שנרשמות ולא משתקפות למשתמש.', 'Claude, לפי הדרייב', 'doc'],
      ['docs/event-model.md', 'מודל המאורע', 'פירוק ליישויות, ריבוד והרשם.', 'Claude, לפי הדרייב', 'doc'],
      ['docs/event-vocabulary.md', 'אוצר המילים — המסמך', 'יישויות, קשתות וצירים, כרשימה לניהול.', 'Claude, לפי הדרייב', 'doc'],
    ]],
  ],
};

// ── The structure of pack.js, as a table a clinician can read ──

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const COMPONENT = { castClarity: 'בדיקת הקאסט', intensity: 'מדידת עוצמת רגש', collector: 'איסוף חלופות', decision: 'הכרעה' };
function packTable(p) {
  const rows = p.stages.map((s, i) => {
    const slots = s.slots
      .map((x) => `<span class="slot${x.barred ? ' barred' : ''}">${esc(x.id)}${x.barred ? ' · חסום' : ''}${x.mental ? ' · תודעה' : ''}</span>`)
      .join(' ');
    const comps = (s.components ?? []).map((c) => COMPONENT[c.type] ?? c.type).join(' · ') || '—';
    const req = (s.requires ?? []).map((k) => `שלב ${k.replace('stage', '')}`).join(', ') || '—';
    return `<tr><td>${i + 1} · ${esc(s.name)}<br><small>${esc(s.label)}</small></td><td>${slots}</td><td>${comps}</td><td>${req}</td><td>${s.loadGuard ?? p.routing.loadGuard}</td><td><small>${esc(s.signpost ?? '')}</small></td></tr>`;
  });
  const r = p.routing;
  return `<p class="pack-meta"><b>${esc(p.name)}</b> · <code>${esc(p.id)}</code> · גרסה ${p.version} · סף רך ${r.softThreshold * 100}% · מיצוי ${r.saturationLimit} תורות · חסד תיקון ${r.rejectGrace} תורות</p>
<div class="tablewrap"><table class="pack"><thead><tr><th>שלב</th><th>slots</th><th>רכיבים</th><th>דורש</th><th>מגן עומס</th><th>signpost</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
<p class="pack-note">חסום = לעולם לא מוצג למשתמש (המוגלה והנרמול). תודעה = slot של מחשבה או רגש. מגן העומס הוא ערך ביניים, עד גלאי עייפות (שאלות לנטלי §1).</p>`;
}

// ── Collect ──

// A shallow clone (as in a cloud session) ends at a cut-off commit, and git names
// that commit as the last change of every file older than it. Say so instead.
let shallow = new Set();
try {
  shallow = new Set(readFileSync(join(root, '.git/shallow'), 'utf8').split('\n').filter(Boolean));
} catch {
  shallow = new Set();
}

function lastChange(path) {
  try {
    const [hash, short, date, ...subject] = execFileSync('git', ['log', '-1', '--format=%H%x09%h%x09%ad%x09%s', '--date=short', '--', path], { cwd: root })
      .toString()
      .trim()
      .split('\t');
    if (!hash) return '';
    if (shallow.has(hash)) return `${date} או לפני · ההיסטוריה בעותק הזה קצרה מכדי לדעת מתי בדיוק`;
    return `${short} · ${date} · ${subject.join('\t')}`;
  } catch {
    return '';
  }
}

function fileEntry([path, title, role, editor, gate]) {
  const text = readFileSync(join(root, path), 'utf8');
  const last = lastChange(path);
  return {
    path,
    title,
    role,
    editor,
    gates: GATES[gate],
    kind: path.endsWith('.md') ? 'md' : 'code',
    hash: createHash('sha256').update(text).digest('hex').slice(0, 12),
    last,
    text,
    structured: path.endsWith('/pack.js') ? packTable(pack) : null,
  };
}

function pageData(cfg) {
  return {
    id: cfg.id,
    title: cfg.title,
    lede: cfg.lede,
    models: cfg.models,
    branch,
    head,
    built,
    groups: cfg.groups.map(([name, files]) => ({ name, files: files.map(fileEntry) })),
  };
}

// ── The page ──

const template = readFileSync(join(root, 'scripts/review-page.template.html'), 'utf8');

mkdirSync(outDir, { recursive: true });
for (const [cfg, name] of [[MODEL, 'model-files.html'], [SHARED, 'shared-files.html']]) {
  const data = pageData(cfg);
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = template
    .replaceAll('%%TITLE%%', esc(cfg.title))
    .replaceAll('%%ACCENT%%', cfg.accent[0])
    .replaceAll('%%ACCENT_DARK%%', cfg.accent[1])
    .replace('%%DATA%%', () => json);
  writeFileSync(join(outDir, name), html);
  const files = data.groups.reduce((n, g) => n + g.files.length, 0);
  console.log(`wrote ${join(outDir, name)}: ${files} files, ${Math.round(html.length / 1024)} KB`);
}
