// The end screen (Ran, 10.10.2026; plan 2ב, stage 4.7) — what it says, and the
// rules the app around it keeps. Its behaviour in a browser — the file saved and
// downloaded, the five minutes counted down, the reload — was checked in Chromium
// against the dev server; these hold what can be held without one.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import EndScreen, { END_SECONDS } from '../../src/ui/EndScreen.jsx';

const render = (reason) =>
  renderToString(
    createElement(EndScreen, {
      reason,
      fileName: 'x.thinktwice',
      seal: async () => ({ ok: false, error: 'network' }),
      onReturn: () => {},
      onExit: () => {},
    })
  ).replace(/<!-- -->/g, '');

const app = readFileSync(new URL('../../src/ui/App.jsx', import.meta.url), 'utf8');

describe('the end screen', () => {
  it('says plainly that what was said is about to be erased, and that nothing is kept', () => {
    for (const reason of ['complete', 'leave']) {
      const html = render(reason);
      expect(html).toContain('כל מה שנאמר כאן יימחק מהדפדפן');
      expect(html).toContain('אצלנו לא נשמר ממנו דבר');
    }
  });

  it('opens by preparing the file, and counts down five minutes', () => {
    const html = render('complete');
    expect(html).toContain('מכין את הראיון כקובץ מוצפן');
    expect(END_SECONDS).toBe(5 * 60);
    expect(html).toContain('המסך ייסגר בעוד 5:00');
  });

  it('cannot be left while the file is being saved', () => {
    expect(render('complete')).toMatch(/<button class="btn" disabled="">מכין…<\/button>/);
  });

  it('offers the way back only to someone leaving midway', () => {
    expect(render('leave')).toContain('חזרה לראיון');
    expect(render('leave')).toContain('יציאה מהראיון');
    expect(render('complete')).not.toContain('חזרה לראיון');
    expect(render('complete')).toContain('הראיון הסתיים');
  });

  it('promises no email — there is none until accounts exist (plan stage 4)', () => {
    for (const reason of ['complete', 'leave']) expect(render(reason)).not.toMatch(/מייל|אימייל/);
  });
});

describe('the file downloads only from the button (Ran, 14.10.2026)', () => {
  const src = readFileSync(new URL('../../src/ui/EndScreen.jsx', import.meta.url), 'utf8');

  it('preparing the file never downloads it', () => {
    const prepare = src.slice(src.indexOf('const runSave'), src.indexOf('const takeFile'));
    expect(prepare).toContain('sealRef.current()');
    expect(prepare).not.toMatch(/download\(/);
  });

  it('the only download is the button\'s', () => {
    const calls = src.match(/\bdownload\(/g) ?? [];
    // One call, in takeFile, which only the two "הורדת הקובץ" buttons run.
    expect(calls.length).toBe(1);
    const take = src.slice(src.indexOf('const takeFile'), src.indexOf('const takeFile') + 200);
    expect(take).toContain('download(save.url)');
  });

  it('tells the person not to edit the file — one changed character and it never opens', () => {
    expect(src).toContain('אל תפתח את הקובץ לעריכה: שינוי בו, אפילו של תו אחד, ימנע את פתיחתו.');
    // Shown while the file is ready and after it is taken, both.
    expect(src.match(/\{DO_NOT_EDIT\}/g)?.length).toBe(2);
  });

  it('leaving with the file not taken asks first, and says what is lost', () => {
    expect(src).toMatch(/save\.status === 'saved' && !downloaded\) setConfirmExit\(true\)/);
    expect(src).toContain('לא הורדת את הקובץ. אם תצא עכשיו, הראיון יימחק ולא יישאר ממנו עותק.');
    expect(src).toContain('יציאה בלי קובץ');
  });
});

describe('the app around it', () => {
  it('erases by reloading the page, and lets that reload past "leave site?"', () => {
    expect(app).toMatch(/exitingRef\.current = true;\s*window\.location\.reload\(\)/);
    expect(app).toMatch(/if \(exitingRef\.current\) return;/);
  });

  it('opens the end screen when the interview ends by itself', () => {
    expect(app).toMatch(/state\.meta\.sessionComplete && !viewing && !end/);
  });

  it('gives a person the encrypted file; the readable one is the testers\', in the guide panel', () => {
    expect(app).toContain('onExportPlain={handleExportPlain}');
    // The header's save seals; nothing in the header writes the readable export.
    const header = app.slice(app.indexOf('<header'), app.indexOf('</header>'));
    expect(header).not.toContain('handleExportPlain');
    expect(header).toContain('handleSave');
  });

  it('opens an unfinished interview straight into the chat — no extra click (Ran, 14.10.2026)', () => {
    // Read-only only when it ended or was stopped; otherwise `viewing` stays null
    // and the composer is there.
    expect(app).toMatch(/setViewing\(viewOnly && \(complete \|\| stopped\) \? \{ complete, stopped \} : null\)/);
    expect(app).not.toContain('onContinue');
  });

  it('keeps no interview content in browser storage', () => {
    expect(app).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});

describe('after a safety stop (principle 7; questions-for-natali §16)', () => {
  const renderStopped = (reason) =>
    renderToString(
      createElement(EndScreen, {
        reason,
        fileName: 'x.thinktwice',
        seal: async () => ({ ok: false, error: 'network' }),
        onReturn: () => {},
        onExit: () => {},
        safetyStop: true,
      })
    ).replace(/<!-- -->/g, '');

  it('keeps the help line on screen, word for word as the stop said it', async () => {
    const { HELP_LINE, preCheck } = await import('../../src/safety/index.js');
    expect(preCheck('אני רוצה למות').stopMessage).toContain(HELP_LINE);
    for (const reason of ['complete', 'leave']) {
      expect(renderStopped(reason)).toContain(HELP_LINE.replace(/"/g, '&quot;'));
    }
  });

  it('does not close by itself', () => {
    const html = renderStopped('leave');
    expect(html).toContain('המסך לא ייסגר מעצמו');
    expect(html).not.toContain('המסך ייסגר בעוד');
  });

  it('a file saved after a stop opens for reading only', () => {
    expect(app).toMatch(/const stopped = Boolean\(meta\.safetyFlag\)/);
    expect(app).toMatch(/viewOnly && \(complete \|\| stopped\)/);
  });
});
