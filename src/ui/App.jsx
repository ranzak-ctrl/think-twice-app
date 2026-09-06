import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Chat from './Chat.jsx';
import GuidePanel from './GuidePanel.jsx';
import StageRail from './StageRail.jsx';
import StoryMap from './StoryMap.jsx';
import { buildMap } from '../core/storyMap.js';
import { serializeMap, rasterize } from './mapExport.js';
import { getPref, setPref } from '../adapters/uiPrefs.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { Logo, Plus, Download, Upload, Gauge, MapSketch } from './icons.jsx';
import { createState, importState } from '../core/state.js';
import { confirmAndAdvance, rejectConfirmation } from '../core/router.js';
import { runTurn, generateStageOpener } from '../core/session.js';
import { rewriteTurn, buildRevision } from './rewriteTurn.js';

// Opening turn. Ran's wording, revised 15.8.2026: the arc now ends on the
// person choosing rather than on a response being arrived at, and the close
// promises an informed decision instead of just locating ownership.
//
// Split with the redesign: the three framing sentences that used to precede
// the question were never a reply — they introduced the process rather than
// answering anything — so they left the transcript and became the preamble
// (Preamble.jsx), pinned under the header as interface. Not a word of Ran's
// changed; only the frame moved out of the conversation.
//
// What is left is what the interviewer actually says first: exactly one
// directed question, which is what the turn-lint asks of every system turn.
// The roadmap the preamble carries is interface copy and not bound by it.
const OPENING_QUESTION = 'אז ספר לי — מה קרה?';

// Messages carry a timestamp so the chat can show one; `at` is additive and
// ignored by the core (formatHistory maps role/content only), so older exports
// import cleanly without it.
const openingMessage = () => ({
  role: 'assistant',
  content: OPENING_QUESTION,
  at: Date.now(),
});

const GUIDE_MIN = 260;
const CHAT_MIN = 360;

export default function App({ onUnauthorized }) {
  const [state, setState] = useState(() => createState());
  const [history, setHistory] = useState(() => [openingMessage()]);
  const [guideOpen, setGuideOpen] = useState(false);
  // Whether the case map is on screen. Ran, 6.9.2026: a button that hides and
  // reveals the drawing. Remembered per browser — see src/adapters/uiPrefs.js for
  // why a display preference is not the user content principle 6 keeps out of
  // storage. Shown by default, so nobody has to find the button to see the map.
  const [mapOpen, setMapOpen] = useState(() => getPref('mapOpen', true));
  const [guideWidth, setGuideWidth] = useState(340); // resizable via the divider
  const [loading, setLoading] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  // Append-only log of every tester rewrite, including the turns each one
  // discarded. Separate from `history` precisely because history gets cut.
  const [revisions, setRevisions] = useState([]);
  const fileRef = useRef(null);

  // Built once and used twice: the drawing itself, and the header toggle, which
  // only appears once there is something on the map to hide.
  const map = useMemo(() => buildMap(state), [state]);

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
        const { nextState, reply, unauthorized } = await runTurn(state, history, text);
        setState(nextState);
        if (unauthorized) {
          // A locked door, not a failed turn. Take the person's message back out
          // of the transcript so they can send it again once they are through,
          // rather than leaving it answered by an error.
          setHistory((h) => h.slice(0, -1));
          onUnauthorized?.();
          return;
        }
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

  const download = (href, filename) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  };

  const handleExport = async () => {
    // Full session: the transcript (history) + the StateDocument. The
    // /export-conversation command turns this file into a Drive .docx.
    // history + state is the interview; revisions is what the tester wanted
    // changed and what that cost. The second half is the point of a guide-mode
    // run, so it ships in the same file rather than in a parallel one nobody
    // remembers to save.
    //
    // The map ships three ways, because they answer different questions. `map`
    // is the projection the drawing is a rendering of — the cubes, the arrows
    // and who owns them — and it is what a fixture or an analysis reads.
    // `mapSvg` is the drawing itself, still text, still diffable. The PNG is
    // for looking at: Ran's review of a run is of the picture, and a picture
    // nobody can open without running code is not one.
    //
    // Only the picture depends on the panel being open — it is captured from
    // what is on screen, so that it records what the tester actually saw. The
    // data goes out either way, and the drawing can be rebuilt from it.
    const stamp = Date.now();
    const svgNode = document.querySelector('svg.mp');
    const mapSvg = serializeMap(svgNode);

    const payload = {
      exportedAt: new Date().toISOString(),
      history,
      state,
      revisions,
      map,
      mapSvg,
    };
    const json = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    );
    download(json, `think-twice-session-${stamp}.json`);
    URL.revokeObjectURL(json);

    if (mapSvg) {
      const png = await rasterize(mapSvg);
      // Same stamp as the transcript, so the pair stays obvious in a folder.
      if (png) download(png, `think-twice-map-${stamp}.png`);
    }
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

            {/* Only once the map holds something. A toggle for an empty panel is a
                control that appears to do nothing, and this one sits next to the
                first answer of the interview, where confusion is expensive. */}
            {!map.isEmpty && (
              <button
                className={`btn btn-map${mapOpen ? ' is-on' : ''}`}
                onClick={() => {
                  const next = !mapOpen;
                  setMapOpen(next);
                  setPref('mapOpen', next);
                }}
                aria-pressed={mapOpen}
                title={mapOpen ? 'הסתר את האיור' : 'הצג את האיור'}
              >
                <MapSketch />
                <span className="btn-label">האיור</span>
              </button>
            )}

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

        {/* Chat, then the mirror, then the rail: in RTL the first child takes the
            right, so the conversation keeps the side the eye starts on and the
            map is drawn beside it rather than in front of it. StoryMap renders
            null until something is understood, so this is a two-column screen for
            the whole of the first answer and only widens once the map has
            something true on it — see src/core/storyMap.js. */}
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
          {mapOpen && <StoryMap map={map} />}
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
