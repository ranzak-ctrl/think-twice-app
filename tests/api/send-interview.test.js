// Mailing the interview file (Ran, 14.10.2026) — api/send-interview.js and
// server/mail.js, with Resend stubbed. What must hold:
//   - only a real file of this deployment, of a known model, is ever mailed;
//   - the mail is fixed text: the model name comes from the server's list, never
//     from the request, and no word of the interview is in it;
//   - one mail per recipient, two at most; addresses never reach the log;
//   - the browser side passes results and failures through.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { parseKeys, seal } from '../../server/interviewFile.js';
import { buildMail, normalizeAddress, safeFileName, MODEL_NAMES } from '../../server/mail.js';
import handler from '../../api/send-interview.js';
import { thinkTwiceAdult } from '../../src/packs/think-twice-adult/pack.js';
import { sendInterviewMail, mailAvailable } from '../../src/adapters/interviewMail.js';

const KEYS = `k1:${randomBytes(32).toString('base64')}`;
const SECRET = 'אני_לא_שווה_כלום_SENTINEL';
const SELF = 'ran.test+self@example.com';
const OTHER = 'therapist.test@example.com';
const payloadOf = (interview) => ({ interview, history: [{ role: 'user', content: SECRET }], state: { gaps: SECRET } });
const sealed = (interview = { id: thinkTwiceAdult.id, name: thinkTwiceAdult.name, version: 1 }) =>
  seal(payloadOf(interview), parseKeys(KEYS));

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

function resend(status = 200) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => ({ id: 'x' }) };
  };
  return { fetchImpl, sent };
}

const configure = () => {
  vi.stubEnv('INTERVIEW_FILE_KEYS', KEYS);
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('MAIL_FROM', 'Think Twice <onboarding@resend.dev>');
  vi.stubEnv('APP_PASSWORD', '');
};

const call = async (body, { method = 'POST', headers = { host: 'tt.example.app' }, fetchImpl } = {}) => {
  const res = fakeRes();
  await handler({ method, headers, body }, res, { fetchImpl });
  return res;
};

describe('api/send-interview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('says whether this deployment can send mail', async () => {
    vi.stubEnv('APP_PASSWORD', '');
    vi.stubEnv('RESEND_API_KEY', '');
    expect((await call(null, { method: 'GET' })).body.available).toBe(false);
    configure();
    expect((await call(null, { method: 'GET' })).body.available).toBe(true);
  });

  it('refuses plainly when mail is not set up', async () => {
    vi.stubEnv('APP_PASSWORD', '');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await call({ file: sealed(), self: SELF });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('mail-not-configured');
  });

  it('keeps the same door as the other functions', async () => {
    configure();
    vi.stubEnv('APP_PASSWORD', 'door');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await call({ file: sealed(), self: SELF })).statusCode).toBe(401);
  });

  it('mails each recipient alone: the file attached, fixed text, the model named, no word of the interview', async () => {
    configure();
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((l) => logged.push(String(l)));
    const file = sealed();
    const { fetchImpl, sent } = resend();
    const res = await call({ file, self: ` ${SELF.toUpperCase()} `, other: OTHER, fileName: 'think-twice-2026-10-14-2245.thinktwice' }, { fetchImpl });

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toEqual({ self: 'sent', other: 'sent' });
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.body.to)).toEqual([[SELF], [OTHER]]);
    for (const m of sent) {
      expect(m.url).toBe('https://api.resend.com/emails');
      expect(m.init.headers.Authorization).toBe('Bearer re_test_key');
      expect(m.body.subject).toContain(thinkTwiceAdult.name);
      expect(m.body.html).toContain('https://tt.example.app');
      expect(JSON.stringify(m.body)).not.toContain(SECRET);
      const [att] = m.body.attachments;
      expect(att.filename).toBe('think-twice-2026-10-14-2245.thinktwice');
      expect(JSON.parse(Buffer.from(att.content, 'base64').toString('utf8'))).toEqual(file);
    }
    // The therapist's mail says who shared it — by the address the person typed.
    expect(sent[1].body.text).toContain(SELF);
    expect(sent[0].body.subject).toContain('שלך');

    const log = logged.join('\n');
    expect(log).not.toContain(SELF);
    expect(log).not.toContain(OTHER);
    expect(log).not.toContain(SECRET);
  });

  it('names the model from its own list — a request cannot put its words into a mail', async () => {
    configure();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fetchImpl, sent } = resend();
    await call({ file: sealed({ id: thinkTwiceAdult.id, name: 'קנו עכשיו בהנחה', version: 1 }), self: SELF }, { fetchImpl });
    expect(sent[0].body.subject).not.toContain('קנו עכשיו');
    expect(sent[0].body.subject).toContain(MODEL_NAMES[thinkTwiceAdult.id]);

    const res = await call({ file: sealed({ id: 'something-else', name: 'x', version: 1 }), self: SELF }, { fetchImpl });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('unknown-interview');
  });

  it('mails only a real file of this deployment', async () => {
    configure();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fetchImpl, sent } = resend();
    const file = sealed();
    const bad = await call({ file: { ...file, tag: Buffer.alloc(16).toString('base64') }, self: SELF }, { fetchImpl });
    expect(bad.body.error).toBe('tampered');
    const foreign = seal(payloadOf({ id: thinkTwiceAdult.id }), parseKeys(`k1:${randomBytes(32).toString('base64')}`));
    expect((await call({ file: foreign, self: SELF }, { fetchImpl })).body.error).toBe('tampered');
    expect((await call({ file: { anything: 1 }, self: SELF }, { fetchImpl })).body.error).toBe('not-a-file');
    expect(sent).toHaveLength(0);
  });

  it('wants at least one good address, and sends a repeated one once', async () => {
    configure();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fetchImpl, sent } = resend();
    expect((await call({ file: sealed() }, { fetchImpl })).body.error).toBe('no-address');
    expect((await call({ file: sealed(), self: 'not an address' }, { fetchImpl })).body.error).toBe('bad-address');
    expect((await call({ file: sealed(), self: SELF, other: 'a@b' }, { fetchImpl })).body.error).toBe('bad-address');
    const res = await call({ file: sealed(), self: SELF, other: SELF }, { fetchImpl });
    expect(res.body.results).toEqual({ self: 'sent' });
    expect(sent).toHaveLength(1);
  });

  it('says why a mail did not go — a test account sends only to its owner', async () => {
    configure();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await call({ file: sealed(), other: OTHER }, resend(403));
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ error: 'mail-restricted', results: { other: 'mail-restricted' } });
  });
});

describe('server/mail.js', () => {
  it('normalises addresses and refuses what is not one', () => {
    expect(normalizeAddress('  A@B.co ')).toBe('a@b.co');
    for (const bad of ['', 'a@b', 'a b@c.com', '<a@b.com>', 'a@b.com, c@d.com', 7, null]) {
      expect(normalizeAddress(bad)).toBeNull();
    }
  });

  it('names the attachment only by the app\'s own pattern', () => {
    expect(safeFileName('think-twice-2026-10-14-2245.thinktwice')).toBe('think-twice-2026-10-14-2245.thinktwice');
    expect(safeFileName('../../evil.exe')).toBe('think-twice.thinktwice');
  });

  it('writes Hebrew, right to left, with the link and the warning not to edit', () => {
    const m = buildMail({ modelName: 'Think Twice · אישי', to: 'self', appUrl: 'https://x.app' });
    expect(m.html).toContain('dir="rtl"');
    expect(m.text).toContain('אל תפתח את הקובץ לעריכה');
    expect(m.text).toContain('https://x.app');
    const o = buildMail({ modelName: 'Think Twice · אישי', to: 'other', appUrl: 'https://x.app' });
    expect(o.text).toContain('ביוזמת המשתמש');
  });
});

describe('src/adapters/interviewMail.js', () => {
  afterEach(() => vi.unstubAllGlobals());
  const noPassword = () =>
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

  it('asks whether mail is available, and treats any failure as no', async () => {
    noPassword();
    const ok = async () => ({ ok: true, status: 200, json: async () => ({ available: true }) });
    expect(await mailAvailable({ fetchImpl: ok })).toBe(true);
    expect(await mailAvailable({ fetchImpl: async () => { throw new Error('offline'); } })).toBe(false);
  });

  it('sends the sealed file with the addresses, and passes per-recipient results back', async () => {
    noPassword();
    let body;
    const fetchImpl = async (url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ results: { self: 'sent' } }) };
    };
    const out = await sendInterviewMail({ file: { format: 'x' }, self: SELF, other: '', fileName: 'f' }, { fetchImpl });
    expect(out).toEqual({ ok: true, results: { self: 'sent' } });
    expect(body).toEqual({ file: { format: 'x' }, self: SELF, fileName: 'f' });

    const failed = async () => ({ ok: false, status: 502, json: async () => ({ error: 'mail-restricted', results: { other: 'mail-restricted' } }) });
    expect(await sendInterviewMail({ file: {}, other: OTHER }, { fetchImpl: failed })).toEqual({
      ok: false,
      error: 'mail-restricted',
      results: { other: 'mail-restricted' },
    });
  });
});
