// Story panel — a plain sketch of what the interviewer has understood so far.
//
// Purpose (Ran, 15.8.2026): mirror the case back to the user in boxes and
// arrows so they can see what was understood and correct it. That mirror is
// one of the four things brief.md §46 says the tool gives; it also raises the
// interviewer's confidence that what it has is real before it moves on.
//
// THREE HARD RULES, each from a written source. Read before editing.
//
// 1. Reflect CONTENT, never ASSESSMENT. brief.md §64 forbids evaluating the
//    user's input — no scores, no completeness meters, no "missing" markers.
//    gap-management §1 says `gaps` is internal intelligence that must stay
//    invisible. So this panel reads `findings` (explicitly "Observability
//    ONLY" in state.js) and `actorMap`. It must never read `coverage` or
//    `gaps`. An empty box renders faint and silent — never "you haven't told
//    me this yet", which is evaluation wearing a friendly voice.
//
// 2. The wound is never mirrored. CLAUDE.md forbids formulating `wound` for
//    the user OR REFLECTING IT BACK as our interpretation — Natali's ruling of
//    14.8: he arrives at it himself, through directed questions. `adhd_pattern`
//    is likewise barred from appearing as a diagnosis. Both are excluded by
//    construction below, not by whoever writes the next slot filter.
//
// 3. No new decision point. CLAUDE.md principle 2 allows exactly two in the
//    UI — summary confirmations and the stage-7 decision. So this panel has no
//    edit affordance, no buttons, no inline editing. A correction is made the
//    way everything else is: the user says so, the model's next evaluation
//    updates findings, and the panel re-renders. The mirror is the mechanism;
//    the chat is the interface.

// Slots deliberately withheld from the mirror. See rule 2.
const NEVER_MIRROR = new Set(['wound', 'adhd_pattern']);

// Boxes in narrative order. Each pulls short findings from one stage.
const BOXES = [
  { key: 'stage1', title: 'מה קרה', slots: ['trigger', 'timeline', 'status'] },
  { key: 'stage2', title: 'איך הבנת את זה', slots: ['causal', 'meaning'] },
  { key: 'stage3', title: 'מה הרגשת', slots: ['emotion', 'past_echo'] },
  { key: 'stage4', title: 'איך הגבת', slots: ['auto_reaction', 'planned_reaction'] },
  { key: 'stage5', title: 'זווית אחרת', slots: ['perspective', 'intention'] },
];

function linesFor(findings, stageKey, slots) {
  const stage = findings?.[stageKey] ?? {};
  const out = [];
  for (const slot of slots) {
    if (NEVER_MIRROR.has(slot)) continue; // belt and braces alongside BOXES
    for (const item of stage[slot] ?? []) out.push(item);
  }
  return out;
}

export default function StoryPanel({ state }) {
  const findings = state?.findings ?? {};
  const actors = Object.values(state?.actorMap ?? {});
  const intensity = state?.feelings?.intensity ?? null;

  return (
    <aside className="story" aria-label="סיפור המקרה — מה הובן עד כה">
      <div className="story-head">
        <h2 className="story-title">סיפור המקרה</h2>
        <p className="story-sub">כך הבנתי את מה שסיפרת עד כה.</p>
      </div>

      {actors.length > 0 && (
        <div className="story-actors">
          {actors.map((a) => (
            <div className="story-actor" key={a.id}>
              <div className="story-actor-name">{a.label}</div>
              {a.role && <div className="story-actor-role">{a.role}</div>}
              {(a.actions ?? []).map((act, i) => (
                <div className="story-actor-act" key={i}>
                  {act}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="story-flow">
        {BOXES.map(({ key, title, slots }, i) => {
          const lines = linesFor(findings, key, slots);
          const filled = lines.length > 0;
          return (
            <div key={key}>
              {i > 0 && (
                <div className="story-arrow" aria-hidden="true">
                  ↓
                </div>
              )}
              <div className={`story-box ${filled ? 'is-filled' : 'is-empty'}`}>
                <div className="story-box-title">
                  {title}
                  {key === 'stage3' && filled && intensity != null && (
                    <span className="story-chip">{intensity}/10</span>
                  )}
                </div>
                {filled &&
                  lines.map((line, k) => (
                    <div className="story-line" key={k}>
                      {line}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Correction channel — prose, not a control. See rule 3. */}
      <p className="story-foot">משהו כאן לא מדויק? פשוט כתוב לי, ואתקן.</p>
    </aside>
  );
}
