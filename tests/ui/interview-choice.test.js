// Which interview a page runs — chosen by its address until accounts exist
// (src/ui/interview.js; Ran, 16.10.2026: the parents' interview on the QA link).
// Every link that ever worked must still open the adult interview.

import { describe, it, expect } from 'vitest';
import { interviewIdFrom, addressFor, interview, interviewCopy, interviewChoiceNeeded, choiceHref } from '../../src/ui/interview.js';
import { thinkTwiceAdult } from '../../src/packs/think-twice-adult/pack.js';
import { thinkTwiceParents } from '../../src/packs/think-twice-parents/pack.js';

describe('the address chooses the interview', () => {
  it('opens the parents’ interview by its short name or its id', () => {
    expect(interviewIdFrom('?interview=parents')).toBe(thinkTwiceParents.id);
    expect(interviewIdFrom('?interview=think-twice-parents')).toBe(thinkTwiceParents.id);
    expect(interviewIdFrom('?x=1&interview=parents')).toBe(thinkTwiceParents.id);
  });

  it('opens the adult interview for anything else', () => {
    for (const search of ['', '?', '?interview=', '?interview=nope', '?interview=PARENTS', undefined, null]) {
      expect(interviewIdFrom(search)).toBe(thinkTwiceAdult.id);
    }
    expect(interviewIdFrom('?interview=adult')).toBe(thinkTwiceAdult.id);
  });

  it('does not open the parents’ interview where it is not allowed (production, until its safety profile)', () => {
    expect(interviewIdFrom('?interview=parents', { allowParents: false })).toBe(thinkTwiceAdult.id);
    expect(interviewIdFrom('?interview=think-twice-parents', { allowParents: false })).toBe(thinkTwiceAdult.id);
  });

  it('names the address of the parents’ interview, and none for the default', () => {
    expect(addressFor(thinkTwiceParents.id)).toBe('?interview=parents');
    expect(addressFor(thinkTwiceAdult.id)).toBe('');
  });

  it('runs the adult interview, with its own words, when no address asks otherwise', () => {
    expect(interview.pack).toBe(thinkTwiceAdult);
    expect(interviewCopy.opening).toBe('אז ספר לי — מה קרה?');
    expect(interviewCopy.badge).toBeUndefined();
  });
});

// Ran, 16.10.2026: the QA link serves both interviews. On the QA build an address that
// names neither shows the choice first; production never does.
describe('the QA link offers both interviews', () => {
  it('shows the choice on the QA build when the address names no interview', () => {
    for (const search of ['', '?', '?interview=', '?interview=nope', '?_vercel_share=abc', undefined, null]) {
      expect(interviewChoiceNeeded(search, { allowParents: true })).toBe(true);
    }
  });

  it('does not show it once an interview is named, by its short name or its id', () => {
    for (const search of ['?interview=adult', '?interview=parents', '?interview=think-twice-parents', '?_vercel_share=abc&interview=adult']) {
      expect(interviewChoiceNeeded(search, { allowParents: true })).toBe(false);
    }
  });

  it('never shows it where the parents’ interview is not offered (production)', () => {
    for (const search of ['', '?interview=nope', '?interview=parents']) {
      expect(interviewChoiceNeeded(search, { allowParents: false })).toBe(false);
    }
  });

  it('links each choice to the same page, with the interview named and the other parameters kept', () => {
    expect(choiceHref('', 'adult')).toBe('?interview=adult');
    expect(choiceHref('', 'parents')).toBe('?interview=parents');
    expect(choiceHref('?_vercel_share=abc', 'parents')).toBe('?_vercel_share=abc&interview=parents');
    expect(choiceHref('?interview=parents', 'adult')).toBe('?interview=adult');
  });
});

