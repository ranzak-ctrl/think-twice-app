// The session export opens with which interview model and which app version
// (Ran, 9.10.2026) — the first lines of the file, before anything else.

import { describe, it, expect } from 'vitest';
import { buildSessionExport, exportedInterviewId, interviewHeader } from '../../src/ui/sessionExport.js';
import { thinkTwiceAdult } from '../../src/packs/think-twice-adult/pack.js';
import { APP_VERSION } from '../../src/adapters/appVersion.js';

const build = () =>
  buildSessionExport({
    pack: thinkTwiceAdult,
    appVersion: APP_VERSION,
    bundle: 'index-abc123.js',
    exportedAt: '2026-10-09T10:00:00.000Z',
    history: [],
    state: {},
    revisions: [],
    map: null,
    mapSvg: null,
  });

describe('session export', () => {
  it('opens with the interview, then the app version', () => {
    const json = JSON.stringify(build(), null, 2);
    const keys = Object.keys(build());
    expect(keys.slice(0, 2)).toEqual(['interview', 'app']);
    // As a person sees it: the first lines of the file.
    const head = json.split('\n').slice(0, 8).join('\n');
    expect(head).toContain('"id": "think-twice-adult"');
    expect(head).toContain(`"name": "${thinkTwiceAdult.name}"`);
    expect(head).toContain('"version": 1');
    expect(head).toContain(`"version": "${APP_VERSION}"`);
  });

  it('carries the app version the build burned in, never an unknown one', () => {
    // vite.config.js defines it from package.json; vitest runs on the same config.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('names the interview the export came from', () => {
    expect(exportedInterviewId(build())).toBe('think-twice-adult');
    expect(interviewHeader(thinkTwiceAdult)).toEqual({
      id: 'think-twice-adult',
      name: thinkTwiceAdult.name,
      version: thinkTwiceAdult.version,
    });
  });

  it('reads an export from before the header as unnamed, not as an error', () => {
    expect(exportedInterviewId({ exportedAt: 'x', history: [], state: {} })).toBeNull();
    expect(exportedInterviewId(null)).toBeNull();
  });
});
