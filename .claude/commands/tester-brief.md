---
description: "Generate the Hebrew one-page brief handed to a tester along with the link and password"
argument-hint: "[tester name]"
allowed-tools: Read, Write, Glob
---

Produce the one-page Hebrew brief a tester receives with the link. Write it to `docs/tester-brief.md`, and adapt the tone if `$ARGUMENTS` names a specific tester — Natali is validating clinically and needs the guide-mode section; a general tester does not.

Everything the tester reads is Hebrew, RTL, and free of implementation vocabulary. They are not being asked to test software; they are being asked to run an interview and say how it felt.

## Sections

**מה זה** — two sentences. A semi-structured therapeutic interview, seven stages, from a turbulent event to a sharp decision. A prototype, not a product.

**איך נכנסים** — the link, the password, that it runs in a browser with nothing to install.

**מה עושים** — bring one real or imagined event and answer as it comes. Do not try to help the tool along, and do not correct it mid-run: where it gets stuck is the finding.

**אזהרת פרטיות** — prominent, not a footnote. A prototype under test: no identifying details, yours or anyone else's. Nothing is stored on a server, but transcripts sit in the browser until exported.

**גבולות הכלי** — it does not diagnose and does not treat. If something heavy comes up, the tool will stop the interview and point to help, and that is the correct behaviour rather than a bug.

**איך מסיימים** — press ייצוא, save the file, send it to Ran. Explain that the export is the whole test result and an unexported run is lost.

**מה מדווחים** — where it felt like it was listening, where it did not; where a question felt off; where it got stuck or repeated itself; whether it reached a decision that felt like the tester's own.

**מצב מדריך** — for Natali only: how to open the panel, and that it shows the live scorecard, routing decisions, and metrics behind the conversation.

Keep it to one page. A tester who has to study a manual will run the interview differently than a real user would, which contaminates exactly what is being measured.
