import { describe, it, expect } from 'vitest';
import {
  createEventRecord,
  mergeBeats,
  mergeStances,
  mergeEmotions,
  mergeSetting,
  createEventRecord,
} from '../../src/core/eventRecord.js';
import { renderEvent } from '../../src/core/eventView.js';

function build() {
  let r = createEventRecord();
  r = mergeSetting(r, { place: 'בסלון', time: 'בערב', conditions: ['אין שותפות אמיתית'] });
  r = mergeBeats(r, [
    { id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת בסלון', camera: true, phase: 'during' },
    { id: 'b2', slot: 'stage1.timeline', actor: 'wife', text: 'בחרה צימר', camera: true, phase: 'before' },
    { id: 'b3', slot: 'stage1.auto_reaction', actor: 'self', text: 'שאלת ממתי', camera: true, phase: 'during' },
  ]);
  r = mergeStances(r, [
    { id: 's1', slot: 'stage2.causal', type: 'reading', actor: 'self', text: 'החליטו בלעדיי', source: 'stated' },
  ]);
  r = mergeEmotions(r, [
    { id: 'e1', slot: 'stage3.emotion', actor: 'self', name: 'עלבון', granular: true, intensity: 8 },
  ]);
  return { eventRecord: r, actorMap: { wife: { label: 'אשתך', relation: 'בת זוג', clear: true } } };
}

describe('renderEvent — an account, not a dump', () => {
  it('returns nothing when there is no record or nothing in it', () => {
    expect(renderEvent({})).toBe('');
    expect(renderEvent({ eventRecord: createEventRecord() })).toBe('');
    expect(renderEvent(undefined)).toBe('');
  });

  it('renders the stage, the cast, the sequence and the ground', () => {
    const out = renderEvent(build());
    expect(out).toContain('**הזירה:** בסלון · בערב');
    expect(out).toContain('— אתה');
    expect(out).toContain('— אשתך (בת זוג)');
    expect(out).toContain('לפני: אשתך: בחרה צימר');
    expect(out).toContain('**ברקע, לאורך זמן:** אין שותפות אמיתית');
  });

  it('addresses the interviewee, never describes him', () => {
    const out = renderEvent(build());
    expect(out).toContain('— אתה');
    for (const bad of ['המשתמש', 'המרואיין']) expect(out).not.toContain(bad);
  });

  it('gives every actor their own column — beats attributed to whoever did them', () => {
    const out = renderEvent(build());
    const self = out.slice(out.indexOf('— אתה'), out.indexOf('— אשתך'));
    expect(self).toContain('עברת בסלון');
    expect(self).not.toContain('בחרה צימר'); // her action is hers, never his auto-reaction
    expect(out.slice(out.indexOf('— אשתך'))).toContain('בחרה צימר');
  });
});

describe('the protocol tests are visible in the account', () => {
  it('marks a stance the interviewer offered and he has not adopted', () => {
    const s = build();
    s.eventRecord = mergeStances(s.eventRecord, [
      { id: 'x', slot: 'stage5.intention', type: 'want', actor: 'wife', text: 'רגע נעים', source: 'inferred' },
    ]);
    expect(renderEvent(s)).toContain('טרם אומצה');
  });

  it('does not mark one he stated himself', () => {
    const s = build();
    s.eventRecord = mergeStances(s.eventRecord, [
      { id: 'x', slot: 'stage5.intention', type: 'want', actor: 'wife', text: 'רגע נעים', source: 'stated' },
    ]);
    expect(renderEvent(s)).not.toContain('טרם אומצה');
  });

  it('marks content that failed the camera test', () => {
    const s = build();
    s.eventRecord = mergeBeats(s.eventRecord, [
      { id: 'b9', slot: 'stage1.trigger', actor: 'wife', text: 'ירדה עליך', camera: false, phase: 'during' },
    ]);
    expect(renderEvent(s)).toContain('פרשנות, לא עובדה מצולמת');
  });

  it('flags an unclear character — the stage-1 gate, legible to the interviewer', () => {
    const s = build();
    s.actorMap = { wife: { label: 'אשתך', clear: false } };
    expect(renderEvent(s)).toContain('⚠ לא ברור');
  });
});

describe('the cast appears even before anything is recorded about them', () => {
  it('names a character in the cast with nothing yet attributed', () => {
    const out = renderEvent(build());
    expect(out).toContain('— אשתך (בת זוג)');
  });

  // Removed on router-guard's finding: a "לא ידוע" line naming another character's
  // missing interpretation / wants / feelings fired for anyone in actorMap, so every
  // prompt from stage-1 turn three carried stage-3 and stage-5 material addressed to
  // the stage-1 agent. test-plan §א.2 item 10 is a live regression for that drift.
  it('never names which mind-layer fields are missing — that is cross-stage pressure', () => {
    expect(renderEvent(build())).not.toContain('לא ידוע');
  });
});

describe('redaction — the default is safe and only the probe opts out', () => {
  const withWound = () => {
    const s = build();
    s.eventRecord = mergeStances(s.eventRecord, [
      { id: 'w', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא שווה', source: 'stated' },
      { id: 'p', slot: 'stage2.adhd_pattern', type: 'reading', actor: 'self', text: 'חוסר ארגון', source: 'stated' },
    ]);
    return s;
  };

  // summarizeState feeds FOUR builders, two of which (summary, opener) are spoken to
  // the person verbatim. The default must therefore be redacted, so a builder that
  // forgets to think about it gets the safe behaviour rather than the leak.
  it('redacts the wound and the ADHD pattern by default', () => {
    const out = renderEvent(withWound());
    expect(out).not.toContain('אני לא שווה');
    expect(out).not.toContain('חוסר ארגון');
    expect(out).toContain('החליטו בלעדיי'); // everything else still there
  });

  it('gives the probe the whole account — stage 2 cannot explore what it is not told', () => {
    const out = renderEvent(withWound(), { full: true });
    expect(out).toContain('אני לא שווה');
    expect(out).toContain('חוסר ארגון');
  });
});

describe('inertness — the account is the ledger\'s account', () => {
  it('renders nothing for an empty ledger even when the cast is populated', () => {
    expect(renderEvent({ eventRecord: createEventRecord(), actorMap: { boss: { label: 'הממונה' } } })).toBe('');
  });
});

describe('the two clocks stay apart', () => {
  it('an ongoing beat never becomes a station in the sequence', () => {
    const s = build();
    s.eventRecord = mergeBeats(s.eventRecord, [
      { id: 'o', slot: 'stage1.status', actor: 'wife', text: 'מנסה לדבר על זה מזמן', camera: true, scale: 'ongoing', phase: 'during' },
    ]);
    const out = renderEvent(s);
    const seq = out.slice(out.indexOf('**הרצף:**'), out.indexOf('**ברקע'));
    expect(seq).not.toContain('מנסה לדבר על זה מזמן');
    expect(out.slice(out.indexOf('**ברקע'))).toContain('מנסה לדבר על זה מזמן');
  });

  it('names an unplaced beat rather than inventing a position for it', () => {
    const s = build();
    s.eventRecord = mergeBeats(s.eventRecord, [
      { id: 'u', slot: 'stage1.timeline', actor: 'self', text: 'משהו בלי מיקום', camera: true },
    ]);
    expect(renderEvent(s)).toContain('לא מוקם בציר הזמן: אתה: משהו בלי מיקום');
  });
});

describe('what the interviewer must still be told', () => {
  // NEVER_SHOW_SLOTS guards the MAP, not this: stage 2 cannot probe a subject it is
  // not told about, and summarizeState already ships the full coverage map today.
  it('includes wound material for the probe — stage 2 cannot probe what it is not told', () => {
    const s = build();
    s.eventRecord = mergeStances(s.eventRecord, [
      { id: 'w', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא שווה', source: 'stated' },
    ]);
    expect(renderEvent(s, { full: true })).toContain('אני לא שווה');
  });

  it('carries what the story itself left undecided', () => {
    const s = build();
    s.openForks = { f1: { id: 'f1', question: 'מי מחליט על חופשות', options: ['אתה', 'היא'], settled: false } };
    expect(renderEvent(s)).toContain('**לא הוכרע בעולם:** מי מחליט על חופשות');
  });

  it('drops a fork the world has since settled', () => {
    const s = build();
    s.openForks = { f1: { id: 'f1', question: 'מי מחליט', options: ['א', 'ב'], settled: true } };
    expect(renderEvent(s)).not.toContain('לא הוכרע בעולם');
  });

  it('shows a character the registrar attributed a beat to before naming them', () => {
    const s = build();
    s.eventRecord = mergeBeats(s.eventRecord, [
      { id: 'n', slot: 'stage1.timeline', actor: 'romi', text: 'ישבה לידה', camera: true, phase: 'before' },
    ]);
    expect(renderEvent(s)).toContain('— romi');
  });
});
