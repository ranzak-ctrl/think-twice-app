// The story mirror — the case taking shape beside the chat, while it is told.
//
// This component RENDERS ONLY. Every rule about what may and may not appear here
// lives in src/core/story.js, next to the projection that enforces it and the
// tests that guard it. Read that header before changing anything in this file;
// the short version is that the mirror shows content and never assessment, never
// shows the wound or the ADHD pattern, never shows a character's clarity flag,
// and adds no control of any kind.
//
// Two details of the rendering are themselves clinical, so they are here:
//
//   The arrows are not decoration. Scenes come out of the projection in the order
//   the story happened — event → thought → feeling → action — so the connector
//   between two boxes reads as "led to". That chain is what the interview exists
//   to expose. They are aria-hidden: the reading order already carries the
//   sequence, and a screen reader announcing six arrows adds noise, not meaning.
//
//   The footer is a statement, not a question. design/brief.md:99 — the screen
//   must never present two asks at once — and the interviewer's turn in the chat
//   is always already one question. A panel that ended in "משהו לא מדויק?" would
//   put a second ask on screen beside it. So it tells the person how to correct
//   the mirror and does not ask them anything.

import { buildStory } from '../core/story.js';

export default function StoryPanel({ state }) {
  const { cast, scenes, isEmpty } = buildStory(state);

  // Nothing understood yet — render nothing at all. An empty panel labelled with
  // the scenes still to come would be a progress meter (design/brief.md:63-65),
  // and an empty frame at the side of a first screen is clutter for someone who
  // arrives flooded. The mirror appears when it has something true to show.
  if (isEmpty) return null;

  return (
    <aside className="story" aria-label="הסיפור כפי שהובן עד כה">
      <div className="story-head">
        <h2 className="story-title">הסיפור עד כאן</h2>
        <p className="story-sub">כך הבנתי את מה שסיפרת.</p>
      </div>

      {cast.length > 0 && (
        <ul className="story-cast">
          {cast.map((a) => (
            <li className="story-actor" key={a.id}>
              <div className="story-actor-head">
                <span className="story-actor-name">{a.label}</span>
                {a.role && <span className="story-actor-role">{a.role}</span>}
              </div>
              {a.actions.length > 0 && (
                <ul className="story-actor-acts">
                  {a.actions.map((act, i) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <ol className="story-flow">
        {scenes.map((scene, i) => (
          <li className="story-step" key={scene.key}>
            {i > 0 && <div className="story-arrow" aria-hidden="true" />}
            <div className="story-box">
              <h3 className="story-box-title">{scene.title}</h3>
              <ul className="story-lines">
                {scene.lines.map((line, k) => (
                  <li key={k}>{line}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>

      <p className="story-foot">אם משהו כאן לא מדויק — כתוב לי בהודעה הבאה ואתקן.</p>
    </aside>
  );
}
