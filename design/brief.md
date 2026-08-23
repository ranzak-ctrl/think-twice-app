# Think Twice — Clinical Design Brief

> Source of truth for anyone (human or model) designing this interface.
> Derived from `docs/principle-zero.md`, `docs/presenting-document.md` (parts ב.2/ב.3),
> and the five resistance personas in `docs/dev-plan.md`.
> **Read this before changing a single pixel.**

---

## 0. What this product is — and what it is not

**זה לא צ'אט. זה ראיון.**

In an ordinary AI chat the user steers and the AI responds. Here the contract is
inverted from the first second: the user hands the interviewer responsibility for
the conversation, for the duration of the interview. Think Twice is
**המבוגר האחראי על השיח** — the adult in charge of the conversation.

This is not a styling preference. Self-managing a multi-stage process **is the
impairment** (executive function). An interface that puts navigation back on the
user reproduces the disability. The design's job is to be an external executive
function, not a menu.

The user keeps, always and non-transferably: what happened, what they will do,
the honesty of what they share, **the decision, and carrying it out**.

---

## 1. Who is on the other side, at the moment they open this

They have just been through something stormy. Assume all five at once:

| State | What it means for the screen |
|---|---|
| **הצפה** — high-intensity emotion, racing thoughts, live impulsivity | The screen must be quiet. Competing motion, density or colour reads as more noise on top of noise. |
| **בלבול נרטיבי** — the story is not a story yet, it is a pile of moments with no timeline | Nothing on screen may demand that they organise anything. Ordering is the interviewer's job. |
| **המוגלה כבר פועלת** — the damaged self-image is already switched on ("שוב אני…", "תמיד אני…") | No element may read as a scorecard of them. |
| **קשב פנימי גובר** — absorbed in their own injury; the other person in the story is nearly invisible | Do not add anything that competes for the small amount of attention available. |
| **דריכות לשיפוטיות** — years of criticism produced high rejection sensitivity (RSD) | **Anything that smells of criticism triggers defensiveness or abandonment.** This is the single sharpest constraint on this UI. |

### What they ask for vs. what they get

They explicitly ask to be heard, to be taken sides with, and often for a ruling:
*"נכון שהוא מניאק?"*, *"תגיד לי מה לעשות"*.

What the tool gives instead: real listening, order in the story, a clear mirror,
and at the end — a decision that is theirs. The gap is a delicate clinical
moment. The interface must not undercut it by looking like a tool that is about
to rule, advise, or grade.

---

## 2. The forbidden list — translated from prompts into pixels

`docs/principle-zero.md` §5 forbids these at the language level. Their UI
equivalents are forbidden too. **Adding any of these breaks the clinical
protocol, no matter how good it looks:**

- ❌ **Option menus / quick-reply chips / suggested answers.** The interviewer asks one directed question; the user answers in their own words.
- ❌ **"רוצה שנמשיך?" / "מה תרצה לעשות?"** in any form — buttons, prompts, modals.
- ❌ **Stage navigation.** No sidebar of stages, no back/next, no skip, no clickable progress. The Router owns every transition. A stage indicator may *inform*; it may never be interactive.
- ❌ **Recommendations.** Nothing may highlight, rank, star, pre-select or otherwise nudge one option over another — most critically on the stage-7 decision board.
- ❌ **Gamification.** No streaks, badges, confetti, celebration animation, completion percentages framed as a task to finish.
- ❌ **Evaluation of the user's own input.** No red validation on what they wrote, no "answer too short", no character counters, no completeness meters on their answers.
- ❌ **Time or progress pressure.** No timers, no "2 minutes left", no "you're 40% done".
- ❌ **Emoji reactions, avatars of the user, playful microcopy.** The cynic persona reads cuteness as condescension.

### The only two decision points in the entire interview

1. **Confirming a summary** at the end of a topic.
2. **The decision itself, in stage 7.**

That is the complete list. If a new control appears anywhere, it is a bug.

---

## 3. The five resistance personas — how the screen must behave

The interview is designed to meet resistance. The UI must not work against the
protocol's response to each:

- **הנמנע** (one-word answers, "לא יודע"). The protocol *widens* the question rather than narrowing it. → The composer must never imply a required length. No counters, no "tell us more" nudges. A one-word answer must look completely acceptable on screen.
- **הבורח** (associative drift to other topics). The protocol narrows to closed, decisive questions. → Nothing on screen may invite tangents — no related topics, no suggestions, no links out.
- **המוצף** (flooded). The protocol suspends the agenda and regulates. → This is the *entry* state, not an edge case. The default screen must already be calm enough to hold someone in it.
- **הציני** (aggression toward the system). The protocol is non-defensive and keeps leading. → Chrome must be plain and unembarrassed. No apologising tone, no mascot, no jokes.
- **מחפש-העצה** ("מה אתה היית עושה?"). The protocol returns to process without advising. → Nothing may look like the system is preparing a recommendation.

---

## 4. What is locked, and what you may design

### Locked — do not touch

- **Structure and information architecture.** Clinically determined.
- **The two decision points.** No additions, no removals.
- **All Hebrew interview copy.** Prompts are content under `src/content/prompts/`, owned by the `prompt-editor` agent and validated with Natali. Treat every Hebrew sentence in the transcript as fixed.
- **RTL.** Hebrew is the first-class direction, not a translation layer. Every rule in `styles.css` uses logical properties (`padding-inline`, `border-start-start-radius`) so nothing needs manual mirroring — keep it that way.
- **The safety stop.** Its copy and its calm, containing treatment are clinically reviewed.
- **One question per turn.** The screen must never present two asks at once.

### Open — this is the actual design work

- Colour, and specifically **whether this palette feels containing or clinical**.
- Typography, Hebrew type choice, line length, line height at 15px.
- Density and breathing room — how much air a flooded reader needs.
- ~~Bubble treatment: the assistant's weight vs. the user's, and whether the current dark user bubble feels like *their own voice* or like being quoted back at them.~~ **Answered 23.8.2026:** the dark bubble is gone. The person's answer is unframed text on the page, on the start edge, directly under the question it answers — the two voices are told apart by card-versus-no-card, not by which wall each is pinned to. Pushing the answer to the far side made the page read as two strangers messaging, and in an RTL page the left is the *other* party's side; the person is not the other party here.
- Motion: currently minimal by design. Does anything need to be *softer*, not busier?
- The felt quality of the two decision moments — they should feel like being handed the pen, not like a form to submit.
- The decision board: how to show options with genuinely equal visual weight.

---

## 5. Two audiences, one app

- **The chat surface** — for the user, mid-storm. Everything above applies.
- **The guide panel** (`מצב מדריך`) — for **Natali and testers**, not the user. It is a clinician's instrument: dense, information-rich, technical. It may look completely different from the chat, and it should not be softened. Judge it by legibility, not warmth.

---

## 6. The question this design pass has to answer

> Does this feel **containing and safe** to an adult with ADHD in a stormy
> moment — someone whose self-image is already activated against them, and who
> will read the faintest hint of criticism as one more person telling them they
> failed?

Everything else is secondary to that.
