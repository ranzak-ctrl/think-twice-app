import { useState, useCallback } from 'react';
import Chat from './Chat.jsx';
import GuidePanel from './GuidePanel.jsx';
import { createState, importState } from '../core/state.js';
import { confirmAndAdvance, rejectConfirmation } from '../core/router.js';
import { signpostForStage } from '../content/signposting.js';
import { runTurn } from '../core/session.js';

const OPENING_MESSAGE = {
  role: 'assistant',
  content:
    'אני אוביל אותך שלב-שלב. התפקיד שלך — לענות בכנות, שאלה אחת בכל פעם. ההחלטה בסוף — שלך לגמרי. אפשר לעצור מתי שרוצים.\n\nספר לי — מה קרה?',
};

export default function App() {
  const [state, setState] = useState(() => createState());
  const [history, setHistory] = useState([OPENING_MESSAGE]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState(null);

  const addMessage = (role, content) =>
    setHistory((h) => [...h, { role, content }]);

  const handleUserMessage = useCallback(
    async (text) => {
      if (loading) return;

      // Thin wrapper around the portable core loop (src/core/session.js).
      setHistory((h) => [...h, { role: 'user', content: text }]);
      setLoading(true);
      try {
        const { nextState, reply } = await runTurn(state, history, text);
        setState(nextState);
        if (nextState.meta.safetyFlag) setSafetyMessage(reply);
        addMessage('assistant', reply);
      } finally {
        setLoading(false);
      }
    },
    [state, history, loading]
  );

  const handleConfirm = useCallback(() => {
    setState((s) => {
      const next = confirmAndAdvance(s);
      const msg = signpostForStage(next.meta.currentStage);
      addMessage('assistant', msg);
      return next;
    });
  }, []);

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
  };

  const handleNewSession = () => {
    setState(createState());
    setHistory([OPENING_MESSAGE]);
    setSafetyMessage(null);
  };

  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: 'system-ui, Arial, sans-serif',
        background: '#f9f9f9',
      }}
    >
      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            background: '#fff',
          }}
        >
          <strong style={{ flex: 1, fontSize: 16 }}>Think Twice</strong>
          <span
            style={{
              fontSize: 12,
              color: '#888',
              border: '1px solid #ddd',
              borderRadius: 4,
              padding: '2px 8px',
            }}
          >
            שלב {state.meta.currentStage}/7
          </span>
          <button onClick={handleNewSession} style={btnStyle('#1a1a1a')}>
            ראיון חדש
          </button>
          <button onClick={handleExport} style={btnStyle('#444')}>
            ייצוא
          </button>
          <label style={{ ...btnStyle('#444'), cursor: 'pointer' }}>
            ייבוא
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </label>
          <button
            onClick={() => setGuideOpen((o) => !o)}
            style={btnStyle(guideOpen ? '#0066cc' : '#666')}
          >
            {guideOpen ? 'סגור מדריך' : 'מצב מדריך'}
          </button>
        </div>

        {/* Chat */}
        <Chat
          history={history}
          loading={loading}
          board={state.board}
          awaitingConfirmation={state.meta.awaitingConfirmation}
          sessionComplete={state.meta.sessionComplete}
          onSend={handleUserMessage}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
      </div>

      {/* Guide panel (clinician debug) */}
      {guideOpen && <GuidePanel state={state} />}
    </div>
  );
}

function btnStyle(bg) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 13,
    cursor: 'pointer',
  };
}
