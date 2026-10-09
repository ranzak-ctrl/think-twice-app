---
description: Export the latest Think Twice conversation transcript to Google Drive as a Word (.docx) document
---

Export the most recent Think Twice interview transcript to Google Drive as a `.docx`. Work through these steps; do not skip the verification.

## 1. Locate the export file
Glob `~/Downloads/think-twice-session-*.json` and pick the **most recently modified** match. This file is produced by the app's "ייצא" button and has the shape `{ interview, app, exportedAt, history, state, … }`.

- If no match exists: tell the user to click **"ייצא"** in the app first (it now exports the full transcript), then stop.

## 2. Parse it
Read the JSON.
- `interview` — which interview model this run was: `{ id, name, version }`. Absent in exports from before 9.10.2026; those are all Think Twice for adults.
- `app` — which version of the app produced it: `{ version, bundle }` (`bundle` is the build's file name, the exact build).
- `history` — the transcript: an array of `{ role, content }`, where `role` is `assistant` (the interviewer) or `user` (the interviewee).
- `state` — the StateDocument: `meta` (currentStage, kpi, …), `decision`, `board`, `coverage`.

## 3. Build a Hebrew, right-to-left `.docx` (use the `anthropic-skills:docx` skill)
Structure:
- **First line, before anything else** (Ran, 9.10.2026 — the first thing on the page says which interview and which app version): `מודל ראיון: <interview.name> (<interview.id>, גרסה <interview.version>) · גרסת אפליקציה: <app.version> (<app.bundle>)`. For an export without the header: `מודל ראיון: לא נרשם (ייצוא מלפני 9.10.2026 — Think Twice למבוגרים) · גרסת אפליקציה: לא נרשמה`.
- **Title:** `Think Twice — תמלול שיחה`
- **Sub-line:** export date (from `exportedAt`) + שלב שהגיע: `state.meta.currentStage` מתוך מספר השלבים של המודל (7 ב-Think Twice למבוגרים).
- **Transcript** (in order): label each `assistant` turn **מראיין:** and each `user` turn **משתמש:**, with the message text after the label. Every paragraph right-to-left.
- **לוח ההכרעה** — only if `state.board` is non-empty: a 3-column table (אפשרות | יתרון | חיסרון) from the board rows.
- **סיכום** appendix: סוג הכרעה (`state.meta.kpi.decisionType`) and the decision package (`state.decision`) if present.
- Filename: `think-twice-transcript-<YYYY-MM-DD-HHmm from exportedAt>.docx`.

Keep all labels and content in Hebrew.

## 4. Upload to Google Drive
Use the Google Drive connector (its tools are deferred — load them with ToolSearch, e.g. query `drive create_file search_files`).
- Find the **"Think Twice"** folder (search by name). Under it, find or **create** a **"Transcripts"** subfolder.
- Upload the `.docx` into `Think Twice/Transcripts`.
- If the Drive connector isn't authenticated/available, report that clearly and stop (don't silently fail).

## 5. Report back
Return: the Drive link to the uploaded file, the filename, and how many turns were exported.

## Rules
- Do **not** modify or delete the source export file.
- Content is Hebrew — keep the document Hebrew throughout.
- Pick exactly one source file (the newest); if the user names a specific session file, use that instead.
