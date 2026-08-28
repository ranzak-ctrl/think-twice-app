// The story mirror — the case drawn beside the chat while it is told.
//
// This component DRAWS ONLY. What may appear, and when, is decided in
// src/core/story.js next to the rules and the tests that guard them. Read that
// header first; in short, the drawing shows content and never assessment, never
// the wound or the ADHD pattern, never a character's clarity flag, and it commits
// ink only to what the interview has already graded as solid.
//
// WHY A SKETCH AND NOT A LIST. The first build printed the findings as bullets
// under stage headings, and Ran's verdict on the live run was that it was "a
// summary of the story taking shape in words" rather than a drawing. What was
// missing was not decoration:
//
//   Shape carries meaning. A fact is a box, an interpretation is a dashed cloud,
//   a feeling is a soft blob, something done is a heavy box. Seeing at a glance
//   that the thought is a DIFFERENT KIND OF THING from the event is most of the
//   clinical work here — the person who never separated the two sees them as two
//   shapes before reading a word.
//
//   The arrow is the argument. Nodes come out of the projection in the order the
//   story happened, so the connector reads "led to". That chain is what the
//   interview exists to expose.
//
//   Hand-drawn, deliberately. A crisp diagram of someone's worst evening looks
//   like a case file being assembled about them, which design/brief.md:39 says is
//   the sharpest thing to avoid with this audience. A pencil sketch reads as
//   thinking-with-you. The wobble is deterministic per node — seeded from the
//   node's stable id — so the drawing never re-randomises under the reader's eye;
//   a line that redraws itself on an unrelated state change is exactly the
//   competing motion :39 warns about.
//
// The footer is a statement, not a question. design/brief.md:99 — the screen must
// never present two asks at once — and the interviewer's turn is always already
// one question.

import { buildStory } from '../core/story.js';

// Deterministic pick: same node id always draws the same wobble. Any small string
// hash does; this one only has to be stable and cheap, never uniform.
function pick(id, n) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % n;
}

// Three arrows rather than one repeated: a hand does not draw the same stroke
// twice, and a column of identical connectors is the tell that this is a template.
const ARROWS = [
  'M7 1.5 C5.4 8 8.6 14 7 22',
  'M7 1.5 C8.4 7.5 5.6 14.5 7 22',
  'M6.8 1.5 C6.2 9 7.8 15 7 22',
];
const HEADS = ['M3.7 17.9 L7 23.2 L10.3 17.7', 'M3.9 18.2 L7 23 L10.2 17.9'];

function Arrow({ seed }) {
  return (
    <svg className="sk-arrow" viewBox="0 0 14 24" aria-hidden="true" focusable="false">
      <path d={ARROWS[pick(seed, ARROWS.length)]} />
      <path d={HEADS[pick(seed, HEADS.length)]} />
    </svg>
  );
}

export default function StoryPanel({ state }) {
  const { cast, nodes, isEmpty } = buildStory(state);

  // Nothing solid understood yet — draw nothing. An empty frame labelled with the
  // parts still to come is a completion meter (design/brief.md:63-65), and blank
  // chrome at the side of a first screen is clutter for someone arriving flooded.
  if (isEmpty) return null;

  return (
    <aside className="story" aria-label="הסיפור כפי שהובן עד כה">
      <div className="story-head">
        <h2 className="story-title">הסיפור עד כאן</h2>
        <p className="story-sub">כך אני מצייר לעצמי את מה שסיפרת.</p>
      </div>

      {cast.length > 0 && (
        <ul className="sk-cast">
          {cast.map((a) => (
            <li className={`sk-chip sk-w${pick(a.id, 3)}`} key={a.id}>
              {a.label}
            </li>
          ))}
        </ul>
      )}

      <ol className="sk-flow">
        {nodes.map((node, i) => (
          <li className="sk-step" key={node.id}>
            {i > 0 && <Arrow seed={node.id} />}
            <div className={`sk-node is-${node.kind} sk-w${pick(node.id, 3)}`}>{node.text}</div>
          </li>
        ))}
      </ol>

      <p className="story-foot">אם משהו כאן לא מדויק — כתוב לי בהודעה הבאה ואתקן.</p>
    </aside>
  );
}
