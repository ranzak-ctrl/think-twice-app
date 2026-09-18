import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../../api/report.js';

// The report sink's safety property is that it does not echo what it is sent.
// A browser bug or a tampered page could put transcript text into this payload,
// and a verbatim log line would be interview content stored outside the browser
// — the thing principle 6 forbids. The handler rebuilds every field from a
// whitelist, so these tests push content at it and assert none of it survives.

const SECRET = 'קניתי_בשר_לא_איכותי_SENTINEL';

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('api/report — the sink never echoes what it is sent', () => {
  it('drops unknown fields, including a transcript smuggled alongside', async () => {
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(line));
    const res = fakeRes();

    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          stage: 2,
          questionCount: 7,
          history: [{ role: 'user', content: SECRET }],
          state: { note: SECRET },
          app: { bundle: 'index-abc123.js', userAgent: SECRET },
          failures: [{ kind: 'http', status: 400, detail: 'invalid_request_error', raw: SECRET }],
        },
      },
      res
    );

    expect(res.statusCode).toBe(204);
    const line = logged.join('\n');
    expect(line).not.toContain(SECRET);
    expect(line).toContain('invalid_request_error');
    expect(line).toContain('index-abc123.js');
  });

  it('strips prose out of the one free-text field', async () => {
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(line));

    await handler(
      {
        method: 'POST',
        headers: {},
        body: { failures: [{ kind: 'http', detail: `bad input near: ${SECRET}` }] },
      },
      fakeRes()
    );

    expect(logged.join('\n')).not.toContain(SECRET);
  });

  it('caps how many failures one report can carry', async () => {
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(line));

    await handler(
      {
        method: 'POST',
        headers: {},
        body: { failures: Array.from({ length: 500 }, () => ({ kind: 'network' })) },
      },
      fakeRes()
    );

    expect(JSON.parse(logged[0]).failures).toHaveLength(20);
  });

  it('refuses a wrong app password and logs nothing', async () => {
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(line));
    vi.stubEnv('APP_PASSWORD', 'right');
    const res = fakeRes();

    await handler({ method: 'POST', headers: { 'x-app-password': 'wrong' }, body: {} }, res);

    expect(res.statusCode).toBe(401);
    expect(logged).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it('refuses anything but POST', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
