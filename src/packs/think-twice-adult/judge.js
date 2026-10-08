// Think Twice for adults — the LLM-judge rubric, for the acceptance harness only.
//
// Kept apart from prompts.js on purpose. The rubric scores an interview after it
// is over; nothing in the interview reads it, so it has no business in the bundle
// every tester's browser downloads (router-guard, 8.10.2026: it had started
// shipping there when the texts moved into the pack). Only the harness imports
// this module — tests/helpers/engine.js hands it to the judge as `prompts.judge`.

import judge from '../../content/prompts/judge.md?raw';

export const thinkTwiceAdultJudge = judge;
