import { useState, useRef, useEffect } from 'react';
import ConfirmButtons from './ConfirmButtons.jsx';
import DecisionBoard from './DecisionBoard.jsx';

export default function Chat({
  history,
  loading,
  board,
  awaitingConfirmation,
  sessionComplete,
  onSend,
  onConfirm,
  onReject,
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || awaitingConfirmation || sessionComplete) return;
    setInput('');
    onSend(text);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {history.map((msg, i) => (
          <Bubble key={i} role={msg.role} content={msg.content} />
        ))}
        {loading && <Bubble role="assistant" content="…" loading />}
        <div ref={bottomRef} />
      </div>

      {/* Decision board (stage 7) — rendered by code from state */}
      <DecisionBoard board={board} />

      {/* Confirm buttons */}
      {awaitingConfirmation && (
        <ConfirmButtons onConfirm={onConfirm} onReject={onReject} />
      )}

      {/* Session complete banner */}
      {sessionComplete && (
        <div
          style={{
            background: '#d4edda',
            padding: '12px 20px',
            textAlign: 'center',
            fontSize: 15,
            fontWeight: 'bold',
          }}
        >
          הראיון הסתיים. ההחלטה — שלך.
        </div>
      )}

      {/* Input */}
      {!sessionComplete && (
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: '1px solid #e0e0e0',
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            background: '#fff',
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || awaitingConfirmation}
            placeholder={awaitingConfirmation ? 'אשר את הסיכום למעלה' : 'כתוב כאן...'}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #ccc',
              fontSize: 15,
              direction: 'rtl',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading || awaitingConfirmation || !input.trim()}
            style={{
              background: loading || awaitingConfirmation ? '#ccc' : '#1a1a1a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 15,
              cursor: loading || awaitingConfirmation ? 'not-allowed' : 'pointer',
            }}
          >
            שלח
          </button>
        </form>
      )}
    </div>
  );
}

function Bubble({ role, content, loading: isLoading }) {
  const isAssistant = role === 'assistant';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isAssistant ? 'flex-start' : 'flex-end',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: '72%',
          background: isAssistant ? '#fff' : '#1a1a1a',
          color: isAssistant ? '#1a1a1a' : '#fff',
          border: isAssistant ? '1px solid #e0e0e0' : 'none',
          borderRadius: isAssistant ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
          padding: '10px 14px',
          fontSize: 15,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          opacity: isLoading ? 0.5 : 1,
        }}
      >
        {content}
      </div>
    </div>
  );
}
