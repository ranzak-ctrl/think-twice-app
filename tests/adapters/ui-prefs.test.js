import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPref, setPref } from '../../src/adapters/uiPrefs.js';

// Every access to localStorage is wrapped, and these guard the reason why: in a
// private window, with site data cleared, or on a browser set to block storage,
// the accessor itself can THROW. An unguarded read here would take the whole app
// down — and this module is read during App's first render, before anything is
// on screen to explain it.
describe('display preferences survive a browser that refuses to store them', () => {
  const store = new Map();
  const working = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', working);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips a preference', () => {
    setPref('mapOpen', false);
    expect(getPref('mapOpen', true)).toBe(false);
  });

  it('falls back when nothing is stored', () => {
    expect(getPref('mapOpen', true)).toBe(true);
    expect(getPref('mapOpen', false)).toBe(false);
  });

  it('keeps other preferences when one is written', () => {
    setPref('a', true);
    setPref('b', false);
    expect(getPref('a', false)).toBe(true);
    expect(getPref('b', true)).toBe(false);
  });

  it('falls back to the default when reading throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('access denied'); },
      setItem() {},
    });
    expect(() => getPref('mapOpen', true)).not.toThrow();
    expect(getPref('mapOpen', true)).toBe(true);
  });

  it('does not throw when writing throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem() { throw new Error('quota exceeded'); },
    });
    expect(() => setPref('mapOpen', false)).not.toThrow();
  });

  it('ignores a stored value that is not what we wrote', () => {
    // Another script, an older build, or someone in DevTools.
    store.set('tt.ui', 'not json at all');
    expect(getPref('mapOpen', true)).toBe(true);
    store.set('tt.ui', '"a string"');
    expect(getPref('mapOpen', true)).toBe(true);
    store.set('tt.ui', JSON.stringify({ mapOpen: 'yes' }));
    expect(getPref('mapOpen', true)).toBe(true); // not a boolean → the default
  });

  it('never touches storage that is not there at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getPref('mapOpen', true)).toBe(true);
    expect(() => setPref('mapOpen', false)).not.toThrow();
  });
});
