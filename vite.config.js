import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server stands in for the serverless proxy.
//
// `npm run dev` runs Vite only — api/anthropic/v1/messages.js never executes,
// because that is a Vercel function. Without this the browser's key-less
// request reaches Anthropic unauthenticated and 401s, which is why local live
// mode did not work.
//
// So the dev proxy does what the function does: inject the key. This runs in
// the Vite process (Node), never in the browser — the key is read from
// ANTHROPIC_API_KEY, deliberately WITHOUT a VITE_ prefix, so Vite will not
// inline it into the bundle. That is the iron rule from CLAUDE.md, and it is
// what makes this safe: the value exists only in the dev server's memory.
//
// Do not rename it to VITE_ANTHROPIC_API_KEY to "make it work" — that is the
// exact bug fixed in 96ec371, and it would put the key back in the bundle.
//
// For full-stack fidelity — exercising the real function, the APP_PASSWORD
// gate, and the deployed request path — use `vercel dev` instead. This proxy
// is for fast UI iteration with a live model.
export default defineConfig(({ mode }) => {
  // Empty prefix so non-VITE_ vars load too. Used only here, on the server
  // side; nothing from this object is passed to `define`.
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          headers: {
            'anthropic-version': '2023-06-01',
            ...(apiKey ? { 'x-api-key': apiKey } : {}),
          },
          configure(proxy) {
            if (!apiKey) {
              // Fail loudly at startup rather than as a puzzling 401 mid-turn.
              console.warn(
                '\n[dev-proxy] ANTHROPIC_API_KEY is not set — live calls will 401.\n' +
                  '            Add it to .env (no VITE_ prefix) and restart.\n'
              );
            }
            proxy.on('error', (err) => {
              console.error('[dev-proxy] upstream error:', err.message);
            });
          },
        },
      },
    },
    test: {
      environment: 'node',
    },
  };
});
