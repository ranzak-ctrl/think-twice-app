// Builds the Claude Design sync bundle from the live source of truth.
//
//   node design/build.mjs   ->   design/dist/**
//
// Every card inlines the real src/ui/styles.css, so a preview can never drift
// from the shipped UI. Re-run after any style change, then re-sync.
//
// All specimen copy is lifted from the golden "meat" script
// (tests/fixtures/meat-transcript.js) — real Hebrew, real emotional arc, never
// lorem ipsum. Nothing here authors new clinical content.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'design', 'dist');

const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
const brief = readFileSync(join(root, 'design/brief.md'), 'utf8');

/* ------------------------------------------------------------------ page -- */

// Specimen chrome. Deliberately neutral so it never reads as part of the design
// under review — labels are Hebrew because Natali is the reviewer.
const SPECIMEN = `
  body { overflow: auto; height: auto; background: var(--bg); }
  .sheet { padding: 28px 24px 40px; max-width: 1100px; margin-inline: auto; }
  .sheet > h1 { font-size: 19px; margin: 0 0 4px; }
  .sheet > .sub { color: var(--text-muted); font-size: 13px; margin: 0 0 24px; }
  .spec { margin-bottom: 26px; }
  .spec-label {
    font-size: 11px; letter-spacing: .04em; color: var(--text-faint);
    margin-bottom: 8px; font-weight: 600;
  }
  .frame {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .frame.plain { background: var(--bg); }
  .note {
    font-size: 12px; color: var(--text-muted); line-height: 1.6;
    background: var(--surface-sunken); border: 1px solid var(--border);
    border-inline-start: 3px solid var(--brand);
    border-radius: var(--radius-sm); padding: 10px 12px; margin-top: 10px;
  }
`;

function card({ group, title, sub, body, extra = '', dir = 'rtl' }) {
  return `<!-- @dsCard group="${group}" -->
<!DOCTYPE html>
<html lang="he" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${css}</style>
<style>${SPECIMEN}${extra}</style>
</head>
<body>
<div class="sheet">
<h1>${title}</h1>
<p class="sub">${sub}</p>
${body}
</div>
</body>
</html>
`;
}

const spec = (label, inner, note = '') =>
  `<div class="spec"><div class="spec-label">${label}</div>${inner}${
    note ? `<div class="note">${note}</div>` : ''
  }</div>`;

/* ------------------------------------------------------- shared fragments -- */

const MARK = (s = 16) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>`;

const SEND = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H7m0 0 5-5m-5 5 5 5"/></svg>`;

const icon = (d, s = 16) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ICONS = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  download: icon('<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  upload: icon('<path d="M12 21V9m0 0 4 4m-4-4-4 4"/><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>'),
  gauge: icon('<path d="M12 21a9 9 0 1 0-9-9"/><path d="M3 12h3M12 3v3M18.4 5.6l-2.1 2.1"/><path d="m12 12 4-2"/>'),
  check: icon('<path d="m4 12 5 5L20 6"/>'),
  pencil: icon('<path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z"/>'),
};

const msg = (role, text, { grouped = false, at = '' } = {}) => `
  <div class="msg ${role}${grouped ? ' grouped' : ''}">
    ${role === 'assistant' ? `<div class="avatar${grouped ? ' ghost' : ''}">${MARK()}</div>` : ''}
    <div class="bubble-wrap">
      <div class="bubble">${text}</div>
      ${at ? `<div class="stamp">${at}</div>` : ''}
    </div>
  </div>`;

const typing = () => `
  <div class="msg assistant">
    <div class="avatar">${MARK()}</div>
    <div class="bubble-wrap">
      <div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div>
    </div>
  </div>`;

const composer = ({ text = '', disabled = false, placeholder = 'כתוב כאן…' } = {}) => `
  <div class="composer">
    <div class="composer-inner${disabled ? ' disabled' : ''}">
      <textarea rows="1" ${disabled ? 'disabled' : ''} placeholder="${placeholder}">${text}</textarea>
      <button class="send"${text ? '' : ' disabled'}>${SEND}</button>
    </div>
    <div class="hint">Enter לשליחה · Shift+Enter לשורה חדשה</div>
  </div>`;

const stageMeter = (stage) => `
  <div class="stage">
    <span class="stage-label">שלב ${stage}/7</span>
    <span class="stage-track">
      ${[1, 2, 3, 4, 5, 6, 7]
        .map(
          (n) =>
            `<span class="stage-seg${n < stage ? ' done' : n === stage ? ' current' : ''}"></span>`
        )
        .join('')}
    </span>
  </div>`;

const header = (stage) => `
  <header class="header">
    <div class="brand"><span class="brand-mark">${MARK(20)}</span>Think Twice</div>
    <div class="header-spacer"></div>
    ${stageMeter(stage)}
    <div class="header-actions">
      <button class="btn">${ICONS.plus}<span class="btn-label">ראיון חדש</span></button>
      <button class="btn">${ICONS.download}<span class="btn-label">ייצוא</span></button>
      <button class="btn">${ICONS.upload}<span class="btn-label">ייבוא</span></button>
      <button class="btn">${ICONS.gauge}<span class="btn-label">מדריך</span></button>
    </div>
  </header>`;

const confirmBar = () => `
  <div class="confirm">
    <div class="confirm-inner">
      <span class="confirm-label">הסיכום מדויק?</span>
      <button class="btn btn-ok">${ICONS.check}מדויק</button>
      <button class="btn">${ICONS.pencil}רוצה לתקן</button>
    </div>
  </div>`;

// Only rows the golden script actually contains. A design specimen must not
// invent clinical content.
const BOARD_ROWS = [
  ['לדבר איתו ישירות', 'יחסי עבודה תקינים ובשר טוב', 'דורש לחזור ולהיות פגיע קצת'],
  ['להתפטר', 'לא צריך להתעמת בכלל', 'לאבד מקום עבודה בגלל אירוע אחד'],
];

const board = () => `
  <div class="board">
    <table>
      <thead><tr><th>אפשרות</th><th>יתרון</th><th>חיסרון</th></tr></thead>
      <tbody>
        ${BOARD_ROWS.map(
          ([o, p, c]) => `<tr><td>${o}</td><td>${p}</td><td>${c}</td></tr>`
        ).join('')}
      </tbody>
    </table>
  </div>`;

/* --------------------------------------------------------------- markdown -- */

// Minimal renderer for exactly the subset brief.md uses.
function md(src) {
  const inline = (s) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  const lines = src.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    if (/^---+$/.test(line.trim())) { html.push('<hr />'); i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      html.push(`<h${lvl} dir="auto">${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(inline(lines[i].slice(2)));
        i++;
      }
      html.push(`<blockquote dir="auto">${buf.join('<br />')}</blockquote>`);
      continue;
    }

    // table
    if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (r) =>
        r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i]));
        i++;
      }
      html.push(
        `<table><thead><tr>${head
          .map((c) => `<th dir="auto">${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr>${r.map((c) => `<td dir="auto">${inline(c)}</td>`).join('')}</tr>`
          )
          .join('')}</tbody></table>`
      );
      continue;
    }

    const listType = /^\s*\d+\.\s/.test(line) ? 'ol' : /^\s*[-*]\s/.test(line) ? 'ul' : null;
    if (listType) {
      const items = [];
      const re = listType === 'ol' ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      while (i < lines.length && re.test(lines[i])) {
        items.push(`<li dir="auto">${inline(lines[i].match(re)[1])}</li>`);
        i++;
      }
      html.push(`<${listType}>${items.join('')}</${listType}>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|>\s|---|\s*[-*]\s|\s*\d+\.\s|\|)/.test(lines[i])) {
      buf.push(inline(lines[i]));
      i++;
    }
    if (buf.length) html.push(`<p dir="auto">${buf.join(' ')}</p>`);
  }

  return html.join('\n');
}

/* ------------------------------------------------------------------ cards -- */

const cards = {};

// 00 — the brief. The most important file in the bundle.
cards['00-clinical-brief.html'] = card({
  group: '00 · Brief',
  title: 'Clinical Design Brief — read first',
  sub: 'האילוצים הקליניים שכל שינוי עיצובי חייב לכבד. נגזר מעיקרון 0 ומהמסמך המציג.',
  dir: 'ltr',
  extra: `
    .sheet { max-width: 820px; }
    .doc { background: var(--surface); border: 1px solid var(--border);
           border-radius: var(--radius); padding: 30px 34px; line-height: 1.7;
           font-size: 14.5px; }
    .doc h1 { font-size: 24px; margin: 0 0 14px; }
    .doc h2 { font-size: 18px; margin: 30px 0 10px; padding-bottom: 6px;
              border-bottom: 1px solid var(--border); }
    .doc h3 { font-size: 15px; margin: 20px 0 8px; }
    .doc p { margin: 0 0 12px; }
    .doc ul, .doc ol { margin: 0 0 14px; padding-inline-start: 22px; }
    .doc li { margin-bottom: 7px; }
    .doc code { background: var(--surface-sunken); border: 1px solid var(--border);
                border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }
    .doc blockquote { margin: 0 0 16px; padding: 12px 16px;
                      border-inline-start: 3px solid var(--brand);
                      background: var(--surface-sunken); border-radius: var(--radius-sm);
                      color: var(--text); }
    .doc hr { border: none; border-top: 1px solid var(--border); margin: 26px 0; }
    .doc table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13.5px; }
    .doc th, .doc td { text-align: start; padding: 8px 10px;
                       border: 1px solid var(--border); vertical-align: top; }
    .doc th { background: var(--surface-sunken); }
  `,
  body: `<div class="doc">${md(brief)}</div>`,
});

// 01 — foundations
const swatch = (name) => `
  <div style="text-align:start">
    <div style="height:52px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--${name})"></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px;direction:ltr;text-align:start">--${name}</div>
  </div>`;

cards['01-foundations.html'] = card({
  group: 'Foundations',
  title: 'Foundations — tokens',
  sub: 'כל ערך בממשק נגזר מהטוקנים האלה. שינוי צבע או רדיוס כאן משנה את כל האפליקציה.',
  extra: `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}`,
  body: [
    spec(
      'צבע',
      `<div class="grid">${['bg', 'surface', 'surface-sunken', 'surface-accent', 'border', 'border-strong', 'ink', 'ink-hover', 'brand', 'ok', 'warn', 'danger']
        .map(swatch)
        .join('')}</div>`,
      'הצבעים הסמנטיים (ok / warn / danger) משמשים כמעט רק בפאנל המדריך. בשיחה עצמה — אין אדום. זה מכוון: סימון שגיאה על מה שהמשתמש כתב נקרא כביקורת.'
    ),
    spec(
      'טיפוגרפיה — מחסנית מערכת, ללא פונט חיצוני',
      `<div class="frame" style="padding:20px">
        <div style="font-size:19px;font-weight:700;margin-bottom:10px">19 · כותרת מסך</div>
        <div style="font-size:15px;line-height:1.65;margin-bottom:10px">15 / 1.65 · גוף ההודעה — זה הגודל שבו נקרא כל הראיון. "הזמנתי משלוח בשר למסעדה. כשהוא הגיע ראיתי שהוא לא באיכות שסיכמנו."</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">13 · כפתורים ושלד</div>
        <div style="font-size:11px;color:var(--text-faint)">11 · חותמת זמן ורמזים</div>
      </div>`,
      'גודל הגוף וגובה השורה הם החלטה עיצובית פתוחה: כמה אוויר צריך קורא מוצף? זה אחד הדברים שכדאי לבחון בפאס הזה.'
    ),
    spec(
      'רדיוס · צל · רוחב עמודה',
      `<div class="frame" style="padding:20px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
        ${['radius-sm', 'radius', 'radius-lg']
          .map(
            (r) =>
              `<div style="text-align:center"><div style="width:74px;height:54px;background:var(--surface-sunken);border:1px solid var(--border-strong);border-radius:var(--${r})"></div><div style="font-size:11px;color:var(--text-muted);margin-top:6px;direction:ltr">--${r}</div></div>`
          )
          .join('')}
        ${['shadow-sm', 'shadow-md', 'shadow-lg']
          .map(
            (s) =>
              `<div style="text-align:center"><div style="width:74px;height:54px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--${s})"></div><div style="font-size:11px;color:var(--text-muted);margin-top:6px;direction:ltr">--${s}</div></div>`
          )
          .join('')}
      </div>`,
      '<code>--column: 46rem</code> — רוחב עמודת הקריאה. אורך שורה הוא שיקול קליני כאן, לא רק אסתטי.'
    ),
  ].join(''),
});

// 02 — messages
cards['02-messages.html'] = card({
  group: 'Chat',
  title: 'Messages',
  sub: 'תוכן אמיתי מתסריט הזהב "קניתי בשר לא איכותי". הסוכן מימין (התחלת הציר), המשתמש משמאל.',
  body: [
    spec(
      'חוזה הפתיחה — המסך הראשון שהמשתמש רואה',
      `<div class="frame"><div class="column">${msg(
        'assistant',
        'אני אוביל אותך שלב-שלב. התפקיד שלך — לענות בכנות, שאלה אחת בכל פעם. ההחלטה בסוף — שלך לגמרי. אפשר לעצור מתי שרוצים.<br /><br />ספר לי — מה קרה?',
        { at: '09:14' }
      )}</div></div>`,
      'זהו עיקרון 0 בפעולה: ההודעה הזו ממסדת את חלוקת האחריות. היא מגיעה לפני שהמשתמש הקליד מילה — ולכן היא נושאת את כל משקל הרושם הראשוני.'
    ),
    spec(
      'חילופי דברים — הרגע הסוער',
      `<div class="frame"><div class="column">
        ${msg('user', 'הזמנתי משלוח בשר למסעדה. כשהוא הגיע ראיתי שהוא לא באיכות שסיכמנו. אמרתי לספק שזה לא טוב, ופשוט עזבתי את המטבח באמצע המשמרת.', { at: '09:15' })}
        ${msg('assistant', 'מי עוד היה שם באותו רגע?', { at: '09:15' })}
        ${msg('user', 'הסו-שף והספק. שניהם הסתכלו עליי כשיצאתי.', { at: '09:16' })}
        ${msg('assistant', 'ומה קרה מיד אחרי?', { at: '09:16' })}
      </div></div>`,
      'שאלה מכוונת אחת בכל תור — לעולם לא שתיים. המסך אף פעם לא מציג שתי בקשות במקביל.'
    ),
    spec(
      'שיא רגשי — שלב 3',
      `<div class="frame"><div class="column">
        ${msg('assistant', 'כשאתה מסתכל על התמונה הזו — איזה רגש זה מעורר?', { at: '09:31' })}
        ${msg('user', 'עלבון. ממש עלבון עמוק.', { at: '09:32' })}
        ${msg('user', 'שמונה. אולי תשע באותו רגע.', { grouped: true, at: '09:32' })}
      </div></div>`,
      'ההודעה השנייה של המשתמש מקובצת (<code>.grouped</code>) — מרווח קטן יותר, בלי זנב לבועה. שאלה: האם הבועה הכהה נקראת כ"הקול שלו" או כ"ציטוט שמוחזר אליו"?'
    ),
    spec(
      'המתנה לתשובה',
      `<div class="frame"><div class="column">${msg('user', 'אני לא יודע.', { at: '09:33' })}${typing()}</div></div>`,
      'תשובה בת שתי מילים חייבת להיראות לגיטימית לחלוטין. הנמנע עונה ככה, והפרוטוקול מרחיב את השאלה במקום לצמצם — שום דבר במסך לא רומז שנדרש אורך.'
    ),
  ].join(''),
});

// 03 — composer
cards['03-composer.html'] = card({
  group: 'Chat',
  title: 'Composer',
  sub: 'שלושת המצבים. הקלדה נשארת פתוחה גם בזמן שהמודל עובד — רק השליחה חסומה.',
  body: [
    spec('ריק', `<div class="frame plain">${composer()}</div>`),
    spec('עם טקסט', `<div class="frame plain">${composer({ text: 'הסו-שף והספק. שניהם הסתכלו עליי כשיצאתי.' })}</div>`),
    spec(
      'נעול — ממתין לאישור סיכום',
      `<div class="frame plain">${composer({ disabled: true, placeholder: 'אשר את הסיכום כדי להמשיך' })}</div>`,
      'זה השער האמיתי היחיד בממשק. הוא נעול כי הראיון באמת מחכה להכרעה — לא כדי ללחוץ.'
    ),
  ].join(''),
});

// 04 — confirmation
cards['04-confirmation.html'] = card({
  group: 'Decision points',
  title: 'Summary confirmation — decision point 1 of 2',
  sub: 'אחת משתי נקודות ההחלטה היחידות בכל הראיון.',
  body: [
    spec(
      'אישור סיכום',
      `<div class="frame"><div class="column">${msg(
        'assistant',
        'אז ככה זה מסתדר: הזמנת בשר שלא עמד בסיכום, אמרת לספק שזה לא טוב, ויצאת מהמטבח באמצע משמרת. הסו-שף והספק ראו את זה. אחר כך התקשרת למנהל ואמרת שאתה לא חוזר היום.',
        { at: '09:22' }
      )}</div>${confirmBar()}</div>`,
      'זו נקודת החלטה על <b>דיוק</b>, לא על ניווט. "רוצה לתקן" פותח את הנושא מחדש — הוא לא שואל את המשתמש לאן להמשיך. השאלה העיצובית: האם זה מרגיש כמו קבלת העט, או כמו טופס לאישור?'
    ),
  ].join(''),
});

// 05 — board
cards['05-decision-board.html'] = card({
  group: 'Decision points',
  title: 'Decision board — decision point 2 of 2',
  sub: 'נבנה בקוד מתוך ה-state. המודל מדווח שורות כנתונים — הוא לעולם לא מרנדר את הטבלה.',
  body: [
    spec(
      'לוח ההכרעה — שלב 7',
      `<div class="frame"><div class="column">${msg(
        'assistant',
        'הנה האפשרויות שאספנו, במילים שלך. במה אתה בוחר?',
        { at: '10:04' }
      )}${board()}</div>${composer()}</div>`,
      '<b>אילוץ קשיח:</b> לכל השורות חייב להיות משקל חזותי זהה. אסור להדגיש, לדרג, לסמן בכוכבית או לבחור מראש — כל אלה נקראים כהמלצה, וזה אסור מפורשות. השורות כאן לקוחות מתסריט הזהב בלבד.'
    ),
  ].join(''),
});

// 06 — header
cards['06-header.html'] = card({
  group: 'Chrome',
  title: 'Header & stage indicator',
  sub: 'מדד השלב הוא תצוגה בלבד — הוא לעולם לא לחיץ.',
  body: [
    spec('שלב 1', `<div class="frame">${header(1)}</div>`),
    spec('שלב 4', `<div class="frame">${header(4)}</div>`),
    spec(
      'שלב 7',
      `<div class="frame">${header(7)}</div>`,
      'מדד ההתקדמות הוא הדבר המסוכן ביותר בשלד. הוא מיידע — אבל אם הוא ייקרא כמשימה שצריך לסיים, או אם מישהו יהפוך אותו ללחיץ, הוא הופך לניווט. הניווט שייך ל-Router בלבד.'
    ),
  ].join(''),
});

// 07 — guide panel
cards['07-guide-panel.html'] = card({
  group: 'Clinician',
  title: 'Guide panel — different audience',
  sub: 'זהו מכשיר של נטלי והבודקים, לא של המשתמש. צפוף וטכני במכוון.',
  extra: `.guide{position:static !important;width:340px !important;border:1px solid var(--border);border-radius:var(--radius)}`,
  body: [
    spec(
      'מצב מדריך',
      `<div class="guide">
        <div class="guide-head"><span>מצב מדריך</span></div>
        <div class="g-section"><div class="g-title">שלב 3 — רגש</div>
          <div class="g-row"><span>פתח שאלה</span><span>open</span></div>
          <div class="g-row"><span>ממתין לאישור</span><span>לא</span></div></div>
        <div class="g-section"><div class="g-title">התנגדויות</div>
          <div class="g-row"><span>דפוס</span><span>אין</span></div>
          <div class="g-row"><span>שאלות בשלב</span><span>4</span></div>
          <div class="g-row"><span>מיצוי</span><span>0</span></div>
          <div class="g-row"><span>מוצף</span><span style="color:#c0392b">כן</span></div>
          <div class="g-row"><span>הימנעות</span><span style="color:#aaa">לא</span></div></div>
        <div class="g-section"><div class="g-title">Scorecard</div>
          <div style="padding-inline-start:8px">
            <div class="g-row"><span>emotion_word</span><span style="color:#1a7a3c">2</span></div>
            <div class="g-row"><span>intensity</span><span style="color:#1a7a3c">2</span></div>
            <div class="g-row"><span>past_echo</span><span style="color:#b88000">1</span></div>
          </div></div>
        <div class="g-section"><div class="g-title">KPIs</div>
          <div class="g-row"><span>רגש שלב 3</span><span>8</span></div>
          <div class="g-row"><span>רגש שלב 5</span><span>—</span></div>
          <div class="g-row"><span>יחס אני/הוא</span><span>7:1</span></div></div>
      </div>`,
      'כאן צפיפות היא יתרון. אין צורך לרכך את הפאנל הזה — לשפוט אותו לפי קריאוּת, לא לפי חמימות. הוא גם לא נראה למשתמש אף פעם.'
    ),
  ].join(''),
});

/* ------------------------------------------------- full-screen assemblies -- */

const fullScreen = (stage, inner) => `
  <div class="app" dir="rtl" style="height:100%">
    <div class="main">
      ${header(stage)}
      <div class="chat">
        <div class="stream"><div class="scroller"><div class="column">${inner}</div></div></div>
        ${composer()}
      </div>
    </div>
  </div>`;

const STORM = [
  msg('assistant', 'אני אוביל אותך שלב-שלב. התפקיד שלך — לענות בכנות, שאלה אחת בכל פעם. ההחלטה בסוף — שלך לגמרי. אפשר לעצור מתי שרוצים.<br /><br />ספר לי — מה קרה?', { at: '09:14' }),
  msg('user', 'הזמנתי משלוח בשר למסעדה. כשהוא הגיע ראיתי שהוא לא באיכות שסיכמנו. אמרתי לספק שזה לא טוב, ופשוט עזבתי את המטבח באמצע המשמרת.', { at: '09:15' }),
  msg('assistant', 'מי עוד היה שם באותו רגע?', { at: '09:15' }),
  msg('user', 'הסו-שף והספק. שניהם הסתכלו עליי כשיצאתי.', { at: '09:16' }),
  msg('assistant', 'ומה קרה מיד אחרי?', { at: '09:16' }),
  msg('user', 'התקשרתי למנהל ואמרתי שאני לא חוזר היום. הוא לא הבין מה קרה.', { at: '09:17' }),
].join('');

cards['08-interview-mobile.html'] = card({
  group: 'Full screens',
  title: 'Full interview — mobile (390×844)',
  sub: 'המסך האמיתי ברגע הסוער. זה המסך שצריך להרגיש מכיל.',
  extra: `
    .sheet{max-width:none}
    .phone{width:390px;height:844px;border:1px solid var(--border-strong);
           border-radius:26px;overflow:hidden;box-shadow:var(--shadow-lg);background:var(--surface)}
    .phone .app{height:844px !important}
    .phone .btn-label,.phone .stage-label,.phone .hint{display:none}
    .phone .column{padding:16px 12px 8px}
    .phone .bubble-wrap{max-width:86%}
  `,
  body: spec(
    'רגע הכניסה — שלב 1',
    `<div class="phone">${fullScreen(1, STORM)}</div>`,
    'זה הרגע שבו נשאלת השאלה של הפאס הזה: מבוגר עם הפרעת קשב, אחרי שיצא מהמטבח באמצע משמרת, הדימוי העצמי כבר מופעל נגדו. <b>המסך הזה מרגיע אותו או מוסיף רעש?</b>'
  ),
});

cards['09-interview-desktop.html'] = card({
  group: 'Full screens',
  title: 'Full interview — desktop',
  sub: 'אותו ראיון ברוחב מלא. עמודת קריאה ממורכזת ברוחב --column.',
  extra: `.sheet{max-width:none}.desk{height:700px;border:1px solid var(--border-strong);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-md)}.desk .app{height:700px !important}`,
  body: spec('שלב 3 — השיא הרגשי', `<div class="desk">${fullScreen(3, STORM + msg('assistant', 'כשאתה מסתכל על התמונה הזו — איזה רגש זה מעורר?', { at: '09:31' }) + msg('user', 'עלבון. ממש עלבון עמוק.', { at: '09:32' }))}</div>`),
});

/* ------------------------------------------------------------------ write -- */

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [name, html] of Object.entries(cards)) {
  writeFileSync(join(out, name), html, 'utf8');
}
writeFileSync(join(out, 'README.md'), brief, 'utf8');

console.log(`wrote ${Object.keys(cards).length + 1} files to design/dist/`);
for (const n of Object.keys(cards)) console.log('  ' + n);
