import { useState } from 'react';
import { requiresPassword, getAppPassword, setAppPassword } from '../adapters/appAuth.js';
import { Logo } from './icons.jsx';

// Wraps the app. When VITE_REQUIRE_PASSWORD=1 and no password is stored yet,
// shows a simple access-password prompt (for shared tester deployments).
export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(!requiresPassword() || !!getAppPassword());
  const [pw, setPw] = useState('');

  if (unlocked) return children;

  const submit = (e) => {
    e.preventDefault();
    const v = pw.trim();
    if (!v) return;
    setAppPassword(v);
    setUnlocked(true);
  };

  return (
    <div className="gate" dir="rtl">
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
        <button type="submit" className="btn btn-primary">
          כניסה
        </button>
      </form>
    </div>
  );
}
