// The app's version, as the build recorded it (vite.config.js `define`).
//
// Platform knowledge — what the bundler burned in — so it lives with the adapters
// and never in the core (principle 4). Outside a Vite build (a plain Node script)
// the constant does not exist, and the version reads as unknown rather than
// throwing.

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
