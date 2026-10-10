// A person's interview file — backward compatible, always (Ran, 10.10.2026).
//
// The encrypted file a person downloads is the thread between sessions on the
// same event, and only they keep it, so it must open in every later version of
// the app (docs/interview-platform-plan.md 2ב, stage 4.7). Three things hold that:
//
//   1. upgradeSession runs the steps from the file's version up to this one,
//      refuses what it cannot understand, and says why;
//   2. no shipped version is left without a step — for every pack and for the
//      file format itself;
//   3. a frozen file from every shipped version still loads
//      (tests/fixtures/interview-files).
//
// And the browser side of sealing (src/adapters/interviewFile.js), with the
// function stubbed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
  upgradeSession,
  buildInterviewFile,
  interviewHeader,
  SESSION_FORMAT,
  FORMAT_MIGRATIONS,
} from '../../src/ui/sessionExport.js';
import { importState, createState } from '../../src/core/state.js';
import { thinkTwiceAdult as pack } from '../../src/packs/think-twice-adult/pack.js';
import { interview, interviewMigrations } from '../../src/ui/interview.js';
import {
  sealInterview,
  openInterviewFile,
  isSealedFile,
  interviewFileName,
  FILE_FORMAT,
  FILE_EXTENSION,
} from '../../src/adapters/interviewFile.js';
import { FILE_FORMAT as SERVER_FILE_FORMAT } from '../../server/interviewFile.js';

const fileAt = (version, extra = {}) => ({
  interview: { id: pack.id, name: pack.name, version },
  app: { version: '1.0.0', bundle: null },
  format: SESSION_FORMAT,
  exportedAt: '2026-10-10T12:00:00.000Z',
  history: [{ role: 'assistant', content: 'אז ספר לי — מה קרה?' }],
  state: createState(),
  revisions: [],
  ...extra,
});

describe('upgradeSession — refuses what it cannot understand', () => {
  it('loads a file of this interview at this version untouched', () => {
    const f = fileAt(pack.version);
    expect(upgradeSession(f, pack, interviewMigrations)).toEqual({ ok: true, session: f, upgraded: false });
  });

  it('refuses a file with no header, or no format', () => {
    expect(upgradeSession({ history: [] }, pack).reason).toBe('no-header');
    const { format: _gone, ...noFormat } = fileAt(pack.version);
    expect(upgradeSession(noFormat, pack).reason).toBe('no-header');
    expect(upgradeSession(fileAt(0), pack).reason).toBe('no-header');
  });

  it('refuses another interview model, and names it', () => {
    const f = fileAt(1, { interview: { id: 'think-twice-parent', name: 'Think Twice · הורים', version: 1 } });
    expect(upgradeSession(f, pack)).toEqual({ ok: false, reason: 'other-interview', name: 'Think Twice · הורים' });
  });

  it('refuses a file from a newer app — a later format or a later version of the interview', () => {
    expect(upgradeSession(fileAt(pack.version, { format: SESSION_FORMAT + 1 }), pack).reason).toBe('newer-file');
    expect(upgradeSession(fileAt(pack.version + 1), pack)).toEqual({
      ok: false,
      reason: 'newer-version',
      from: pack.version + 1,
      current: pack.version,
    });
  });

  it('refuses a version it has no step from, rather than loading it half-understood', () => {
    const at3 = { ...pack, version: 3 };
    expect(upgradeSession(fileAt(1), at3, { 1: (s) => s })).toEqual({
      ok: false,
      reason: 'no-migration',
      what: 'interview',
      from: 2,
    });
  });
});

describe('upgradeSession — runs every step, in order', () => {
  it('walks a version-1 file up to version 3, one step at a time, and advances the header', () => {
    const at3 = { ...pack, name: 'השם בגרסה 3', version: 3 };
    const seen = [];
    const steps = {
      1: (s) => (seen.push(s.interview.version), { ...s, state: { ...s.state, renamed: 'by-1' } }),
      2: (s) => (seen.push(s.interview.version), { ...s, state: { ...s.state, after: s.state.renamed } }),
    };
    const out = upgradeSession(fileAt(1), at3, steps);
    expect(out.ok).toBe(true);
    expect(out.upgraded).toBe(true);
    expect(seen).toEqual([1, 2]);
    expect(out.session.state.after).toBe('by-1');
    expect(out.session.interview).toEqual(interviewHeader(at3));
  });

  it('upgrades the file format first, then the interview — each with its own chain', () => {
    const order = [];
    const formatMigrations = {
      1: (s) => (order.push('format 1→2'), { ...s, history: s.history.map((m) => ({ ...m, kind: 'turn' })) }),
    };
    const at2 = { ...pack, version: 2 };
    const steps = { 1: (s) => (order.push('interview 1→2'), s) };
    const out = upgradeSession(fileAt(1, { format: 1 }), at2, steps, { format: 2, formatMigrations });
    expect(out.ok).toBe(true);
    expect(order).toEqual(['format 1→2', 'interview 1→2']);
    expect(out.session.format).toBe(2);
    expect(out.session.history[0].kind).toBe('turn');
  });

  it('refuses a format it has no step from', () => {
    expect(upgradeSession(fileAt(1, { format: 1 }), pack, {}, { format: 2, formatMigrations: {} })).toEqual({
      ok: false,
      reason: 'no-migration',
      what: 'format',
      from: 1,
    });
  });

  it('never changes the file it was given', () => {
    const f = fileAt(1);
    const before = JSON.stringify(f);
    upgradeSession(f, { ...pack, version: 2 }, { 1: (s) => ({ ...s, state: { ...s.state, x: 1 } }) });
    expect(JSON.stringify(f)).toBe(before);
  });
});

// ── No shipped version without a step ──
//
// Every bump of a pack's `version`, and of SESSION_FORMAT, must ship its step. A
// missing one would refuse every person's file from that version — a bug that
// must not reach them. So the test reads every pack in src/packs.

const packsDir = new URL('../../src/packs/', import.meta.url);
const packDirs = readdirSync(packsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

// The one export that is a pack (has id and version), and the one that is its
// migrations (an object of steps) — whatever each pack names them.
const pickPack = (mod) => Object.values(mod).find((v) => v && typeof v.id === 'string' && Number.isInteger(v.version));
const pickSteps = (mod) => Object.values(mod).find((v) => v && typeof v === 'object' && !Array.isArray(v));

describe('every shipped version has its step', () => {
  it('finds the packs', () => {
    expect(packDirs).toContain('think-twice-adult');
  });

  for (const dir of packDirs) {
    it(`${dir}: a step from every version below the current one`, async () => {
      const p = pickPack(await import(new URL(`${dir}/pack.js`, packsDir).href));
      expect(existsSync(new URL(`${dir}/migrations.js`, packsDir)), `${dir}/migrations.js`).toBe(true);
      const steps = pickSteps(await import(new URL(`${dir}/migrations.js`, packsDir).href));
      expect(steps, `${dir}/migrations.js exports its steps`).toBeTruthy();
      for (let v = 1; v < p.version; v++) {
        expect(typeof steps[v], `${dir}: no step from version ${v}`).toBe('function');
      }
      // And nothing for a version that never shipped.
      for (const k of Object.keys(steps)) expect(Number(k)).toBeLessThan(p.version);
    });
  }

  it('the file format: a step from every format below the current one', () => {
    for (let f = 1; f < SESSION_FORMAT; f++) expect(typeof FORMAT_MIGRATIONS[f], `no step from format ${f}`).toBe('function');
    for (const k of Object.keys(FORMAT_MIGRATIONS)) expect(Number(k)).toBeLessThan(SESSION_FORMAT);
  });

  it('the shell runs the migrations of the interview it runs', () => {
    expect(interviewMigrations).toBe(pickSteps({ m: interviewMigrations }));
    expect(interview.pack.id).toBe(pack.id);
  });
});

// ── A frozen file from every shipped version still loads ──

const fixturesDir = new URL('../fixtures/interview-files/', import.meta.url);
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

describe('frozen files from shipped versions', () => {
  it('holds one for every version and format of this interview that has shipped', () => {
    for (let v = 1; v <= pack.version; v++) {
      for (let f = 1; f <= SESSION_FORMAT; f++) {
        expect(fixtures, `missing ${pack.id}.v${v}.format${f}.json`).toContain(`${pack.id}.v${v}.format${f}.json`);
      }
    }
  });

  for (const name of fixtures) {
    it(`${name} opens in this version, state and transcript intact`, () => {
      const saved = JSON.parse(readFileSync(new URL(name, fixturesDir), 'utf8'));
      const out = upgradeSession(saved, pack, interviewMigrations);
      expect(out.ok, JSON.stringify(out)).toBe(true);
      const state = importState(JSON.stringify(out.session));
      expect(state.meta.currentStage).toBeGreaterThanOrEqual(1);
      // Every slot the file scored is one this version knows — a renamed slot
      // would otherwise read as 0, and what the person said would look missing.
      for (const [stage, slots] of Object.entries(saved.state.coverage)) {
        for (const slot of Object.keys(slots)) {
          expect(state.coverage[stage], `${name}: ${stage}`).toHaveProperty(slot);
        }
      }
      expect(out.session.history.length).toBe(saved.history.length);
      // And the interview can be drawn and run from it.
      expect(() => interview.buildMap(state)).not.toThrow();
    });
  }
});

describe('the file the app seals', () => {
  it('is the interview and nothing more, opening with its header', () => {
    const f = buildInterviewFile({
      pack,
      appVersion: '1.2.3',
      bundle: 'index-x.js',
      savedAt: '2026-10-10T12:00:00.000Z',
      history: [],
      state: createState(),
    });
    expect(Object.keys(f)).toEqual(['interview', 'app', 'format', 'exportedAt', 'history', 'state', 'revisions']);
    expect(f.interview).toEqual(interviewHeader(pack));
    expect(f.format).toBe(SESSION_FORMAT);
    expect(upgradeSession(f, pack, interviewMigrations).ok).toBe(true);
  });
});

// ── The browser side ──

function stubFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, calls };
}

describe('src/adapters/interviewFile.js', () => {
  afterEach(() => vi.unstubAllGlobals());

  const withPassword = (pw) => {
    const store = new Map(pw ? [['tt_app_pw', pw]] : []);
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    });
    return store;
  };

  const envelope = { format: FILE_FORMAT, v: 1, kid: 'k1', iv: 'a', tag: 'b', data: 'c' };

  it('names the same format the server writes', () => {
    expect(FILE_FORMAT).toBe(SERVER_FILE_FORMAT);
  });

  it('seals through the function, with the door and no cache', async () => {
    withPassword('door');
    const { fetchImpl, calls } = stubFetch(200, { file: envelope, rid: 'r' });
    const out = await sealInterview({ a: 1 }, { fetchImpl });
    expect(out).toEqual({ ok: true, file: envelope });
    expect(calls[0].url).toBe('/api/interview-file');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.cache).toBe('no-store');
    expect(calls[0].init.headers['x-app-password']).toBe('door');
    expect(JSON.parse(calls[0].init.body)).toEqual({ action: 'seal', payload: { a: 1 } });
  });

  it('opens through the function', async () => {
    withPassword('');
    const { fetchImpl, calls } = stubFetch(200, { payload: { x: 1 } });
    expect(await openInterviewFile(envelope, { fetchImpl })).toEqual({ ok: true, payload: { x: 1 } });
    expect(calls[0].init.headers['x-app-password']).toBeUndefined();
    expect(JSON.parse(calls[0].init.body)).toEqual({ action: 'open', file: envelope });
  });

  it('says why it failed, and never throws', async () => {
    withPassword('');
    expect(await openInterviewFile(envelope, stubFetch(400, { error: 'tampered' }))).toEqual({ ok: false, error: 'tampered' });
    expect(await sealInterview({}, stubFetch(500, { error: 'not-configured' }))).toEqual({ ok: false, error: 'not-configured' });
    expect(await sealInterview({}, stubFetch(502, null))).toEqual({ ok: false, error: 'http-502' });
    const down = { fetchImpl: async () => { throw new Error('offline'); } };
    expect(await sealInterview({}, down)).toEqual({ ok: false, error: 'network' });
    expect(await sealInterview({}, stubFetch(200, { file: { format: 'other' } }))).toEqual({ ok: false, error: 'internal' });
  });

  it('a locked door forgets the password, as the model proxy does', async () => {
    const store = withPassword('stale');
    expect(await sealInterview({}, stubFetch(401, { error: 'unauthorized' }))).toEqual({
      ok: false,
      error: 'unauthorized',
      unauthorized: true,
    });
    expect(store.has('tt_app_pw')).toBe(false);
  });

  it('tells a sealed file from a readable export by its marker alone', () => {
    expect(isSealedFile(envelope)).toBe(true);
    expect(isSealedFile(fileAt(1))).toBe(false);
    expect(isSealedFile(null)).toBe(false);
  });

  it('names the file by its date and time, and nothing else', () => {
    const name = interviewFileName(new Date(2026, 9, 10, 14, 32));
    expect(name).toBe(`think-twice-2026-10-10-1432${FILE_EXTENSION}`);
  });
});
