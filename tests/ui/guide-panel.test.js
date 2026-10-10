// The guide panel shows whichever interview is running.
//
// Until 10.10.2026 it carried its own copy of Think Twice: the seven stage names,
// a loop over 1–7, the cast on stage1.actors and the intensity rows for stages 3
// and 5. One shell runs several interviews (plan §2א), so it reads all of that from
// the pack now. Rendered to a string — the panel has no behaviour these checks need.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import GuidePanel from '../../src/ui/GuidePanel.jsx';
import { interview } from '../../src/ui/interview.js';
import { createEngine } from '../../src/core/engine.js';
import { mergeActorMap } from '../../src/core/state.js';
import { four, prompts } from '../helpers/four-stage.js';

const render = (engine, patch = {}) => {
  const s = engine.createState();
  const state = { ...s, ...patch, meta: { ...s.meta, ...(patch.meta ?? {}) } };
  // renderToString separates adjacent text with empty comments; drop them so the
  // checks read the text the way the panel shows it.
  return renderToString(
    createElement(GuidePanel, { state, pack: engine.pack, account: engine.renderEvent, onClose: () => {} })
  ).replace(/<!-- -->/g, '');
};

describe('the guide panel', () => {
  it('shows Think Twice as it always did', () => {
    const html = render(interview, {
      meta: { currentStage: 3, kpi: { ...interview.createState().meta.kpi, emotionIntensityStage3: 8, emotionIntensityStage5: 5 } },
    });
    expect(html).toContain('שלב 3 — רגש');
    for (const name of ['עובדות', 'פרשנות', 'רגש', 'תגובה', 'פרשנות חלופית', 'חלופות', 'הכרעה']) expect(html).toContain(name);
    expect(html).toContain('רגש שלב 3');
    expect(html).toContain('רגש שלב 5');
    // The delta, baseline minus re-measure.
    expect(html).toMatch(/דלתא[\s\S]{0,200}?>3</);
  });

  it('shows a four-stage interview as four stages, with its own cast and measures', () => {
    const engine = createEngine({ pack: four, prompts, complete: async () => ({ ok: true }) });
    const s = mergeActorMap(engine.createState(), [{ id: 'boss', label: 'המנהל', clear: false }]);
    const html = render(engine, { actorMap: s.actorMap, meta: { currentStage: 2 } });
    expect(html).toContain('שלב 2 — משמעות');
    expect(html).toContain('4. בחירה');
    expect(html).not.toContain('5. ');
    expect(html).not.toContain('פרשנות חלופית');
    // The cast is listed under the pack's cast slot, not under Think Twice's.
    expect(html).toContain('המנהל');
    expect(html).toContain('רגש שלב 2');
    expect(html).not.toContain('רגש שלב 5');
  });
});
