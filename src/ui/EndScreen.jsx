import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Close } from './icons.jsx';
import { HELP_LINE } from '../safety/index.js';

// The end screen — when the interview ends, and when the person leaves it midway.
//
// Ran, 10.10.2026 (docs/interview-platform-plan.md 2ב, stage 4.7): it says
// plainly that what was said here is about to be erased; it makes the whole
// interview into an encrypted file, which only this app opens; and leaving it
// reloads the page, which is what erases the interview from the browser. If
// nobody leaves, it reloads by itself after five minutes, with the time left on
// screen (Ran: "5 דק + counter"). Typing in it starts the five minutes again.
//
// The file downloads ONLY when the person presses "הורדת הקובץ" (Ran, 14.10.2026:
// "הפעולה הזו אמורה להתרחש רק כאשר אני משתמש בכפתור"). It is prepared as the
// screen opens, so the press downloads at once — and a download born of a click
// is one no browser blocks. Leaving without it asks first, and says the interview
// will be gone with no copy.
//
// The page reloads only after the file is ready or preparing it has failed and
// the person has been told so. Never in between.
//
// A modal in the middle of the screen, in the app's own dialog style (Ran,
// 14.10.2026). The X in its top-right corner — and Escape — take the person back
// to the interview; there is no separate "back" button. After an interview that
// ended, that is how they read its last words and the board again; the header's
// "סיום" opens this screen once more.
//
// BY EMAIL (Ran, 14.10.2026): two addresses typed here — the person's own and,
// if they want, one more, such as a therapist's — shown back before anything is
// sent, used for that one send, and kept nowhere. The mail carries the encrypted
// file, never the conversation (api/send-interview.js, server/mail.js). Shown
// only where the deployment can send mail (`mail.available()`). Until accounts
// exist there is no account address, so the person's own is typed too.
//
// AFTER A SAFETY STOP (`safetyStop`) the screen does not close by itself, and it
// carries the help line. A reload erases the conversation, and with it the stop
// message — the one place the person was told where to turn. Principle 7 says
// the safety layer is never weakened, so until Natali decides how this screen
// should meet a person in acute distress (questions-for-natali §16), it waits
// for them to leave, and keeps the help line in front of them until they do.

export const END_SECONDS = 5 * 60;

// The file is sealed: one changed character and it no longer opens
// (server/interviewFile.js). It cannot be locked on the person's computer, so it
// says so (Ran, 14.10.2026).
const DO_NOT_EDIT = 'אל תפתח את הקובץ לעריכה: שינוי בו, אפילו של תו אחד, ימנע את פתיחתו.';

// What a failed send says.
const MAIL_FAILED = {
  'mail-restricted': 'לכתובת הזו עוד אי אפשר לשלוח: שירות המייל עדיין בהגדרת ניסיון.',
  'mail-rejected': 'הכתובת לא התקבלה. בדוק אותה ונסה שוב.',
  'bad-address': 'אחת הכתובות לא תקינה. בדוק אותה ונסה שוב.',
  'mail-not-configured': 'שליחה במייל לא זמינה כרגע.',
  'mail-busy': 'שירות המייל עמוס. נסה שוב בעוד רגע.',
  network: 'אין חיבור לאינטרנט כרגע.',
};
const mailFailed = (code) => MAIL_FAILED[code] ?? 'השליחה לא הצליחה. אפשר לנסות שוב, או להוריד את הקובץ.';
const looksLikeAddress = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// What a failed save says. The person is about to lose the interview, so the
// message says what to do, not what broke.
const SAVE_FAILED = {
  network: 'אין חיבור לאינטרנט כרגע.',
  unauthorized: 'צריך להזין שוב את סיסמת הגישה.',
  'not-configured': 'שמירת קבצים לא זמינה כרגע.',
};

export default function EndScreen({ reason, seal, fileName, onClose, onExit, safetyStop = false, mail = null }) {
  // saving → saved (the file is ready) | failed; a failed save can be tried again.
  const [save, setSave] = useState({ status: 'saving', url: null, error: null });
  // Whether the person has taken the file; and whether "יציאה" is asking first.
  const [downloaded, setDownloaded] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  // Email: whether this deployment can send, what was typed, and where the send is.
  const [mailOn, setMailOn] = useState(false);
  const [selfAddr, setSelfAddr] = useState('');
  const [otherAddr, setOtherAddr] = useState('');
  // idle → confirm → sending → done
  const [mailStage, setMailStage] = useState('idle');
  const [mailResults, setMailResults] = useState(null);
  const envelopeRef = useRef(null);
  // Counted against the clock, not in ticks: a browser slows the timers of a
  // background tab (to once a minute, after a while), and five minutes must
  // stay five minutes when the person has switched tabs.
  const deadlineRef = useRef(Date.now() + END_SECONDS * 1000);
  const [left, setLeft] = useState(END_SECONDS);
  const urlRef = useRef(null);
  const savingRef = useRef(false);
  // The interview as it stood when the screen opened. Held, so that a new `seal`
  // from a re-render can never start a second save.
  const sealRef = useRef(seal);
  const cardRef = useRef(null);
  const leaving = reason === 'leave';

  // The dialog takes the focus as it opens, so the keyboard starts inside it.
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  const download = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const runSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSave({ status: 'saving', url: null, error: null });
    const out = await sealRef.current();
    savingRef.current = false;
    if (!out.ok) {
      setSave({ status: 'failed', url: null, error: out.error, reason: out.reason ?? null });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out.file)], { type: 'application/octet-stream' })
    );
    urlRef.current = url;
    envelopeRef.current = out.file;
    setSave({ status: 'saved', url, error: null });
  }, []);

  // Whether mail can be offered here at all.
  useEffect(() => {
    let live = true;
    mail?.available?.().then((ok) => live && setMailOn(Boolean(ok)));
    return () => {
      live = false;
    };
  }, [mail]);

  const addresses = [selfAddr.trim(), otherAddr.trim()].filter(Boolean);
  const canSend =
    addresses.length > 0 && addresses.every(looksLikeAddress) && mailStage !== 'sending' && Boolean(envelopeRef.current);

  const sendMail = async () => {
    setMailStage('sending');
    const out = await mail.send({ file: envelopeRef.current, self: selfAddr.trim(), other: otherAddr.trim(), fileName });
    setMailResults(out.ok ? out.results : { ...(out.results ?? {}), error: out.error });
    setMailStage('done');
  };
  const selfSent = mailResults?.self === 'sent';

  const takeFile = () => {
    if (!save.url) return;
    download(save.url);
    setDownloaded(true);
    setConfirmExit(false);
  };

  // Prepare the file once, as the screen opens. (StrictMode mounts twice in
  // development; savingRef keeps that to one.)
  useEffect(() => {
    runSave();
  }, [runSave]);

  // The file's address is memory too; it goes with the screen.
  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), []);

  const exit = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    onExit();
  }, [onExit]);

  useEffect(() => {
    if (safetyStop) return undefined;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    const t = setInterval(tick, 1000);
    // Coming back to the tab shows the true time at once.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [safetyStop]);

  // At zero: leave — unless the file is still being saved, in which case leave
  // the moment it is saved or has failed (this runs again when it does).
  useEffect(() => {
    if (left === 0 && save.status !== 'saving' && mailStage !== 'sending') exit();
  }, [left, save.status, mailStage, exit]);

  const restart = () => {
    deadlineRef.current = Date.now() + END_SECONDS * 1000;
    setLeft(END_SECONDS);
  };

  const saving = save.status === 'saving';
  // Leaving with a file ready and not taken asks first: it is the last copy.
  // A copy sent to the person's own address counts as taken.
  const askExit = () => {
    if (save.status === 'saved' && !downloaded && !selfSent) setConfirmExit(true);
    else exit();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (confirmExit) setConfirmExit(false);
      else onClose();
      return;
    }
    restart();
  };

  return (
    <div className="dialog-backdrop">
    <section
      className="endscreen endmodal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="endscreen-title"
      tabIndex={-1}
      ref={cardRef}
      onKeyDown={onKeyDown}
      onInput={restart}
    >
      <button className="endmodal-close" onClick={onClose} aria-label="חזרה לראיון" title="חזרה לראיון">
        <Close />
      </button>
      <h2 id="endscreen-title">{leaving ? 'יציאה מהראיון' : 'הראיון הסתיים'}</h2>

      {safetyStop && <p className="endscreen-help">{HELP_LINE}</p>}

      <p className="endscreen-erase">
        כשהמסך ייסגר, כל מה שנאמר כאן יימחק מהדפדפן. אצלנו לא נשמר ממנו דבר.
      </p>

      <div className={`endscreen-file is-${save.status === 'saved' && !downloaded ? 'ready' : save.status}`} aria-live="polite">
        {saving && <p>מכין את הראיון כקובץ מוצפן…</p>}
        {save.status === 'saved' && !downloaded && (
          <>
            <p>
              הראיון מוכן כקובץ מוצפן. אפשר לפתוח אותו רק כאן, באפליקציה —{' '}
              {leaving && !safetyStop ? 'כדי לקרוא אותו שוב או להמשיך ממנו.' : 'כדי לקרוא אותו שוב.'}
            </p>
            {!selfSent && (
              <p className="endscreen-warn">
                כדי לשמור אותו אצלך, לחץ על "הורדת הקובץ"{mailOn ? ' או שלח אותו למייל שלך' : ''}. אם לא, הראיון יימחק כשהמסך ייסגר, ולא יישאר ממנו עותק.
              </p>
            )}
            <p className="endscreen-hint">{DO_NOT_EDIT}</p>
          </>
        )}
        {save.status === 'saved' && downloaded && (
          <>
            <p>
              הקובץ ירד לתיקיית ההורדות. אפשר לפתוח אותו רק כאן, באפליקציה —{' '}
              {leaving && !safetyStop ? 'כדי לקרוא אותו שוב או להמשיך ממנו.' : 'כדי לקרוא אותו שוב.'}
            </p>
            <p className="endscreen-hint">{DO_NOT_EDIT}</p>
            <p className="endscreen-hint">לא מוצא את הקובץ? אפשר להוריד אותו שוב.</p>
          </>
        )}
        {save.status === 'failed' && (
          <>
            <p>
              לא הצלחנו לשמור את הקובץ. {SAVE_FAILED[save.error] ?? ''}
            </p>
            <p className="endscreen-warn">
              אם תצא בלי קובץ, הראיון יימחק ולא יישאר ממנו עותק.
            </p>
            {/* For whoever set the deployment up: which mistake it was. */}
            <p className="endscreen-hint" dir="ltr">
              {[save.error, save.reason].filter(Boolean).join(' · ')}
            </p>
          </>
        )}
      </div>

      {mailOn && save.status === 'saved' && (
        <div className="endmail">
          <h3>שליחה במייל</h3>
          <label htmlFor="end-mail-self">המייל שלך</label>
          <input
            id="end-mail-self"
            type="email"
            dir="ltr"
            autoComplete="off"
            value={selfAddr}
            onChange={(e) => {
              setSelfAddr(e.target.value);
              if (mailStage !== 'sending') setMailStage('idle');
            }}
            disabled={mailStage === 'sending'}
          />
          <label htmlFor="end-mail-other">מייל נוסף, למשל של המטפל (לא חובה)</label>
          <input
            id="end-mail-other"
            type="email"
            dir="ltr"
            autoComplete="off"
            value={otherAddr}
            onChange={(e) => {
              setOtherAddr(e.target.value);
              if (mailStage !== 'sending') setMailStage('idle');
            }}
            disabled={mailStage === 'sending'}
          />
          <p className="endscreen-hint">הכתובות משמשות לשליחה הזו בלבד, ולא נשמרות. במייל יש רק את הקובץ המוצפן, לא את השיחה.</p>
          {mailStage === 'confirm' ? (
            <div className="endscreen-confirm">
              <p>לשלוח את קובץ הראיון אל:</p>
              <ul className="endmail-to" dir="ltr">
                {addresses.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <div className="endscreen-actions">
                <button className="btn btn-primary" onClick={sendMail}>
                  שליחה
                </button>
                <button className="btn" onClick={() => setMailStage('idle')}>
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div className="endscreen-actions">
              <button className="btn" onClick={() => setMailStage('confirm')} disabled={!canSend}>
                {mailStage === 'sending' ? 'שולח…' : 'שליחה במייל'}
              </button>
            </div>
          )}
          {mailStage === 'done' && mailResults && (
            <div aria-live="polite">
              {[
                ['self', selfAddr.trim()],
                ['other', otherAddr.trim()],
              ]
                .filter(([k, a]) => a && mailResults[k])
                .map(([k, a]) => (
                  <p key={k} className={mailResults[k] === 'sent' ? 'endmail-ok' : 'endscreen-warn'}>
                    {mailResults[k] === 'sent' ? `נשלח אל ${a}.` : `לא נשלח אל ${a}. ${mailFailed(mailResults[k])}`}
                  </p>
                ))}
              {mailResults.error && !mailResults.self && !mailResults.other && (
                <p className="endscreen-warn">{mailFailed(mailResults.error)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {confirmExit ? (
        <div className="endscreen-confirm" role="alertdialog" aria-labelledby="endscreen-confirm-text">
          <p id="endscreen-confirm-text" className="endscreen-warn">
            לא הורדת את הקובץ. אם תצא עכשיו, הראיון יימחק ולא יישאר ממנו עותק.
          </p>
          <div className="endscreen-actions">
            <button className="btn btn-primary" onClick={takeFile}>
              <Download />
              הורדת הקובץ
            </button>
            <button className="btn" onClick={exit}>
              יציאה בלי קובץ
            </button>
            <button className="btn" onClick={() => setConfirmExit(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="endscreen-actions">
          {save.status === 'failed' ? (
            <button className="btn btn-primary" onClick={runSave}>
              נסה לשמור שוב
            </button>
          ) : (
            <button className="btn btn-primary" onClick={takeFile} disabled={!save.url}>
              <Download />
              הורדת הקובץ
            </button>
          )}
          <button className="btn" onClick={askExit} disabled={saving || mailStage === 'sending'}>
            {saving ? 'מכין…' : 'יציאה'}
          </button>
        </div>
      )}

      <p className="endscreen-timer" aria-live="off">
        {safetyStop
          ? 'המסך לא ייסגר מעצמו.'
          : saving && left === 0
            ? 'המסך ייסגר מיד כשהקובץ יהיה מוכן.'
            : `המסך ייסגר בעוד ${clock(left)}.`}
      </p>
    </section>
    </div>
  );
}
