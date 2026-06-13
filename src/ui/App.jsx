import { useState, useCallback } from 'react';
import Chat from './Chat.jsx';
import GuidePanel from './GuidePanel.jsx';
import { createState, exportState, importState } from '../core/state.js';
import { route, confirmAndAdvance, rejectConfirmation, Decision } from '../core/router.js';
import { complete } from '../adapters/model.js';
import { preCheck } from '../safety/index.js';

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

      // Safety pre-check
      const check = preCheck(text);
      if (!check.safe) {
        addMessage('user', text);
        addMessage('assistant', check.stopMessage);
        setState((s) => ({ ...s, meta: { ...s.meta, safetyFlag: true } }));
        setSafetyMessage(check.stopMessage);
        return;
      }

      addMessage('user', text);
      setLoading(true);

      try {
        const result = await complete({ stage: state.meta.currentStage });

        // Apply slot updates from mock evaluation
        let nextState = { ...state };
        const ev = result.evaluation ?? {};

        if (ev.slots) {
          const stageKey = `stage${state.meta.currentStage}`;
          nextState = {
            ...nextState,
            coverage: {
              ...nextState.coverage,
              [stageKey]: {
                ...nextState.coverage[stageKey],
                ...ev.slots,
              },
            },
          };
        }

        // Update saturation counter
        const newInfo = ev.new_info !== false;
        nextState = {
          ...nextState,
          meta: {
            ...nextState.meta,
            questionCount: nextState.meta.questionCount + 1,
            saturationCount: newInfo ? 0 : nextState.meta.saturationCount + 1,
          },
        };

        // Run router
        const decision = route(nextState);

        if (decision.decision === Decision.REQUEST_CONFIRMATION) {
          nextState = {
            ...nextState,
            meta: {
              ...nextState.meta,
              awaitingConfirmation: true,
              pendingNextStage: decision.nextStage,
            },
          };
        }

        if (decision.decision === Decision.SESSION_COMPLETE) {
          nextState = {
            ...nextState,
            meta: { ...nextState.meta, sessionComplete: true },
          };
        }

        setState(nextState);
        addMessage('assistant', result.message);
      } finally {
        setLoading(false);
      }
    },
    [state, loading]
  );

  const handleConfirm = useCallback(() => {
    setState((s) => confirmAndAdvance(s));
    addMessage('assistant', 'מעולה. נמשיך.');
  }, []);

  const handleReject = useCallback(() => {
    setState((s) => rejectConfirmation(s));
    addMessage('assistant', 'בסדר — מה רצית לתקן?');
  }, []);

  const handleExport = () => {
    const json = exportState(state);
    const blob = new Blob([json], { type: 'application/json' });
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
        const imported = importState(ev.target.result);
        setState(imported);
        addMessage('assistant', 'המשך מהנקודה שעצרנו. מה היה לנו?');
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
