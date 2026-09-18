import { describe, it, expect } from 'vitest';
import {
  createEventRecord,
  mergeBeats,
  mergeStances,
  mergeEmotions,
  mergeSetting,
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

describe('the empty column on another character', () => {
  it('names what is not known about her, using the same headings', () => {
    const block = renderEvent(build());
    const hers = block.slice(block.indexOf('— אשתך'));
    expect(hers).toContain('לא ידוע:');
    expect(hers).toContain('פרשנות');
    expect(hers).toContain('רגש');
  });

  it('says nothing of the kind about the interviewee — an empty column on him is ordinary', () => {
    let r = createEventRecord();
    r = mergeBeats(r, [{ id: 'b', slot: 'stage1.trigger', actor: 'self', text: 'עברת', camera: true }]);
    expect(renderEvent({ eventRecord: r })).not.toContain('לא ידוע');
  });

  it('drops the unknown line once the column is filled', () => {
    const s = build();
    s.eventRecord = mergeStances(s.eventRecord, [
      { id: 'p', slot: 'stage5.perspective', type: 'reading', actor: 'wife', text: 'לא ידעה שאתה שם', source: 'stated' },
      { id: 'w', slot: 'stage5.intention', type: 'want', actor: 'wife', text: 'רגע נעים', source: 'stated' },
    ]);
    s.eventRecord = mergeEmotions(s.eventRecord, [
      { id: 'we', slot: 'stage3.emotion', actor: 'wife', name: 'עייפות', granular: true },
    ]);
    expect(renderEvent(s).slice(renderEvent(s).indexOf('— אשתך'))).not.toContain('לא ידוע');
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
  it('includes wound material — the prompt is not the person screen', () => {
    const s = build();
    s.eventRecord = mergeStances(s.eventRecord, [
      { id: 'w', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא שווה', source: 'stated' },
    ]);
    expect(renderEvent(s)).toContain('אני לא שווה');
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
