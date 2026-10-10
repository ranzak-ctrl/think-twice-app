# Interview files, frozen

One file per interview model, per model version and per file format that has
ever shipped: `<pack id>.v<version>.format<format>.json`. Each is the plaintext
payload a person's encrypted interview file carries (`buildInterviewFile`,
src/ui/sessionExport.js), as that version of the app wrote it.

`tests/ui/interview-file.test.js` loads every one of them into the current app
and fails if any stops loading. A person's file must open in every later version
(Ran, 10.10.2026), and these files are how that is held.

- **Never edit one.** It is what an old version wrote. If the current app no
  longer reads it, write the migration step (src/packs/<id>/migrations.js, or
  FORMAT_MIGRATIONS) — do not change the file.
- **Add one with every bump** of a pack's `version` or of `SESSION_FORMAT`,
  written by the app at the new version.
- **Synthetic only.** Made from the adapter's mock replies and invented answers.
  A real person's interview never enters the repo (CLAUDE.md, "אסור").
