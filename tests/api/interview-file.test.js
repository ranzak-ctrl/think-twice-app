// The interview file: sealed and opened on the server, kept nowhere.
//
// Ran, 10.10.2026: at the end of an interview the whole interview downloads as a
// file encrypted in full, which only this app opens (server/interviewFile.js).
// These tests hold the properties that matter: nothing readable in the file, a
// changed byte refuses to open, every key ever used still opens its files, and
// the function never writes the interview to its log.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { parseKeys, seal, open, FileError, FILE_FORMAT } from '../../server/interviewFile.js';
import handler from '../../api/interview-file.js';

const key = () => randomBytes(32).toString('base64');
const SECRET = 'אני_לא_שווה_כלום_SENTINEL';
const payload = {
  interview: { id: 'think-twice-adult', name: 'Think Twice · אישי', version: 1 },
  history: [{ role: 'user', content: SECRET }],
  state: { gaps: { byTarget: { 'stage2.causal': { note: SECRET } } } },
};

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof FileError ? e.code : `other:${e.message}`;
  }
  return 'no-error';
};

describe('sealing and opening', () => {
  const keys = parseKeys(`k1:${key()}`);

  it('round-trips the interview exactly', () => {
    expect(open(seal(payload, keys), keys)).toEqual(payload);
  });

  it('leaves nothing readable in the file — not the words, not the model', () => {
    const text = JSON.stringify(seal(payload, keys));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('think-twice-adult');
    expect(text).not.toContain('אישי');
    expect(Object.keys(JSON.parse(text))).toEqual(['format', 'v', 'kid', 'iv', 'tag', 'data']);
  });

  it('never seals the same interview to the same bytes', () => {
    expect(seal(payload, keys).data).not.toBe(seal(payload, keys).data);
  });

  it('refuses a file with one changed byte', () => {
    const file = seal(payload, keys);
    const data = Buffer.from(file.data, 'base64');
    data[5] ^= 1;
    expect(codeOf(() => open({ ...file, data: data.toString('base64') }, keys))).toBe('tampered');
  });

  it('refuses a file whose header was changed — the header is authenticated', () => {
    const two = parseKeys(`k1:${key()},k2:${key()}`);
    const file = seal(payload, two);
    expect(codeOf(() => open({ ...file, kid: 'k1' }, two))).toBe('tampered');
  });

  it('refuses a file sealed with a key it does not hold', () => {
    const other = parseKeys(`k1:${key()}`);
    expect(codeOf(() => open(seal(payload, other), keys))).toBe('tampered');
    expect(codeOf(() => open(seal(payload, parseKeys(`k9:${key()}`)), keys))).toBe('unknown-key');
  });

  it('refuses what is not a file', () => {
    for (const v of [null, 'x', {}, { format: 'other' }, { format: FILE_FORMAT, v: 1, kid: 'k1', iv: '!!', tag: 'x', data: 'x' }]) {
      expect(codeOf(() => open(v, keys))).toBe('not-a-file');
    }
  });

  it('says so when a file comes from a newer version of the app', () => {
    expect(codeOf(() => open({ ...seal(payload, keys), v: 2 }, keys))).toBe('newer-file');
  });
});

describe('the keys', () => {
  it('seals with the last key and opens with every one — rotation never strands a file', () => {
    const k1 = key();
    const old = parseKeys(`k1:${k1}`);
    const file = seal(payload, old);
    const rotated = parseKeys(`k1:${k1},k2:${key()}`);
    expect(rotated.current).toBe('k2');
    expect(open(file, rotated)).toEqual(payload);
    expect(seal(payload, rotated).kid).toBe('k2');
  });

  it('refuses a malformed key list rather than dropping an entry in silence', () => {
    for (const raw of ['k1', 'k1:short', `K1:${key()}`, `k1:${key()},k1:${key()}`, `:${key()}`]) {
      expect(codeOf(() => parseKeys(raw))).toBe('bad-keys');
    }
  });

  it('never puts key material in an error', () => {
    const k = key();
    try {
      parseKeys(`k1:${k}x`);
    } catch (e) {
      expect(e.message).not.toContain(k);
    }
  });
});

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

describe('api/interview-file', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const call = async (body, { headers = {}, method = 'POST' } = {}) => {
    const res = fakeRes();
    await handler({ method, headers, body }, res);
    return res;
  };

  it('seals and opens through the function, and logs no word of it', async () => {
    vi.stubEnv('INTERVIEW_FILE_KEYS', `k1:${key()}`);
    vi.stubEnv('APP_PASSWORD', '');
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(String(line)));

    const sealed = await call({ action: 'seal', payload });
    expect(sealed.statusCode).toBe(200);
    expect(sealed.headers['cache-control']).toBe('no-store');
    const opened = await call(JSON.stringify({ action: 'open', file: sealed.body.file }));
    expect(opened.statusCode).toBe(200);
    expect(opened.body.payload).toEqual(payload);

    expect(logged.join('\n')).not.toContain(SECRET);
    expect(logged.join('\n')).not.toContain(sealed.body.file.data);
  });

  it('keeps the same door as the proxy', async () => {
    vi.stubEnv('INTERVIEW_FILE_KEYS', `k1:${key()}`);
    vi.stubEnv('APP_PASSWORD', 'door');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await call({ action: 'seal', payload })).statusCode).toBe(401);
    expect((await call({ action: 'seal', payload }, { headers: { 'x-app-password': 'door' } })).statusCode).toBe(200);
  });

  it('refuses plainly when the deployment has no key, without echoing anything', async () => {
    vi.stubEnv('INTERVIEW_FILE_KEYS', '');
    vi.stubEnv('APP_PASSWORD', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await call({ action: 'seal', payload });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('not-configured');
    expect(res.body.reason).toBe('no-keys');
  });

  it('says when the key is there but malformed — and never echoes it', async () => {
    const bad = 'k1:not-a-real-key';
    vi.stubEnv('INTERVIEW_FILE_KEYS', bad);
    vi.stubEnv('APP_PASSWORD', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await call({ action: 'seal', payload });
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'not-configured', reason: 'malformed-keys' });
    expect(JSON.stringify(res.body)).not.toContain('not-a-real-key');
  });

  it('refuses a tampered file, another method and an unknown action', async () => {
    vi.stubEnv('INTERVIEW_FILE_KEYS', `k1:${key()}`);
    vi.stubEnv('APP_PASSWORD', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { file } = (await call({ action: 'seal', payload })).body;
    expect((await call({ action: 'open', file: { ...file, tag: Buffer.alloc(16).toString('base64') } })).body.error).toBe('tampered');
    expect((await call({}, { method: 'GET' })).statusCode).toBe(405);
    expect((await call({ action: 'delete' })).statusCode).toBe(400);
  });
});

describe('the browser never imports the server side', () => {
  // server/ holds Node-only code and is reached through the function. A browser
  // module that imported it would ship the sealing code — and break the build.
  it('nothing under src/ imports from server/', () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
      );
    const root = new URL('../../src', import.meta.url).pathname;
    for (const f of walk(root).filter((p) => /\.(js|jsx)$/.test(p))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"][./]*server\//);
    }
  });
});
