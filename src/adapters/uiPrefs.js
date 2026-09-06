// Per-viewer display preferences — which panels are open, and nothing else.
//
// CLAUDE.md principle 8 permits local persistence, and principle 6 forbids storing
// user content outside the browser. Neither is in tension here: what a person has
// chosen to look at is a fact about this browser, not a word of their interview.
// The same reasoning already covers appAuth's sessionStorage use ("זה לא תוכן
// משתמש"). Nothing in this module may ever be handed anything from the
// StateDocument.
//
// Every access is guarded. localStorage is not merely empty in a private window
// or with site data cleared — in some contexts the accessor itself throws, so a
// bare read would take the whole app down on a browser configured to block
// storage. A preference that cannot be read falls back to the default, which is
// the behaviour someone gets on their first visit anyway.

const KEY = 'tt.ui';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPref(name, fallback) {
  const value = read()[name];
  return typeof value === 'boolean' ? value : fallback;
}

export function setPref(name, value) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: value }));
  } catch {
    // A preference that will not persist is not worth failing a render over: the
    // toggle still works for this visit, it just will not be remembered.
  }
}
