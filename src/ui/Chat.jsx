import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import ConfirmButtons from './ConfirmButtons.jsx';
import DecisionBoard from './DecisionBoard.jsx';
import { Mark, Send, ArrowDown } from './icons.jsx';

// Treat the reader as "at the bottom" within this many pixels — the standard
// chat rule: auto-scroll only while they are following the live conversation.
const NEAR_BOTTOM_PX = 120;

const TIME_FMT = new Intl.DateTimeFormat('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
});

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
  const [showJump, setShowJump] = useState(false);

  const scrollerRef = useRef(null);
  const textareaRef = useRef(null);
  const stickRef = useRef(true); // following the bottom?

  const scrollToBottom = useCallback((behavior) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickRef.current = near;
    setShowJump(!near);
  };

  // New content pulls the view down only if the reader was already following it.
  // Sending your own message always does — that is what every chat client does.
  useEffect(() => {
    if (history[history.length - 1]?.role === 'user') {
      stickRef.current = true;
      setShowJump(false);
    }
    // Instant, not smooth: a smooth scroll would race the scroll handler and
    // flicker the jump pill on every incoming message. Only the jump button
    // animates.
    if (stickRef.current) scrollToBottom('auto');
  }, [history, loading, board, scrollToBottom]);

  // Auto-grow the composer up to the max-height set in CSS, then let it scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const blocked = loading || awaitingConfirmation || sessionComplete;
  const canSend = !blocked && input.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    const text = input.trim();
    setInput('');
    onSend(text);
    // Keep the caret in the composer so the next turn can be typed straight away
    // (and the on-screen keyboard stays up on mobile).
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter breaks the line. Never send mid-IME-composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat">
      <div className="stream">
        <div className="scroller" ref={scrollerRef} onScroll={handleScroll}>
          <div
            className="column"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {history.map((msg, i) => (
              <Message
                key={i}
                role={msg.role}
                content={msg.content}
                at={msg.at}
                grouped={i > 0 && history[i - 1].role === msg.role}
              />
            ))}

            {loading && (
              <div className="msg assistant">
                <div className="avatar" aria-hidden="true">
                  <Mark size={16} />
                </div>
                <div className="bubble-wrap">
                  <div className="bubble" aria-label="מנסח תשובה">
                    <div className="typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Decision board (stage 7) — built by code from state, never by the
                model, and rendered inline as the last card in the thread. */}
            <DecisionBoard board={board} />
          </div>
        </div>

        {showJump && (
          <button
            className="jump"
            onClick={() => {
              stickRef.current = true;
              setShowJump(false);
              scrollToBottom('smooth');
            }}
          >
            <ArrowDown size={15} />
            להודעה האחרונה
          </button>
        )}
      </div>

      {awaitingConfirmation && (
        <ConfirmButtons onConfirm={onConfirm} onReject={onReject} />
      )}

      {sessionComplete ? (
        <div className="banner done">הראיון הסתיים. ההחלטה — שלך.</div>
      ) : (
        <div className="composer">
          <div className={`composer-inner${awaitingConfirmation ? ' disabled' : ''}`}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              // Editable while the model works, so the next answer can be typed
              // ahead; only sending is gated. Confirmation is a real gate.
              disabled={awaitingConfirmation}
              placeholder={
                awaitingConfirmation ? 'אשר את הסיכום כדי להמשיך' : 'כתוב כאן…'
              }
              aria-label="הודעה"
            />
            <button
              className="send"
              onClick={submit}
              disabled={!canSend}
              aria-label="שלח"
              title="שלח"
            >
              <Send />
            </button>
          </div>
          <div className="hint">Enter לשליחה · Shift+Enter לשורה חדשה</div>
        </div>
      )}
    </div>
  );
}

function Message({ role, content, at, grouped }) {
  const isAssistant = role === 'assistant';
  return (
    <div className={`msg ${isAssistant ? 'assistant' : 'user'}${grouped ? ' grouped' : ''}`}>
      {isAssistant && (
        <div className={`avatar${grouped ? ' ghost' : ''}`} aria-hidden="true">
          <Mark size={16} />
        </div>
      )}
      <div className="bubble-wrap">
        <div className="bubble">{content}</div>
        {at ? <div className="stamp">{TIME_FMT.format(at)}</div> : null}
      </div>
    </div>
  );
}
