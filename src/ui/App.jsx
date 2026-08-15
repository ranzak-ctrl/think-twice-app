import { useState, useCallback, useEffect, useRef } from 'react';
import Chat from './Chat.jsx';
import GuidePanel from './GuidePanel.jsx';
import StageRail from './StageRail.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { Logo, Plus, Download, Upload, Gauge } from './icons.jsx';
import { createState, importState } from '../core/state.js';
import { confirmAndAdvance, rejectConfirmation } from '../core/router.js';
import { runTurn, generateStageOpener } from '../core/session.js';
import { rewriteTurn, buildRevision } from './rewriteTurn.js';

// Opening turn. Ran's wording, revised 15.8.2026: the arc now ends on the
// person choosing rather than on a response being arrived at, and the close
// promises an informed decision instead of just locating ownership. Gendered
// verbs toward the user carry both forms (תוכל/י).
//
// Still turn-lint compliant: three sentences, then exactly one directed
// question. The arc is described without stage numbers, which are jargon toward
// the user; the fuller roadmap lives in the intro card, which is interface, not
// a turn, and so is not bound by the lint.
const OPENING_TEXT =
  'אם קרה משהו שהסעיר אותך והוא עדיין רץ לך בראש — כאן המקום לעבור עליו לאט. נתחיל ממה שקרה בפועל, נמשיך להבין למה זה תפס אותך ככה, ונתקדם יחד אל הנקודה שתוכל/י לבחור את התגובה הכי נכונה עבורך. אני מוביל, שואל שאלה אחת בכל פעם, ובסוף הראיון תוכל/י לקבל החלטה מושכלת.\n\nאז ספר לי — מה קרה?';

// Messages carry a timestamp so the chat can show one; `at` is additive and
// ignored by the core (formatHistory maps role/content only), so older exports
// import cleanly without it.
const openingMessage = () => ({
  role: 'assistant',
  content: OPENING_TEXT,
  at: Date.now(),
});

const GUIDE_MIN = 260;
const CHAT_MIN = 360;

export default function App() {
  const [state, setState] = useState(() => createState());
  const [history, setHistory] = useState(() => [openingMessage()]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideWidth, setGuideWidth] = useState(340); // resizable via the divider
  const [loading, setLoading] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  // Append-only log of every tester rewrite, including the turns each one
  // discarded. Separate from `history` precisely because history gets cut.
  const [revisions, setRevisions] = useState([]);
  const fileRef = useRef(null);

  // Nothing is persisted anywhere (no server, no storage — see CLAUDE.md), so
  // anything past the opening message is lost for good unless it is exported.
  const isDirty = history.length > 1;

  // The browser only allows its own generic "leave site?" prompt here — the text
  // cannot be customised and no download button can be attached to it.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const addMessage = (role, content) =>
    setHistory((h) => [...h, { role, content, at: Date.now() }]);

  // Tester feedback on a specific interviewer question. It lives on the history
  // entry, so it rides along in the export with no storage of any kind — and the
  // core strips it (formatHistory maps role/content only), so a note can never
  // reach the model. Passing null removes the note entirely.
  const handleFeedback = useCallback((index, feedback) => {
    setHistory((h) =>
      h.map((m, i) => {
        if (i !== index) return m;
        if (!feedback) {
          const { feedback: _removed, ...rest } = m;
          return rest;
        }
        return { ...m, feedback };
      })
    );
  }, []);

  // Guide-mode instrument: the tester replaces an interviewer question with the
  // one they expected, and the interview carries on from there.
  //
  // "Continues from" is literal — everything after the rewritten turn is
  // dropped, because those turns answered a question that is no longer on
  // screen. Keeping them would leave a transcript that reads as a non-sequitur
  // and would feed the model a conversation that never happened.
  //
  // The model's original wording is kept on the feedback entry, never
  // overwritten by a second rewrite, so the export still shows what the
  // interviewer actually asked and what the tester wanted instead. The core
  // strips feedback (formatHistory maps role/content only), so only the new
  // question reaches the model — as the interviewer's own turn, which is the
  // point: the next reply answers the tester's question.
  //
  // The StateDocument is deliberately NOT rewound. It cannot be: coverage
  // scores came from the model's evaluations of turns that are now gone, and
  // there is no inverse. So a rewrite that discards turns leaves state ahead of
  // the transcript. That is acceptable in guide mode — this is an instrument
  // for probing phrasing, not a time machine — but it is why the editor warns
  // before discarding, and why exports of a rewritten session should be read
  // with the rewrite in mind.
  const handleRewrite = useCallback(
    (index, question, note) => {
      // Record before cutting — buildRevision needs the turns that are about to
      // stop existing. Built out here rather than inside a setState updater: a
      // side effect in an updater double-fires under StrictMode, which would
      // log every rewrite twice.
      const revision = buildRevision(history, index, question, note, state.meta.currentStage);
      if (!revision) return;
      setRevisions((r) => [...r, revision]);
      setHistory((h) => rewriteTurn(h, index, question, note));
    },
    [history, state]
  );

  // Escape closes the guide — it is an overlay drawer on narrow screens.
  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e) => e.key === 'Escape' && setGuideOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guideOpen]);

  // Drag the divider to resize the guide panel vs. the chat. RTL: the guide panel
  // sits on the left (x: 0..width), so its right edge follows the cursor's clientX.
  const startGuideResize = useCallback((e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const w = Math.min(Math.max(ev.clientX, GUIDE_MIN), window.innerWidth - CHAT_MIN);
      setGuideWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const handleUserMessage = useCallback(
    async (text) => {
      if (loading) return;

      // Thin wrapper around the portable core loop (src/core/session.js).
      setHistory((h) => [...h, { role: 'user', content: text, at: Date.now() }]);
      setLoading(true);
      try {
        const { nextState, reply } = await runTurn(state, history, text);
        setState(nextState);
        addMessage('assistant', reply);
      } finally {
        setLoading(false);
      }
    },
    [state, history, loading]
  );

  const handleConfirm = useCallback(async () => {
    if (loading) return;
    // Advance first (drops the confirm UI), then generate a story-anchored opening
    // question for the new stage. addMessage runs OUTSIDE any setState updater, so it
    // fires once (a side effect inside an updater double-fires under StrictMode).
    const advanced = confirmAndAdvance(state);
    setState(advanced);
    setLoading(true);
    try {
      const { nextState, message } = await generateStageOpener(advanced, history);
      setState(nextState);
      addMessage('assistant', message);
    } finally {
      setLoading(false);
    }
  }, [state, history, loading]);

  const handleReject = useCallback(() => {
    setState((s) => rejectConfirmation(s));
    addMessage('assistant', 'בסדר — מה רצית לתקן?');
  }, []);

  const handleExport = () => {
    // Full session: the transcript (history) + the StateDocument. The
    // /export-conversation command turns this file into a Drive .docx.
    // history + state is the interview; revisions is what the tester wanted
    // changed and what that cost. The second half is the point of a guide-mode
    // run, so it ships in the same file rather than in a parallel one nobody
    // remembers to save.
    const payload = { exportedAt: new Date().toISOString(), history, state, revisions };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `think-twice-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target.result;
        setState(importState(raw));
        // Restore the transcript too, if the export carried it (faithful re-entry).
        const parsed = JSON.parse(raw);
        setRevisions(Array.isArray(parsed.revisions) ? parsed.revisions : []);
        if (Array.isArray(parsed.history) && parsed.history.length) {
          setHistory(parsed.history);
        } else {
          addMessage('assistant', 'המשך מהנקודה שעצרנו. מה היה לנו?');
        }
      } catch {
        alert('קובץ לא תקין.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // re-importing the same file must fire change again
  };

  const startNewSession = () => {
    setState(createState());
    setHistory([openingMessage()]);
    setRevisions([]);
    setConfirmNew(false);
  };

  // Warn before discarding a live interview; a fresh one resets straight away.
  const handleNewSession = () => {
    if (isDirty) setConfirmNew(true);
    else startNewSession();
  };

  return (
    <div className="app" dir="rtl">
      <div className="main">
        <header className="header">
          <div className="brand">
            <Logo />
          </div>

          <div className="header-spacer" />

          <div className="header-actions">
            <button className="btn" onClick={handleNewSession} title="ראיון חדש">
              <Plus />
              <span className="btn-label">ראיון חדש</span>
            </button>

            <button className="btn" onClick={handleExport} title="ייצוא">
              <Download />
              <span className="btn-label">ייצוא</span>
            </button>

            <button className="btn" onClick={() => fileRef.current?.click()} title="ייבוא">
              <Upload />
              <span className="btn-label">ייבוא</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              hidden
              onChange={handleImport}
            />

            <button
              className={`btn${guideOpen ? ' is-on' : ''}`}
              onClick={() => setGuideOpen((o) => !o)}
              aria-pressed={guideOpen}
              title="מצב מדריך"
            >
              <Gauge />
              <span className="btn-label">מדריך</span>
            </button>
          </div>
        </header>

        {/* Chat first, rail second: in RTL the second child lands on the left,
            which is where the rail belongs — beside the chat, not over it. */}
        <div className="main-body">
          <Chat
            history={history}
            loading={loading}
            board={state.board}
            awaitingConfirmation={state.meta.awaitingConfirmation}
            sessionComplete={state.meta.sessionComplete}
            feedbackEnabled={guideOpen}
            onFeedback={handleFeedback}
            onRewrite={handleRewrite}
            onSend={handleUserMessage}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
          <StageRail
            stage={state.meta.currentStage}
            sessionComplete={state.meta.sessionComplete}
          />
        </div>
      </div>

      {/* Draggable divider — desktop split only; CSS hides it under 900px, where
          the guide becomes an overlay drawer with a backdrop. */}
      {guideOpen && (
        <>
          <div
            className="guide-backdrop"
            onClick={() => setGuideOpen(false)}
            aria-hidden="true"
          />
          <div
            className="divider"
            onMouseDown={startGuideResize}
            title="גרור לשינוי רוחב"
            role="separator"
            aria-orientation="vertical"
          />
          <GuidePanel
            state={state}
            width={guideWidth}
            revisions={revisions}
            notes={history
              .map((m, i) => (m.feedback ? { i, question: m.content, ...m.feedback } : null))
              .filter(Boolean)}
            onClose={() => setGuideOpen(false)}
          />
        </>
      )}

      {confirmNew && (
        <ConfirmDialog
          title="להתחיל ראיון חדש?"
          body="הראיון הנוכחי — התמלול, הערות הבודק והמצב — יימחק. אין שמירה אוטומטית ואי אפשר לשחזר."
          onClose={() => setConfirmNew(false)}
          actions={
            <>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handleExport();
                  startNewSession();
                }}
              >
                <Download />
                הורד קובץ והתחל ראיון חדש
              </button>
              <button className="btn" onClick={startNewSession}>
                התחל בלי לשמור
              </button>
              <button className="btn" onClick={() => setConfirmNew(false)}>
                ביטול
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
