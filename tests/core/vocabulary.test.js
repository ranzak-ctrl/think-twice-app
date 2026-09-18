import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  STANCE_TYPES, EMOTION_PACES, EDGE_KINDS, GROUP_KINDS,
  SOURCES, NODE_SCALES, NEVER_SHOW_SLOTS, LABEL_MAX,
} from '../../src/core/vocabulary.js';
import * as state from '../../src/core/state.js';
import * as record from '../../src/core/eventRecord.js';

// docs/event-vocabulary.md and the מילון tab of the v2 dashboard are the list Ran
// manages. This file is what stops them from drifting apart from the code — the
// failure mode /docs has already had against the code once, and the reason the doc
// itself recommends one module the document mirrors.

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const VOCAB_DOC = read('docs/event-vocabulary.md');
const DASHBOARD = read('docs/architecture-dashboard-v2.html');
const SOURCE = read('src/core/vocabulary.js');

const SETS = {
  STANCE_TYPES: [STANCE_TYPES, ['want', 'goal', 'reading']],
  EMOTION_PACES: [EMOTION_PACES, ['situational', 'prior', 'trait']],
  EDGE_KINDS: [EDGE_KINDS, ['then', 'because', 'agent', 'echo', 'derives_from', 'about']],
  GROUP_KINDS: [GROUP_KINDS, ['community', 'process', 'perspective']],
  SOURCES: [SOURCES, ['stated', 'attributed', 'inferred', 'unknown']],
  NODE_SCALES: [NODE_SCALES, ['episode', 'ongoing']],
  NEVER_SHOW_SLOTS: [NEVER_SHOW_SLOTS, ['wound', 'adhd_pattern']],
};

describe('the vocabulary is exactly what is documented', () => {
  // Hardcoded rather than derived, deliberately: an addition should have to be
  // written down in three places on purpose, because every new kind is a new way
  // for the model to classify wrongly.
  for (const [name, [set, expected]] of Object.entries(SETS)) {
    it(`${name} holds exactly ${expected.join(' · ')}`, () => {
      expect([...set].sort()).toEqual([...expected].sort());
    });
  }

  it('a new value cannot be added without documenting it', () => {
    const undocumented = [];
    for (const [name, [set]] of Object.entries(SETS)) {
      if (name === 'NEVER_SHOW_SLOTS') continue; // slot names, not vocabulary the doc tabulates
      for (const v of set) if (!VOCAB_DOC.includes(v)) undocumented.push(`${name}.${v} → docs/event-vocabulary.md`);
    }
    expect(undocumented).toEqual([]);
  });

  it('a new value cannot be added without showing it in the dashboard', () => {
    const unshown = [];
    for (const [name, [set]] of Object.entries(SETS)) {
      if (name === 'NEVER_SHOW_SLOTS') continue;
      for (const v of set) if (!DASHBOARD.includes(v)) unshown.push(`${name}.${v} → מילון tab`);
    }
    expect(unshown).toEqual([]);
  });
});

describe('one definition, however it is imported', () => {
  it('state.js and eventRecord.js re-export the same objects, not copies', () => {
    expect(state.EDGE_KINDS).toBe(EDGE_KINDS);
    expect(state.GROUP_KINDS).toBe(GROUP_KINDS);
    expect(state.NODE_SCALES).toBe(NODE_SCALES);
    expect(state.NEVER_SHOW_SLOTS).toBe(NEVER_SHOW_SLOTS);
    expect(record.STANCE_TYPES).toBe(STANCE_TYPES);
    expect(record.EMOTION_PACES).toBe(EMOTION_PACES);
    expect(record.SOURCES).toBe(SOURCES);
  });

  it('the label cap is one number under both of its names', () => {
    // They were 24 in two files with nothing keeping them equal, and they enforce
    // the same rule: a label that needs cutting is not a label.
    expect(state.MAP_LABEL_MAX).toBe(LABEL_MAX);
    expect(record.ENTITY_LABEL_MAX).toBe(LABEL_MAX);
  });
});

describe('the module sits at the bottom of the import graph', () => {
  // This is what removed the state.js ↔ eventRecord.js cycle. router-guard called
  // that cycle a latent trap: a future module-scope read of the const it re-entered
  // would throw a TDZ ReferenceError in ONE import order only. Importing anything
  // here could put a cycle back.
  it('imports nothing', () => {
    expect(SOURCE).not.toMatch(/^\s*import\s/m);
  });

  it('eventRecord.js no longer imports from state.js', () => {
    expect(read('src/core/eventRecord.js')).not.toMatch(/from '\.\/state\.js'/);
  });
});

describe('the barred slots are real slots', () => {
  // A typo here would silently disable the guard rather than fail loudly: a slot
  // that does not exist can never match, so nothing would ever be redacted.
  it('every barred name is a slot the coverage map actually has', () => {
    const cov = state.createState().coverage;
    const all = new Set(Object.values(cov).flatMap((slots) => Object.keys(slots)));
    for (const slot of NEVER_SHOW_SLOTS) expect(all.has(slot)).toBe(true);
  });
});
