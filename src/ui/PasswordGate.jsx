import { useState } from 'react';
import { requiresPassword, getAppPassword, setAppPassword } from '../adapters/appAuth.js';
import { APP_VERSION } from '../adapters/appVersion.js';
import { Logo } from './icons.jsx';

// Wraps the app and asks for the shared access password.
//
// THE SERVER DECIDES WHETHER THE DOOR IS LOCKED, not a build-time flag. This used
// to hang entirely on VITE_REQUIRE_PASSWORD, and that broke a live preview in a
// way nobody could see from the outside: the variable was stored as a Vercel
// SECRET, secrets are not exposed to the build, so Vite inlined nothing, the gate
// never rendered, no password was ever stored, the client sent no
// `x-app-password`, and the proxy — which DID have APP_PASSWORD — answered 401 on
// every turn. The person saw "model error" on a door that was merely locked.
//
// So the flag now only decides whether to ask UP FRONT, which is nicer when it is
// there and harmless when it is not. The real trigger is a 401 from the proxy:
// model.js turns that into `unauthorized`, App re-opens this gate, and the next
// call carries the password. An environment that forgets the flag still works.
export default function PasswordGate({ children, locked, onUnlock }) {
  const [unlocked, setUnlocked] = useState(!requiresPassword() || !!getAppPassword());
  const [pw, setPw] = useState('');

  // `locked` is the server having just refused; it reopens the gate over a
  // session that thought it was already through.
  if (unlocked && !locked) return children;

  const submit = (e) => {
    e.preventDefault();
    const v = pw.trim();
    if (!v) return;
    setAppPassword(v);
    setUnlocked(true);
    setPw('');
    onUnlock?.();
  };

  const gate = (
    <div className={`gate${unlocked ? ' is-over' : ''}`} dir="rtl">
      <form onSubmit={submit}>
        {/* The gate is the first thing anyone sees, so it carries the whole
            lockup in the board's own stacked composition rather than a heading
            that happens to say the product's name. The h1 is only a wrapper —
            the mark and the wordmark are .brand, the same component the header
            renders, so the two screens cannot drift apart. */}
        <h1>
          <span className="brand is-stacked">
            <Logo stacked />
          </span>
        </h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          placeholder="סיסמה"
          aria-label="סיסמת גישה"
        />
        {locked && <p className="gate-note">הסיסמה לא התקבלה. נסה שוב.</p>}
        <button type="submit" className="btn btn-primary">
          כניסה
        </button>
        {/* Ran, 24.10.2026: a number on every QA build, so whoever opens the link
            can say which one is live, and a rollback has a name to go back to.
            Outside a Vite build the version is unknown and the line is omitted. */}
        {APP_VERSION !== 'unknown' && <p className="gate-version">גרסה {APP_VERSION}</p>}
      </form>
    </div>
  );

  // Refused mid-interview: the gate covers the app, it does not replace it. The
  // interview lives only in this tab's memory (principle 8), so unmounting the
  // app here would erase it — on a door that only needed the password again.
  if (unlocked) {
    return (
      <>
        {children}
        {gate}
      </>
    );
  }
  return gate;
}
