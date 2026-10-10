import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import ConfirmButtons from './ConfirmButtons.jsx';
import DecisionBoard from './DecisionBoard.jsx';
import Preamble from './Preamble.jsx';
import { Mark, Send, ArrowDown, Note, Trash } from './icons.jsx';
import { mergeNote } from './rewriteTurn.js';

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
  // In place of the composer: the end screen while it is open (EndScreen.jsx),
  // and an interview opened from a file, for reading — `viewing` says whether it
  // ended, and `onContinue` takes an unfinished one up again.
  endPanel = null,
  viewing = null,
  onContinue,
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

  // State 0 — the opening question is on screen and the person hasn't answered
  // yet. The composer stays docked at the bottom edge as it is for the rest of
  // the session; all this state changes is that its top border goes
  // transparent, since a rule across an otherwise empty page reads as a divider
  // rather than as the frame of a control. It comes back on the first reply.
  // Keyed on "no user turn yet" rather than history.length, so it survives an
  // opener that spans more than one message.
  const atStart = !history.some((m) => m.role === 'user');

  return (
    <div className={`chat${atStart ? ' is-start' : ''}`}>
      {/* Outside the scroller on purpose: instructions are not a turn, and a
          block that scrolls up the column with the first answers reads as
          something that was said. It shows only while nobody has answered yet
          (Ran, 23.8) — once the interview is running, the person has read it,
          and it would hold a third of the window for the rest of the session. */}
      {atStart && <Preamble />}

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
                  <Mark />
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

      {awaitingConfirmation && !endPanel && !viewing && (
        <ConfirmButtons onConfirm={onConfirm} onReject={onReject} />
      )}

      {endPanel ? (
        endPanel
      ) : viewing ? (
        <div className="banner viewing">
          {viewing.complete ? (
            <span>צפייה בראיון שנשמר. הראיון הזה הסתיים, ואפשר רק לקרוא אותו.</span>
          ) : viewing.stopped ? (
            <span>צפייה בראיון שנשמר. אפשר רק לקרוא אותו.</span>
          ) : (
            <>
              <span>צפייה בראיון שנשמר.</span>
              <button className="btn btn-primary" onClick={onContinue}>
                להמשיך את הראיון
              </button>
            </>
          )}
        </div>
      ) : sessionComplete ? (
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

  // The note is required; the replacement question is not (Ran, 6.9.2026: "give
  // feedback on what was wrong and move on without defining the next question").
  //
  // Ran's rule of 15.8 — that a replacement question without a reason leaves no
  // record of why the interview was steered — still holds, and is the half that
  // stays required. The other half was doing something it was not meant to: the
  // only way to record "this question was off" was to ALSO rewrite the turn,
  // which discards every answer that followed. A tester with an opinion and no
  // better wording had to choose between losing the transcript and saying
  // nothing, and that is not a trade the instrument should be forcing.
  const canSave = draft.trim().length > 0;

  // Which of the two things saving does. The second field is the switch: with it,
  // the turn is replaced and the interview continues from the tester's question;
  // without it, the note is filed and nothing else moves.
  const willRewrite = rewriteDraft.trim().length > 0;

  // How many turns saving would discard. Shown before, never after: there is no
  // undo, and the tester should decide with the number in front of them rather
  // than discover it from a suddenly shorter transcript.
  const discards = trailing;

  const save = () => {
    if (!canSave) return;
    const note = draft.trim();
    if (willRewrite) onRewrite(index, rewriteDraft.trim(), note);
    else onFeedback(index, mergeNote(feedback, note));
    setEditing(false);
  };

  return (
    // Two voices, told apart by card-versus-no-card rather than by which wall
    // each is pinned to: the interviewer speaks from a white card behind its
    // mark, the person's answer is plain text on the page directly under the
    // question it answers.
    <div className={`msg ${isAssistant ? 'assistant' : 'user'}${grouped ? ' grouped' : ''}`}>
      {isAssistant && (
        <div className={`avatar${grouped ? ' ghost' : ''}`} aria-hidden="true">
          <Mark />
        </div>
      )}

      <div className="bubble-wrap">
        <div className="bubble">{content}</div>
        {/* Only the person's turns are stamped. A time beside every interviewer
            line turned the column into a log; the answers are what anyone
            scanning back is looking for, and stamping only those makes them
            findable. */}
        {at && !isAssistant ? <div className="stamp">{TIME_FMT.format(at)}</div> : null}

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
              placeholder="לא חובה — נסח את השאלה שהיית מצפה לקבל בשלב הזה"
              aria-label="השאלה שציפית לה (לא חובה)"
            />

            {/* What saving will do, in the words of what is in the fields right
                now. It changes as the second field is filled or emptied, so the
                tester is never told about a consequence that is not theirs. */}
            <p className="note-edit-hint">
              {willRewrite
                ? 'הראיון ימשך מהשאלה שהזנת בטופס המשוב.'
                : 'ההערה תישמר והראיון ימשיך כרגיל. אם תשאיר את השדה השני ריק, שום תור לא יימחק.'}
            </p>

            {/* Kept alongside Ran's line rather than folded into it: that line
                says what happens next, this one says what stops existing. Only
                appears when turns are actually at stake, and saving cannot be
                undone. */}
            {willRewrite && discards > 0 && (
              <p className="note-edit-hint is-warn">
                {discards} התורות שאחרי השאלה הזו יימחקו. אין ביטול.
              </p>
            )}

            <div className="note-edit-actions">
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={!canSave}
                title={canSave ? undefined : 'יש לכתוב מה לא עבד בשאלה'}
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
