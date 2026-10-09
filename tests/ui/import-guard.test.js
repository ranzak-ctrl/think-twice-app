// Which exports load (Ran, 9.10.2026): only this interview model, at this version.
// Old export files are not supported — "a negligible number".

import { describe, it, expect } from 'vitest';
import { importCompatibility } from '../../src/ui/sessionExport.js';
import { thinkTwiceAdult as pack } from '../../src/packs/think-twice-adult/pack.js';

const exported = (interview) => ({ interview, app: { version: '1.0.0' }, history: [], state: {} });

describe('import compatibility', () => {
  it('loads an export of this interview at this version', () => {
    expect(importCompatibility(exported({ id: pack.id, name: pack.name, version: pack.version }), pack)).toEqual({ ok: true });
  });

  it('refuses another interview model, and names it', () => {
    expect(importCompatibility(exported({ id: 'think-twice-parent', name: 'Think Twice · הורים', version: 1 }), pack)).toEqual({
      ok: false,
      reason: 'other-interview',
      name: 'Think Twice · הורים',
    });
  });

  it('refuses another version of this interview — its stages may not be these', () => {
    expect(importCompatibility(exported({ id: pack.id, name: pack.name, version: pack.version + 1 }), pack)).toEqual({
      ok: false,
      reason: 'other-version',
      from: pack.version + 1,
      current: pack.version,
    });
  });

  it('refuses an export from before the header — nothing says what it is', () => {
    expect(importCompatibility({ exportedAt: 'x', history: [], state: {} }, pack).reason).toBe('no-header');
    expect(importCompatibility(null, pack).reason).toBe('no-header');
  });
});
