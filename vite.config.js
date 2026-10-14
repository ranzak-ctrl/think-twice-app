import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// The app's version, from package.json, burned into the bundle so an export and an
// error report can say which version produced them (Ran, 9.10.2026).
//
// DELIBERATELY NOTHING THAT VARIES BETWEEN BUILDS OF THE SAME COMMIT — no build
// time, no git hash. /ship-check gate 6 proves the deployed configuration by
// building the same commit locally and comparing the bundle's file name, which is
// a hash of its contents; a timestamp would make every build's name different and
// the gate would fail on every release. The bundle name itself, read at runtime
// (App.jsx bundleName), is what pins the exact build.
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// The dev server stands in for the interview-file function too
// (api/interview-file.js), which seals and opens the downloaded interview. It
// runs the same handler in the Vite process. Its key comes from
// INTERVIEW_FILE_KEYS in .env, never VITE_-prefixed; without one, a throwaway key
// is made for this run, and the files sealed with it will not open after a
// restart. Nothing here reaches the bundle.
function interviewFileDev(env) {
  return {
    name: 'interview-file-dev',
    configureServer(server) {
      if (!env.INTERVIEW_FILE_KEYS && !process.env.INTERVIEW_FILE_KEYS) {
        process.env.INTERVIEW_FILE_KEYS = `dev:${randomBytes(32).toString('base64')}`;
        console.warn(
          '\n[dev-file] INTERVIEW_FILE_KEYS is not set — using a throwaway key for this run.\n' +
            '           Interview files sealed now will not open after a restart.\n'
        );
      } else if (env.INTERVIEW_FILE_KEYS) {
        process.env.INTERVIEW_FILE_KEYS = env.INTERVIEW_FILE_KEYS;
      }
      for (const k of ['RESEND_API_KEY', 'MAIL_FROM']) if (env[k]) process.env[k] = env[k];
      // The same two functions Vercel runs: sealing and opening the file, and
      // mailing it (which answers "not available" without RESEND_API_KEY and
      // MAIL_FROM in .env — never VITE_-prefixed).
      for (const name of ['interview-file', 'send-interview']) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          req.body = Buffer.concat(chunks).toString('utf8');
          // The Vercel response helpers the handler uses.
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(obj));
          };
          const { default: handler } = await import(`./api/${name}.js`);
          await handler(req, res);
        });
      }
    },
  };
}

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
    plugins: [react(), interviewFileDev(env)],
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
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
            // Vite's proxy forwards the browser's request headers verbatim,
            // Origin and Referer included. Anthropic reads those as a direct
            // browser call and rejects it:
            //   "CORS requests must set 'anthropic-dangerous-direct-browser-access'"
            //
            // Setting that header would be the wrong fix. It exists to permit
            // calling the API straight from a browser holding a key — the exact
            // arrangement removed in 96ec371. This request is not a browser
            // call: it originates in the Vite dev server, in Node, and the key
            // is attached here. Stripping the two headers makes the request
            // look like what it actually is.
            //
            // The deployed function (api/anthropic/v1/messages.js) never had
            // this problem: it builds a fresh fetch with an explicit header
            // object, so nothing from the browser is carried over. This keeps
            // dev matching production rather than diverging from it.
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });

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
