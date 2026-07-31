---
name: golden-script
description: The fidelity contract and fixture format for turning a real Think Twice run into a golden script. Use when building a test fixture from an exported session, adding a new golden case, or reviewing whether an existing fixture is faithful to the run it came from.
---

# Golden scripts — the fidelity contract

A golden script replays the user turns from a real interview against the live API and asserts the flow does not stall. Its value comes entirely from being a faithful record of something that actually happened. A script that has been tidied, extended, or made to succeed is not a weaker test — it is a false one, because it will pass forever while guarding nothing.

## The two hard rules

**1 · No repetition.** Each user turn plays exactly once, in order. No loops, no retries, no replaying a turn to force a different branch.

**2 · Never advance past where Ran stopped.** Only turns he actually typed. No invented continuation, no happy-path completion, no "and then it would have reached a sharp decision". The script ends precisely where the real run ended — including, and especially, when it ended stuck.

A script that stops at a stall is the most valuable kind. That stall is the bug.

## What every fixture records

At the stopping point:

- stage reached, and how far coverage got in it
- `questionCount` and `saturationCount`
- the last Router decision and its reason
- whether a summary call failed
- one line on why it stopped: exhausted, stalled, load-guard fired, or Ran chose to stop

## Format

```js
// tests/e2e/<case-name>.test.js
// Live golden script — <case> · run <DD.M.YYYY> · export <filename>
// FIDELITY: user turns verbatim, played once, ending where the real run ended.
// Opt-in: RUN_LIVE=1 npx vitest run tests/e2e/<case-name>.test.js

export const userTurns = [
  // verbatim, in order, unedited
];

export const stoppedAt = {
  stage: 3,
  questionCount: 17,
  saturationCount: 0,
  routerReason: 'stay',
  summaryFailed: false,
  why: 'stalled — stage-3 slots at 2/2/2, no advance',
};
```

Verbatim means verbatim. Do not fix typos, trim rambling, or normalise punctuation. The model's behaviour on messy input is the thing under test.

## Running

Live scripts are opt-in, like the judge — they cost API calls and depend on model behaviour, so they stay out of the default `npm test`. Gate on an env flag and skip cleanly without it.

## The four canonical cases

1. קניתי בשר לא איכותי — the full case (presenting document, part ו)
2. חבר בא להתייעץ
3. המורה אמר שאני בעייתית
4. חברה אמרה שאין לה זמן

Plus the resistance personas: הנמנע, הבורח, המוצף, הציני, מחפש-העצה.

The acceptance bar is 4/4 golden scripts reaching a sharp close. Until a live script actually reaches one, that bar is unmet — a mock reaching it does not count.

## Privacy

Real runs contain real content. Before a transcript enters `tests/`, strip identifying details of third parties. Testers are told not to enter identifying information; assume some will anyway.
