// Shared-password gate (client side). The password is NOT a secret key — it
// only gates access to the deployed proxy so a leaked URL can't burn credits.
// Stored per-tab in sessionStorage; sent as `x-app-password` on each API call.

const KEY = 'tt_app_pw';

export const requiresPassword = () => import.meta.env.VITE_REQUIRE_PASSWORD === '1';

export const getAppPassword = () => {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
};

export const setAppPassword = (v) => {
  try { sessionStorage.setItem(KEY, v); } catch { /* ignore */ }
};

export const clearAppPassword = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
};
