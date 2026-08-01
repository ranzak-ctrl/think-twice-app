import { useState } from 'react';
import { requiresPassword, getAppPassword, setAppPassword } from '../adapters/appAuth.js';
import { Mark } from './icons.jsx';

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
        <h1>
          <Mark size={22} />
          Think Twice
        </h1>
        <p>הזן סיסמת גישה כדי להתחיל</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          placeholder="סיסמה"
          aria-label="סיסמה"
        />
        <button type="submit" className="btn btn-primary">
          כניסה
        </button>
      </form>
    </div>
  );
}
