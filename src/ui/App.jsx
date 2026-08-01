import { useState, useCallback, useEffect, useRef } from 'react';
import Chat from './Chat.jsx';
import GuidePanel from './GuidePanel.jsx';
import { Mark, Plus, Download, Upload, Gauge } from './icons.jsx';
import { createState, importState } from '../core/state.js';
import { confirmAndAdvance, rejectConfirmation } from '../core/router.js';
import { runTurn, generateStageOpener } from '../core/session.js';

const OPENING_TEXT =
  'אני אוביל אותך שלב-שלב. התפקיד שלך — לענות בכנות, שאלה אחת בכל פעם. ההחלטה בסוף — שלך לגמרי. אפשר לעצור מתי שרוצים.\n\nספר לי — מה קרה?';

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
  const fileRef = useRef(null);

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
    const payload = { exportedAt: new Date().toISOString(), history, state };
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

  const handleNewSession = () => {
    setState(createState());
    setHistory([openingMessage()]);
  };

  return (
    <div className="app" dir="rtl">
      <div className="main">
        <header className="header">
          <div className="brand">
            <span className="brand-mark">
              <Mark />
            </span>
            Think Twice
          </div>

          <div className="header-spacer" />

          <StageMeter stage={state.meta.currentStage} />

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

        <Chat
          history={history}
          loading={loading}
          board={state.board}
          awaitingConfirmation={state.meta.awaitingConfirmation}
          sessionComplete={state.meta.sessionComplete}
          feedbackEnabled={guideOpen}
          onFeedback={handleFeedback}
          onSend={handleUserMessage}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
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
            notes={history
              .map((m, i) => (m.feedback ? { i, question: m.content, ...m.feedback } : null))
              .filter(Boolean)}
            onClose={() => setGuideOpen(false)}
          />
        </>
      )}
    </div>
  );
}

// Display-only stage indicator. It is never clickable: the Router owns every
// transition, and the UI must not offer navigation.
function StageMeter({ stage }) {
  return (
    <div className="stage" title={`שלב ${stage} מתוך 7`}>
      <span className="stage-label">שלב {stage}/7</span>
      <span className="stage-track" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <span
            key={n}
            className={`stage-seg${n < stage ? ' done' : n === stage ? ' current' : ''}`}
          />
        ))}
      </span>
    </div>
  );
}
