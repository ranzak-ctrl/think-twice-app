import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import ConfirmButtons from './ConfirmButtons.jsx';
import DecisionBoard from './DecisionBoard.jsx';
import IntroCard from './IntroCard.jsx';
import { Mark, Send, ArrowDown, Note, Trash } from './icons.jsx';

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
  feedbackEnabled,
  onFeedback,
  onRewrite,
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

  // State 0 — the opening turn is on screen and the person hasn't answered yet.
  // Until they do, the composer sits directly under the opener in the middle of
  // the screen rather than pinned to the bottom edge: the first answer is the
  // only thing being asked for, so it shouldn't be at the far end of an empty
  // page. It drops to the normal position the moment they reply.
  // Keyed on "no user turn yet" rather than history.length, so it survives an
  // opener that spans more than one message.
  const atStart = !history.some((m) => m.role === 'user');

  return (
    <div className={`chat${atStart ? ' is-start' : ''}`}>
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
                index={i}
                role={msg.role}
                content={msg.content}
                at={msg.at}
                grouped={i > 0 && history[i - 1].role === msg.role}
                feedback={msg.feedback}
                feedbackEnabled={feedbackEnabled}
                onFeedback={onFeedback}
                onRewrite={onRewrite}
                trailing={history.length - 1 - i}
              />
            ))}

            {loading && (
              <div className="msg assistant">
                <div className="avatar" aria-hidden="true">
                  <Mark size={26} />
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
          {/* Under the composer, not above the opener: the reassurance that
              nothing is stored is most wanted at the moment of typing, and
              there it stays on screen instead of scrolling away after the
              first answer. */}
          <IntroCard />
        </div>
      )}
    </div>
  );
}

function Message({
  index,
  role,
  content,
  at,
  grouped,
  feedback,
  feedbackEnabled,
  onFeedback,
  onRewrite,
  trailing = 0,
}) {
  const isAssistant = role === 'assistant';
  // The opener is framing, not a reply — it answers nothing and was not "sent"
  // at a moment worth marking. Stamping it invites reading the interview as a
  // clock, which is the pressure design/brief.md rules out.
  const isOpening = index === 0 && isAssistant;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [rewriteDraft, setRewriteDraft] = useState('');
  const draftRef = useRef(null);

  // Only the interviewer's questions can be annotated, and only in guide mode:
  // this is instrumentation for testers, not part of the user's screen.
  const canAnnotate = isAssistant && feedbackEnabled;

  useEffect(() => {
    if (editing) draftRef.current?.focus();
  }, [editing]);

  // Leaving guide mode closes any open editor, so re-entering never resurrects it.
  useEffect(() => {
    if (!feedbackEnabled) setEditing(false);
  }, [feedbackEnabled]);

  const openEditor = () => {
    setDraft(feedback?.text ?? '');
    setRewriteDraft(feedback?.rewrite ?? '');
    setEditing(true);
  };

  // Both fields are required (Ran, 15.8): feedback without the question the
  // tester expected is an opinion nobody can act on, and a replacement question
  // without a reason leaves no record of why the interview was steered.
  const canSave = draft.trim().length > 0 && rewriteDraft.trim().length > 0;

  // How many turns saving would discard. Shown before, never after: there is no
  // undo, and the tester should decide with the number in front of them rather
  // than discover it from a suddenly shorter transcript.
  const discards = trailing;

  const save = () => {
    if (!canSave) return;
    onRewrite(index, rewriteDraft.trim(), draft.trim());
    setEditing(false);
  };

  return (
    // The opening turn is framing, not a conversational reply: it introduces the
    // process rather than answering anything. So it spans the full column and
    // lines up with the composer beneath it, instead of sitting in a 78% bubble
    // indented past an avatar. Every later turn keeps the normal bubble rhythm.
    <div
      className={`msg ${isAssistant ? 'assistant' : 'user'}${grouped ? ' grouped' : ''}${
        isOpening ? ' is-opening' : ''
      }`}
    >
      {isAssistant && (
        <div className={`avatar${grouped ? ' ghost' : ''}`} aria-hidden="true">
          <Mark size={26} />
        </div>
      )}

      <div className="bubble-wrap">
        <div className="bubble">{content}</div>
        {at && !isOpening ? <div className="stamp">{TIME_FMT.format(at)}</div> : null}

        {canAnnotate && editing && (
          <div className="note-edit">
            {/* Names the panel as the tester's, so an open editor is never read
                as the interview addressing the person. */}
            <div className="note-head">
              <span>הערת בודק</span>
            </div>
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              }}
              placeholder="מה עבד או לא עבד בשאלה הזו?"
              aria-label="הערת בודק"
            />

            {/* The replacement question. Filling this in does not just record an
                opinion — it swaps the interviewer's turn for the tester's and
                the interview continues from it. */}
            <textarea
              className="note-rewrite"
              value={rewriteDraft}
              onChange={(e) => setRewriteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              }}
              placeholder="נסח את השאלה שהיית מצפה לקבל בשלב הזה"
              aria-label="השאלה שציפית לה"
            />

            <p className="note-edit-hint">
              הראיון ימשך מהשאלה שהזנת בטופס המשוב.
            </p>

            {/* Kept alongside Ran's line rather than folded into it: that line
                says what happens next, this one says what stops existing. Only
                appears when turns are actually at stake, and saving cannot be
                undone. */}
            {discards > 0 && (
              <p className="note-edit-hint is-warn">
                {discards} התורות שאחרי השאלה הזו יימחקו. אין ביטול.
              </p>
            )}

            <div className="note-edit-actions">
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={!canSave}
                title={canSave ? undefined : 'יש למלא את שני השדות'}
              >
                שמור
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                ביטול
              </button>
            </div>
          </div>
        )}

        {canAnnotate && feedback && !editing && (
          <div className="note">
            <div className="note-head">
              <span>הערת בודק</span>
              <span className="spacer" />
              <button className="note-act" onClick={openEditor} title="עריכה" aria-label="ערוך הערה">
                <Note size={13} />
              </button>
              <button
                className="note-act"
                onClick={() => onFeedback(index, null)}
                title="מחיקה"
                aria-label="מחק הערה"
              >
                <Trash />
              </button>
            </div>
            {feedback.text}
            {feedback.original && (
              <div className="note-was">
                במקום: &laquo;{feedback.original}&raquo;
              </div>
            )}
          </div>
        )}
      </div>

      {canAnnotate && (
        <button
          className={`note-btn${feedback ? ' on' : ''}`}
          onClick={() => (editing ? setEditing(false) : openEditor())}
          title={feedback ? 'ערוך הערה' : 'השאר הערה על השאלה'}
          aria-label={feedback ? 'ערוך הערת בודק' : 'השאר הערת בודק'}
          aria-expanded={editing}
        >
          <Note />
        </button>
      )}
    </div>
  );
}
