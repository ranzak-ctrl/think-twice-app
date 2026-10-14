// The interview file by email — what the mail says, and sending it.
//
// Ran, 14.10.2026: "בוא ניישם אפשרות לשלוח את הקובץ במייל". From the end screen,
// to an address the person types — their own, and optionally one more (a
// therapist). Until accounts exist (plan stage 4) there is no account address, so
// both are typed, used for this one send, and kept nowhere: not in the file, not
// in a log, not here.
//
// The mail carries the encrypted file as an attachment, the model's name and a
// link to the app. NEVER the conversation: the body is fixed text, and the model
// name comes from the server's own list, never from what the request says — so
// nobody can use this function to send words of their own.
//
// Sent through Resend (RESEND_API_KEY, MAIL_FROM — server-side only, never VITE_),
// over its REST API, so there is no SDK to bundle. Until a domain of our own is
// verified there, Resend sends only to the address its account was opened with.

import { thinkTwiceAdult } from '../src/packs/think-twice-adult/pack.js';

// The interviews this deployment can mail, by id. A new model is added here.
export const MODEL_NAMES = Object.freeze({
  [thinkTwiceAdult.id]: thinkTwiceAdult.name,
});

export class MailError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const EMAIL = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]{2,}$/;

// Trimmed and lowercased, or null when it is not an address.
export function normalizeAddress(raw) {
  if (typeof raw !== 'string') return null;
  const a = raw.trim().toLowerCase();
  if (!a || a.length > 254 || !EMAIL.test(a)) return null;
  return a;
}

const FILE_NAME = /^think-twice-\d{4}-\d{2}-\d{2}-\d{4}\.thinktwice$/;
export const safeFileName = (name) => (typeof name === 'string' && FILE_NAME.test(name) ? name : 'think-twice.thinktwice');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `to: 'self'` is the person's own copy; `'other'` is the one they chose to share,
// which names them by the address they typed for themselves, if they did.
export function buildMail({ modelName, to, appUrl, sender = null }) {
  const subject = to === 'self' ? `${modelName} — קובץ הראיון שלך` : `${modelName} — קובץ ראיון ששותף איתך`;
  const opening =
    to === 'self'
      ? [`מצורף קובץ הראיון שלך מ-${modelName}.`]
      : [`קובץ ראיון מ-${modelName} נשלח אליך ביוזמת ${sender ?? 'המשתמש'}.`];
  const lines = [
    ...opening,
    'הקובץ מוצפן, ואפשר לפתוח אותו רק באפליקציה:',
    appUrl,
    'שם לוחצים על "פתיחת קובץ" ובוחרים אותו.',
    'אל תפתח את הקובץ לעריכה: שינוי בו, אפילו של תו אחד, ימנע את פתיחתו.',
    to === 'self' ? 'המייל נשלח כי ביקשת אותו במסך הסיום. אצלנו לא נשמר עותק של הראיון.' : 'אצלנו לא נשמר עותק של הראיון.',
  ];
  const text = ['שלום,', '', ...lines, '', 'Think Twice'].join('\n');
  const p = (s) => `<p style="margin:0 0 12px">${s}</p>`;
  const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:24px;background:#f7f7f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div dir="rtl" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:right;font-size:15px;line-height:1.6">
${p('שלום,')}
${p(esc(opening[0]))}
${p(`הקובץ מוצפן, ואפשר לפתוח אותו רק באפליקציה: <a href="${esc(appUrl)}" style="color:#e07600">${esc(appUrl)}</a><br>שם לוחצים על "פתיחת קובץ" ובוחרים אותו.`)}
<p style="margin:0 0 12px;color:#6b7280;font-size:13px">אל תפתח את הקובץ לעריכה: שינוי בו, אפילו של תו אחד, ימנע את פתיחתו.</p>
<p style="margin:0;color:#6b7280;font-size:13px">${esc(lines[lines.length - 1])}</p>
</div>
<p dir="rtl" style="text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 0">Think Twice</p>
</body></html>`;
  return { subject, html, text };
}

const RESEND_URL = 'https://api.resend.com/emails';

// One mail, one recipient: two recipients never see each other's address.
export async function sendMail({ apiKey, from, to, subject, html, text, attachment }, { fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        attachments: [{ filename: attachment.filename, content: attachment.content }],
      }),
    });
  } catch {
    throw new MailError('mail-unreachable');
  }
  if (res.ok) return true;
  // 403 is Resend's answer for an address outside a test account (no domain yet).
  if (res.status === 403) throw new MailError('mail-restricted');
  if (res.status === 422 || res.status === 400) throw new MailError('mail-rejected');
  if (res.status === 401) throw new MailError('mail-not-configured');
  if (res.status === 429) throw new MailError('mail-busy');
  throw new MailError('mail-failed');
}
