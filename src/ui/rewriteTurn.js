// Guide-mode instrument: replace an interviewer question with the one the
// tester expected, and continue the interview from it.
//
// Pure and separate from the component because it is destructive — it drops
// every turn after the rewritten one, with no undo — and destructive history
// surgery should be testable without mounting React.
//
// Not in src/core: this is a testing instrument bolted onto the transcript, not
// part of the interview model. The Router knows nothing about it.

/**
 * The permanent record of one rewrite, built BEFORE the transcript is cut.
 *
 * This exists because rewriteTurn destroys evidence. The turns that followed a
 * question the tester rejected are the clearest statement of what went wrong
 * with it — where the interview drifted, what the person answered instead — and
 * dropping them from the transcript would leave the export saying only that
 * someone disagreed, not what the disagreement cost.
 *
 * So the discarded turns are copied here verbatim, and this log is append-only:
 * it is never truncated, never rewritten, and survives every later rewrite.
 *
 * @param {Array} history  transcript as it stands, oldest first
 * @param {number} index   position of the interviewer turn being replaced
 * @param {string} question the tester's wording, already trimmed
 * @param {string} [note]  why, in the tester's words
 * @param {number} [stage] the interview stage at the moment of the rewrite
 * @returns {object|null} the record, or null if the index is not there
 */
export function buildRevision(history, index, question, note, stage) {
  const target = history[index];
  if (!target) return null;

  return {
    at: Date.now(),
    index,
    stage,
    // What the model asked the first time. Preserved across repeat rewrites of
    // the same turn, so this always names the interviewer's own wording.
    original: target.feedback?.original ?? target.content,
    // What was on screen when the tester hit save — the same as `original`
    // unless this turn had already been rewritten once.
    replaced: target.content,
    rewrite: question,
    note: note ?? '',
    discarded: history.slice(index + 1),
  };
}

/**
 * @param {Array} history  transcript, oldest first
 * @param {number} index   position of the interviewer turn being replaced
 * @param {string} question the tester's wording, already trimmed
 * @param {string} [note]  the accompanying "what worked" note, if any
 * @returns {Array} a new transcript ending at the rewritten turn
 */
export function rewriteTurn(history, index, question, note) {
  const target = history[index];
  if (!target) return history;

  return [
    ...history.slice(0, index),
    {
      ...target,
      content: question,
      feedback: {
        ...(note ? { text: note } : {}),
        rewrite: question,
        // The model's wording, not the previous rewrite: a second pass over the
        // same turn must not lose what the interviewer actually asked.
        original: target.feedback?.original ?? target.content,
        at: Date.now(),
      },
    },
  ];
}

/**
 * A note on a turn, without replacing it.
 *
 * Ran, 6.9.2026: give feedback on what was wrong and move on, without having to
 * write the question you would have asked instead. Until now the editor demanded
 * both fields, so the only way to record "this question was off" was to also
 * rewrite the turn — which discards every answer that followed it. A tester with
 * an opinion and no better wording had to choose between losing the transcript
 * and saying nothing.
 *
 * This path replaces nothing and discards nothing. What it must not do is forget:
 * a turn that was rewritten EARLIER carries the interviewer's own wording on
 * `original`, and a later note on the same turn has to keep it, or the export
 * stops showing what the model actually asked. Same rule the rewrite path states
 * for itself, on the other path in.
 *
 * @param {object} [existing] the turn's current feedback, if it has any
 * @param {string} note the tester's words, already trimmed
 * @returns {object} feedback to store on the turn
 */
export function mergeNote(existing, note) {
  return { ...(existing ?? {}), text: note, at: Date.now() };
}
