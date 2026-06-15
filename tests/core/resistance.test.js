import { describe, it, expect } from 'vitest';
import { resolveResistance } from '../../src/core/router.js';
import { parseResponse } from '../../src/core/responseParser.js';
import { createState } from '../../src/core/state.js';

// ─── 1. resolveResistance — pure signal → aperture mapping ─────────────────

describe('resolveResistance', () => {
  const clean = { overflow: false, avoidance: false, flight: false, cynicism: false, contradiction: false };

  it('returns null/null when no resistance', () => {
    const r = resolveResistance(clean);
    expect(r.resistanceFlag).toBeNull();
    expect(r.questionAperture).toBeNull();
  });

  it('avoidance → open aperture', () => {
    const r = resolveResistance({ ...clean, avoidance: true });
    expect(r.resistanceFlag).toBe('avoidance');
    expect(r.questionAperture).toBe('open');
  });

  it('flight → closed aperture', () => {
    const r = resolveResistance({ ...clean, flight: true });
    expect(r.resistanceFlag).toBe('flight');
    expect(r.questionAperture).toBe('closed');
  });

  it('overflow → open aperture (regulation mode)', () => {
    const r = resolveResistance({ ...clean, overflow: true });
    expect(r.resistanceFlag).toBe('overflow');
    expect(r.questionAperture).toBe('open');
  });

  it('cynicism → no aperture override', () => {
    const r = resolveResistance({ ...clean, cynicism: true });
    expect(r.resistanceFlag).toBe('cynicism');
    expect(r.questionAperture).toBeNull();
  });

  it('priority: overflow beats flight', () => {
    const r = resolveResistance({ ...clean, overflow: true, flight: true });
    expect(r.resistanceFlag).toBe('overflow');
  });

  it('priority: flight beats avoidance', () => {
    const r = resolveResistance({ ...clean, flight: true, avoidance: true });
    expect(r.resistanceFlag).toBe('flight');
  });

  it('priority: avoidance beats cynicism', () => {
    const r = resolveResistance({ ...clean, avoidance: true, cynicism: true });
    expect(r.resistanceFlag).toBe('avoidance');
  });
});

// ─── 2. Parser: new resistance fields ───────────────────────────────────────

describe('parseResponse — resistance fields', () => {
  it('extracts flag_cynicism', () => {
    const raw = JSON.stringify({
      message: 'אני שומע אותך.',
      evaluation: { flag_cynicism: true },
    });
    const r = parseResponse(raw);
    expect(r.evaluation.flagCynicism).toBe(true);
  });

  it('defaults flag_cynicism to false', () => {
    const r = parseResponse(JSON.stringify({ message: 'שלום?' }));
    expect(r.evaluation.flagCynicism).toBe(false);
  });

  it('extracts drifted_topic when present', () => {
    const raw = JSON.stringify({
      message: 'מעניין.',
      evaluation: { flag_flight: true, drifted_topic: 'ילדות' },
    });
    const r = parseResponse(raw);
    expect(r.evaluation.driftedTopic).toBe('ילדות');
  });

  it('drifted_topic defaults to null', () => {
    const r = parseResponse(JSON.stringify({ message: 'שלום?' }));
    expect(r.evaluation.driftedTopic).toBeNull();
  });

  it('trims and nullifies empty drifted_topic', () => {
    const raw = JSON.stringify({
      message: 'מעניין.',
      evaluation: { drifted_topic: '  ' },
    });
    const r = parseResponse(raw);
    expect(r.evaluation.driftedTopic).toBeNull();
  });
});

// ─── 3. State schema ────────────────────────────────────────────────────────

describe('State — resistance fields', () => {
  it('initial state has cynicism signal', () => {
    const s = createState();
    expect(s.meta.signals.cynicism).toBe(false);
  });

  it('initial state has null resistanceFlag', () => {
    const s = createState();
    expect(s.meta.resistanceFlag).toBeNull();
  });

  it('initial state has empty savedThreads', () => {
    const s = createState();
    expect(s.meta.savedThreads).toEqual([]);
  });

  it('initial questionAperture is open', () => {
    const s = createState();
    expect(s.meta.questionAperture).toBe('open');
  });
});
