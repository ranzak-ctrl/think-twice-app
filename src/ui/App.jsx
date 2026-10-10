import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Chat from './Chat.jsx';
import { reportFailure } from '../adapters/errorReport.js';
import GuidePanel from './GuidePanel.jsx';
import StageRail from './StageRail.jsx';
import StoryMap from './StoryMap.jsx';
import { serializeMap, rasterize } from './mapExport.js';
import { getPref, setPref } from '../adapters/uiPrefs.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import EndScreen from './EndScreen.jsx';
import { Logo, Download, Upload, Gauge, MapSketch, Exit } from './icons.jsx';
import { importState } from '../core/state.js';
// The interview — pack, texts and model adapter, composed once (interview.js).
import { interview, interviewMigrations } from './interview.js';
import {
  buildSessionExport,
  buildInterviewFile,
  importCompatibility,
  interviewHeader,
  upgradeSession,
} from './sessionExport.js';
import { sealInterview, openInterviewFile, isSealedFile, interviewFileName, FILE_EXTENSION } from '../adapters/interviewFile.js';
import { APP_VERSION } from '../adapters/appVersion.js';
import { rewriteTurn, buildRevision } from './rewriteTurn.js';

// Why an export was not loaded — said plainly to whoever chose the file.
const IMPORT_REFUSAL = {
  'other-interview': (f) => `הקובץ הזה הוא ייצוא של ראיון אחר (${f.name}), ולכן אי אפשר לטעון אותו כאן.`,
  'other-version': (f) => `הקובץ הזה נוצר בגרסה אחרת של הראיון (גרסה ${f.from}, והנוכחית ${f.current}), ולכן אי אפשר לטעון אותו.`,
  'no-header': () => 'הקובץ הזה נוצר בגרסה ישנה של האפליקציה, ולכן אי אפשר לטעון אותו.',
};

// Why a person's encrypted file did not open. Theirs is the only copy, so each
// message says what is wrong with the file — or that the fault is ours.
const OPEN_REFUSAL = {
  // The function (api/interview-file.js)
  tampered: () => 'הקובץ הזה פגום או ששונה, ולכן אי אפשר לפתוח אותו.',
  'not-a-file': () => 'הקובץ הזה פגום או ששונה, ולכן אי אפשר לפתוח אותו.',
  'unknown-key': () => 'הקובץ הזה לא נוצר באפליקציה הזו, ולכן אי אפשר לפתוח אותו כאן.',
  'newer-file': () => 'הקובץ הזה נוצר בגרסה חדשה יותר של האפליקציה. רענן את הדף ונסה שוב.',
  'not-configured': () => 'פתיחת קבצים לא זמינה כרגע. נסה שוב מאוחר יותר.',
  'too-large': () => 'הקובץ גדול מדי, ולכן אי אפשר לפתוח אותו.',
  network: () => 'בעיית תקשורת. בדוק את החיבור לאינטרנט ונסה שוב.',
  // What is inside (sessionExport.js, upgradeSession)
  'other-interview': (f) => `הקובץ הזה הוא ראיון אחר (${f.name}), ולכן אי אפשר לפתוח אותו כאן.`,
  'newer-version': () => 'הקובץ הזה נוצר בגרסה חדשה יותר של הראיון. רענן את הדף ונסה שוב.',
  'no-migration': () => 'הקובץ הזה נוצר בגרסה קודמת, ועדיין אי אפשר לפתוח אותו כאן. זו תקלה אצלנו, ולא בקובץ.',
  'no-header': () => 'הקובץ הזה פגום, ולכן אי אפשר לפתוח אותו.',
};
const openRefusal = (r) => (OPEN_REFUSAL[r.reason ?? r.error] ?? (() => 'לא הצלחנו לפתוח את הקובץ.'))(r);

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
  const [state, setState] = useState(() => interview.createState());
  const [history, setHistory] = useState(() => [openingMessage()]);
  const [guideOpen, setGuideOpen] = useState(false);
  // Whether the case map is on screen. Ran, 6.9.2026: a button that hides and
  // reveals the drawing. Remembered per browser — see src/adapters/uiPrefs.js for
  // why a display preference is not the user content principle 6 keeps out of
  // storage. Shown by default, so nobody has to find the button to see the map.
  const [mapOpen, setMapOpen] = useState(() => getPref('mapOpen', true));
  const [guideWidth, setGuideWidth] = useState(340); // resizable via the divider
  const [loading, setLoading] = useState(false);
  // The end screen, while it is open: { reason: 'complete' | 'leave', fileName }.
  const [end, setEnd] = useState(null);
  // An interview opened from a person's file, shown for reading: { complete }.
  // Null while an interview is live.
  const [viewing, setViewing] = useState(null);
  // A file that opened, waiting for "replace the interview on screen?".
  const [pendingOpen, setPendingOpen] = useState(null);
  // Set the moment the page reloads on purpose, so the browser's "leave site?"
  // does not stand between the person and the erasing they just chose.
  const exitingRef = useRef(false);
  // Append-only log of every tester rewrite, including the turns each one
  // discarded. Separate from `history` precisely because history gets cut.
  const [revisions, setRevisions] = useState([]);
  // Technical failures seen this session, for the error report. Metadata only —
  // the adapter builds each entry and puts no interview content in it. Held in
  // memory like everything else; nothing is persisted (principle 6).
  const [failures, setFailures] = useState([]);

  // The bundle filename is the build's fingerprint: it encodes which VITE_ config
  // produced the deployment, so a report names the exact build that failed.
  const bundleName = () =>
    document.querySelector('script[src*="/assets/index-"]')?.src?.split('/').pop() ?? null;

  // One path for both halves: keep it for the downloadable report, and send the
  // metadata to the Runtime Log so a failure is visible without the tester doing
  // anything. The send is fire-and-forget and cannot affect the turn.
  const recordFailure = useCallback(
    (failure, atState) => {
      const entry = { ...failure, at: new Date().toISOString() };
      setFailures((f) => [...f, entry]);
      reportFailure({
        failures: [entry],
        stage: atState.meta.currentStage,
        questionCount: atState.meta.questionCount,
        bundle: bundleName(),
      });
    },
    []
  );
  const fileRef = useRef(null);

  // Built once and used twice: the drawing itself, and the header toggle, which
  // only appears once there is something on the map to hide.
  const map = useMemo(() => interview.buildMap(state), [state]);

  // Nothing is persisted anywhere (no server, no storage — see CLAUDE.md), so
  // anything past the opening message is lost for good unless it is saved to a
  // file. An interview opened for reading is not: the person holds its file.
  const isDirty = history.length > 1 && !viewing;

  // The browser only allows its own generic "leave site?" prompt here — the text
  // cannot be customised and no download button can be attached to it. Leaving
  // through the end screen is not "leaving by accident", so it is let through.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => {
      if (exitingRef.current) return;
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
        const { nextState, reply, unauthorized, failure } = await interview.runTurn(state, history, text);
        setState(nextState);
        if (failure) recordFailure(failure, nextState);
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
    const advanced = interview.confirmAndAdvance(state);
    setState(advanced);
    setLoading(true);
    try {
      const { nextState, message, failure } = await interview.generateStageOpener(advanced, history);
      setState(nextState);
      if (failure) recordFailure(failure, nextState);
      addMessage('assistant', message);
    } finally {
      setLoading(false);
    }
  }, [state, history, loading]);

  const handleReject = useCallback(() => {
    setState((s) => interview.rejectConfirmation(s));
    addMessage('assistant', 'בסדר — מה רצית לתקן?');
  }, []);

  const download = (href, filename) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  };

  // Technical error report — deliberately NOT the session. It carries what
  // diagnoses a failure and nothing that identifies a person or an interview:
  // no transcript, no prompt, no state document, no map. `requestId` matches the
  // `x-request-id` the proxy logged, so this file and the Vercel Runtime Log line
  // point at the same request without either one holding the conversation.
  //
  // Storing the interview outside the browser is forbidden (principle 6). This
  // stays inside it: the file is built in memory and handed to the person, who
  // decides where it goes. Nothing is uploaded.
  const handleErrorReport = () => {
    const payload = {
      reportedAt: new Date().toISOString(),
      interview: interviewHeader(interview.pack),
      app: {
        version: APP_VERSION,
        bundle: bundleName(),
        userAgent: navigator.userAgent,
        href: window.location.origin,
      },
      stage: state.meta.currentStage,
      questionCount: state.meta.questionCount,
      failures,
    };
    const json = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    );
    download(json, `think-twice-error-${Date.now()}.json`);
    URL.revokeObjectURL(json);
  };

  // The testers' readable export — guide mode only (GuidePanel). A person's own
  // file is the encrypted one below; this one carries the interview in the clear,
  // gaps and barred findings included, for /live-test and the analyst.
  const handleExportPlain = async () => {
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
    // The transcript is the point of the export and the only copy that exists —
    // nothing is persisted anywhere. So capturing the picture must never be able
    // to cost it: a throw here (no XMLSerializer, a detached node, a browser
    // that will not compute styles) drops the drawing, not the run.
    const stamp = Date.now();
    let mapSvg = null;
    try {
      mapSvg = serializeMap(document.querySelector('svg.mp'));
    } catch {
      mapSvg = null;
    }

    // Opens with which interview and which app version (Ran, 9.10.2026).
    const payload = buildSessionExport({
      pack: interview.pack,
      appVersion: APP_VERSION,
      bundle: bundleName(),
      exportedAt: new Date().toISOString(),
      history,
      state,
      revisions,
      map,
      mapSvg,
    });
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

  // ── A person's file ──
  //
  // Sealed on the server and handed to the person; nothing is kept anywhere else
  // (plan 2ב, stage 4.7). The same payload whether it is saved midway, from the
  // header, or by the end screen.
  const sealCurrent = useCallback(async () => {
    const out = await sealInterview(
      buildInterviewFile({
        pack: interview.pack,
        appVersion: APP_VERSION,
        bundle: bundleName(),
        savedAt: new Date().toISOString(),
        history,
        state,
        revisions,
      })
    );
    if (out.unauthorized) onUnauthorized?.();
    return out;
  }, [history, state, revisions, onUnauthorized]);

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const out = await sealCurrent();
      if (!out.ok) {
        if (!out.unauthorized) alert('לא הצלחנו לשמור את הקובץ. נסה שוב.');
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out.file)], { type: 'application/octet-stream' }));
      download(url, interviewFileName());
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  };

  // Leaving reloads the page: the one way to be sure the interview is gone from
  // the tab's memory. The access password stays — it is per tab, and not content.
  const exitApp = useCallback(() => {
    exitingRef.current = true;
    window.location.reload();
  }, []);

  // The interview ended by itself: the end screen opens with it. Not for an
  // interview opened for reading — the person already holds that file.
  useEffect(() => {
    if (state.meta.sessionComplete && !viewing && !end) {
      setEnd({ reason: 'complete', fileName: interviewFileName() });
    }
  }, [state.meta.sessionComplete, viewing, end]);

  const handleLeave = () => {
    if (viewing) {
      // Nothing new to save: close the file, and the page with it.
      exitApp();
      return;
    }
    setEnd({ reason: 'leave', fileName: interviewFileName() });
  };

  const applyOpened = ({ session, viewOnly }) => {
    setState(importState(JSON.stringify(session)));
    setRevisions(Array.isArray(session.revisions) ? session.revisions : []);
    setHistory(Array.isArray(session.history) && session.history.length ? session.history : [openingMessage()]);
    setViewing(viewOnly ? { complete: Boolean(session.state?.meta?.sessionComplete) } : null);
    setPendingOpen(null);
  };

  // Replacing a live interview with a file erases it, so it asks first.
  const offerOpened = (opened) => {
    if (isDirty) setPendingOpen(opened);
    else applyOpened(opened);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // re-choosing the same file must fire change again
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.target.result);
      } catch {
        alert('קובץ לא תקין.');
        return;
      }

      // A person's encrypted file: opened by the server, brought up to this
      // version, and shown for reading first.
      if (isSealedFile(parsed)) {
        const opened = await openInterviewFile(parsed);
        if (!opened.ok) {
          if (opened.unauthorized) onUnauthorized?.();
          else alert(openRefusal(opened));
          return;
        }
        const up = upgradeSession(opened.payload, interview.pack, interviewMigrations);
        if (!up.ok) {
          alert(openRefusal(up));
          return;
        }
        try {
          importState(JSON.stringify(up.session));
        } catch {
          alert(openRefusal({ reason: 'no-header' }));
          return;
        }
        offerOpened({ session: up.session, viewOnly: true });
        return;
      }

      // A testers' readable export: only this interview model at this version
      // (Ran, 9.10.2026: old exports are not supported). See sessionExport.js.
      const fit = importCompatibility(parsed, interview.pack);
      if (!fit.ok) {
        alert(IMPORT_REFUSAL[fit.reason](fit));
        return;
      }
      try {
        importState(JSON.stringify(parsed));
      } catch {
        alert('קובץ לא תקין.');
        return;
      }
      offerOpened({ session: parsed, viewOnly: false });
    };
    reader.readAsText(file);
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
            {/* Leaving midway opens the end screen (Ran, 10.10.2026). There is
                no "new interview" any more: the next one starts after the page
                reloads, which is what erases this one. */}
            {(isDirty || viewing) && (
              <button
                className="btn"
                onClick={handleLeave}
                disabled={loading || Boolean(end)}
                title={viewing ? 'סגירת הקובץ' : 'סיום ויציאה'}
              >
                <Exit />
                <span className="btn-label">{viewing ? 'סגירה' : 'סיום'}</span>
              </button>
            )}

            {isDirty && !end && (
              <button
                className="btn"
                onClick={handleSave}
                disabled={saving}
                title="שמירת הראיון בקובץ מוצפן"
              >
                <Download />
                <span className="btn-label">{saving ? 'שומר…' : 'שמירה'}</span>
              </button>
            )}

            {/* Appears only once something has actually failed, so a clean run
                never shows a button about errors. */}
            {failures.length > 0 && (
              <button
                className="btn"
                onClick={handleErrorReport}
                title="דוח תקלה טכנית — בלי תוכן הראיון"
              >
                <span className="btn-label">דוח תקלה ({failures.length})</span>
              </button>
            )}

            {!end && (
              <button className="btn" onClick={() => fileRef.current?.click()} title="פתיחת קובץ ראיון">
                <Upload />
                <span className="btn-label">פתיחת קובץ</span>
              </button>
            )}
            {/* A person's encrypted file, or a testers' readable export. */}
            <input
              ref={fileRef}
              type="file"
              accept={`${FILE_EXTENSION},.json`}
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
            viewing={viewing}
            onContinue={() => setViewing(null)}
            endPanel={
              end && (
                <EndScreen
                  reason={end.reason}
                  fileName={end.fileName}
                  seal={sealCurrent}
                  onReturn={() => setEnd(null)}
                  onExit={exitApp}
                />
              )
            }
          />
          {mapOpen && <StoryMap map={map} />}
          <StageRail
            stage={state.meta.currentStage}
            sessionComplete={state.meta.sessionComplete}
            pack={interview.pack}
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
            pack={interview.pack}
            account={interview.renderEvent}
            width={guideWidth}
            revisions={revisions}
            notes={history
              .map((m, i) => (m.feedback ? { i, question: m.content, ...m.feedback } : null))
              .filter(Boolean)}
            onClose={() => setGuideOpen(false)}
            onExportPlain={handleExportPlain}
          />
        </>
      )}

      {pendingOpen && (
        <ConfirmDialog
          title="לפתוח את הקובץ?"
          body="הראיון שעל המסך יוחלף בזה שבקובץ, וכל מה שנאמר בו יימחק. כדי לשמור אותו קודם, בטל ולחץ על 'שמירה'."
          onClose={() => setPendingOpen(null)}
          actions={
            <>
              <button className="btn btn-primary" onClick={() => applyOpened(pendingOpen)}>
                <Upload />
                לפתוח את הקובץ
              </button>
              <button className="btn" onClick={() => setPendingOpen(null)}>
                ביטול
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
