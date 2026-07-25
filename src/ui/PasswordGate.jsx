import React, { useState } from 'react';
import { requiresPassword, getAppPassword, setAppPassword } from '../adapters/appAuth.js';

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
    <div dir="rtl" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f1115', fontFamily: '"Segoe UI", Arial, system-ui, sans-serif',
    }}>
      <form onSubmit={submit} style={{
        background: '#171a21', border: '1px solid #2c323d', borderRadius: 14,
        padding: '28px 26px', width: 320, textAlign: 'center', color: '#e7eaf0',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>🧠 Think Twice</div>
        <div style={{ color: '#9aa4b2', fontSize: 13, marginBottom: 18 }}>הזן סיסמת גישה כדי להתחיל</div>
        <input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
          placeholder="סיסמה"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #2c323d',
            background: '#0f1115', color: '#e7eaf0', fontSize: 14, marginBottom: 12, textAlign: 'center',
          }}
        />
        <button type="submit" style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          background: '#7ca7ff', color: '#0b0e14', fontSize: 14, fontWeight: 800, cursor: 'pointer',
        }}>כניסה</button>
      </form>
    </div>
  );
}
