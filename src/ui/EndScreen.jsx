import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from './icons.jsx';
import { HELP_LINE } from '../safety/index.js';

// The end screen — when the interview ends, and when the person leaves it midway.
//
// Ran, 10.10.2026 (docs/interview-platform-plan.md 2ב, stage 4.7): it says
// plainly that what was said here is about to be erased; it saves the whole
// interview to an encrypted file on the person's computer, which only this app
// opens; and leaving it reloads the page, which is what erases the interview from
// the browser. If nobody leaves, it reloads by itself after five minutes, with
// the time left on screen (Ran: "5 דק + counter"). Typing in it starts the five
// minutes again.
//
// The order is the point: the page reloads only after the file has been saved,
// or saving it has failed and the person has been told so. Never in between —
// the file is the only copy there will be.
//
// Docked in place of the composer rather than over the conversation: the
// interview's last words, and the board, stay readable above it.
//
// Not here yet: the copy to the account's email and to an address the person
// adds. Both need accounts and a mail service (plan stage 4).
//
// AFTER A SAFETY STOP (`safetyStop`) the screen does not close by itself, and it
// carries the help line. A reload erases the conversation, and with it the stop
// message — the one place the person was told where to turn. Principle 7 says
// the safety layer is never weakened, so until Natali decides how this screen
// should meet a person in acute distress (questions-for-natali §16), it waits
// for them to leave, and keeps the help line in front of them until they do.

export const END_SECONDS = 5 * 60;

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// What a failed save says. The person is about to lose the interview, so the
// message says what to do, not what broke.
const SAVE_FAILED = {
  network: 'אין חיבור לאינטרנט כרגע.',
  unauthorized: 'צריך להזין שוב את סיסמת הגישה.',
  'not-configured': 'שמירת קבצים לא זמינה כרגע.',
};

export default function EndScreen({ reason, seal, fileName, onReturn, onExit, safetyStop = false }) {
  // saving → saved | failed; a failed save can be tried again.
  const [save, setSave] = useState({ status: 'saving', url: null, error: null });
  // Counted against the clock, not in ticks: a browser slows the timers of a
  // background tab (to once a minute, after a while), and five minutes must
  // stay five minutes when the person has switched tabs.
  const deadlineRef = useRef(Date.now() + END_SECONDS * 1000);
  const [left, setLeft] = useState(END_SECONDS);
  const urlRef = useRef(null);
  const savingRef = useRef(false);
  // The interview as it stood when the screen opened. Held, so that a new `seal`
  // from a re-render can never start a second save and a second download.
  const sealRef = useRef(seal);
  const leaving = reason === 'leave';

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
      setSave({ status: 'failed', url: null, error: out.error });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out.file)], { type: 'application/octet-stream' })
    );
    urlRef.current = url;
    setSave({ status: 'saved', url, error: null });
    // A download not born of a click may be blocked, or on a phone open instead
    // of saving — so the button below stays, and this is only the first try.
    download(url);
  }, []);

  // Save once, as the screen opens. (StrictMode mounts twice in development;
  // savingRef keeps that to one file.)
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
    if (left === 0 && save.status !== 'saving') exit();
  }, [left, save.status, exit]);

  const restart = () => {
    deadlineRef.current = Date.now() + END_SECONDS * 1000;
    setLeft(END_SECONDS);
  };

  const saving = save.status === 'saving';

  return (
    <section
      className="endscreen"
      aria-labelledby="endscreen-title"
      onKeyDown={restart}
      onInput={restart}
    >
      <h2 id="endscreen-title">{leaving ? 'יציאה מהראיון' : 'הראיון הסתיים'}</h2>

      {safetyStop && <p className="endscreen-help">{HELP_LINE}</p>}

      <p className="endscreen-erase">
        כשהמסך ייסגר, כל מה שנאמר כאן יימחק מהדפדפן. אצלנו לא נשמר ממנו דבר.
      </p>

      <div className={`endscreen-file is-${save.status}`} aria-live="polite">
        {saving && <p>שומר את הראיון בקובץ מוצפן…</p>}
        {save.status === 'saved' && (
          <>
            <p>
              הראיון נשמר אצלך בקובץ מוצפן, בתיקיית ההורדות. אפשר לפתוח אותו רק כאן, באפליקציה —{' '}
              {leaving && !safetyStop ? 'כדי לקרוא אותו שוב או להמשיך ממנו.' : 'כדי לקרוא אותו שוב.'}
            </p>
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
          </>
        )}
      </div>

      <div className="endscreen-actions">
        {save.status === 'failed' ? (
          <button className="btn btn-primary" onClick={runSave}>
            נסה לשמור שוב
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => save.url && download(save.url)}
            disabled={!save.url}
          >
            <Download />
            הורדת הקובץ
          </button>
        )}
        <button className="btn" onClick={exit} disabled={saving}>
          {saving ? 'שומר…' : 'יציאה'}
        </button>
        {leaving && (
          <button className="btn" onClick={onReturn}>
            חזרה לראיון
          </button>
        )}
      </div>

      <p className="endscreen-timer" aria-live="off">
        {safetyStop
          ? 'המסך לא ייסגר מעצמו.'
          : saving && left === 0
            ? 'המסך ייסגר מיד כשהקובץ יישמר.'
            : `המסך ייסגר בעוד ${clock(left)}.`}
      </p>
    </section>
  );
}
