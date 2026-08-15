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
