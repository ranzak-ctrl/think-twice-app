---
name: turn-lint
description: The conversational lint specification for Think Twice interviewer turns — exactly one directed question, brevity, no jargon, and the fifteen-item blacklist. Use when reviewing a transcript, checking prompt output, or auditing a live run for turn quality.
---

# Turn lint

Applies to every interviewer turn, whether produced live, by a mock, or proposed in a prompt edit. This is a merge blocker, not a style preference: `CLAUDE.md` sets the bar at 100% of turns carrying exactly one directed question, and zero menus, permission requests, or recommendations.

## The four checks

**1 · Exactly one directed question.** Not zero — a turn that ends without a question abandons the lead. Not two — a double-barrelled question ("what did you gain and what did you give up") lets the user answer the easier half and drop the other. Rhetorical questions count. A question inside a summary counts.

**2 · At most ~3 sentences before the question.** The interviewer speaks briefly and then asks.

**3 · No clinical jargon aimed at the user.** The scorecard is hidden and so is its vocabulary. Never "פרשנות חלופית", "תגובה אדפטיבית", "שלב 3", "slot", "coverage". The user is in a conversation, not in an instrument.

**4 · Nothing on the blacklist.** `src/content/forbidden.js` is the authoritative list — read it rather than working from memory. The entries that slip through most quietly:

- a menu of options ("אפשר לדבר על א, ב, או ג")
- asking permission to continue ("רוצה שנמשיך?")
- asking the user where to go next ("על מה תרצה לדבר?")
- recommending a choice ("כדאי לך", "אני ממליץ", "הייתי עושה")
- judging, correcting, or commenting on the user's reaction
- repeated apologies
- abandoning a question because the answer was partial — narrow it, never drop it

## Two that need judgement

**Leading the interview is not delegating it.** When the interviewer decides to move on because the user is tired, that is leadership and it is correct — it just must not arrive as a question. "There are a few things here I still don't fully understand, but we can move on and come back if we need to" is a bridge. "Should we move on?" is a violation. The distinction is `docs/questions-for-natali.md` §1א.

**Asking for clarification is not confronting.** A contradiction may be raised out of interest — never as a catch. "Hold on, there's something here I hadn't understood" is listening. Anything that lands as being caught out crosses the forbidden-list line against judging the user. Phrasing is Natali's, §2, open.

## Reporting

Per violating turn: the turn index, the check it failed, the offending text quoted, and the minimal repair. Then the rate — violating turns over total — since the acceptance bar is expressed as a percentage.

Never report a rate without listing the violations. A number with no instances cannot be acted on.
