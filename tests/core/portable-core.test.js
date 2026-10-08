// Principle 4 — the core is portable: no UI, no platform, no bundler.
//
// CLAUDE.md recorded it as knowingly violated: promptBuilder.js and judge.js
// imported .md files with Vite's `?raw`, and session.js imported the browser's
// model adapter, which reads Vite's import.meta.env. Plain Node could not load the
// core at all, so it could not run on a server, in a simulation, or for a second
// interview without the first one's texts welded in.
//
// The fix injects all three (createEngine: pack, prompts, complete). This file
// keeps it fixed two ways: a scan of the source, and a real turn run in a plain
// Node process — no Vite, no vitest transform — with texts and a model call made
// up on the spot, which is also the proof that the engine is not tied to Think
// Twice's texts.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(__dirname, '../..');
const CORE = join(ROOT, 'src/core');
const coreFiles = readdirSync(CORE).filter((f) => f.endsWith('.js'));

// The code of a file without its comments, so a comment that EXPLAINS why `?raw`
// left (several do) is not mistaken for the thing itself.
function code(file) {
  const src = readFileSync(join(CORE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('the core imports no platform', () => {
  it('finds the core', () => {
    expect(coreFiles).toContain('session.js');
    expect(coreFiles).toContain('engine.js');
  });

  for (const file of coreFiles) {
    it(`${file}: no ?raw, no import.meta, no adapter or UI import`, () => {
      const c = code(file);
      expect(c).not.toMatch(/\?raw['"]/);
      expect(c).not.toMatch(/import\.meta/);
      expect(c).not.toMatch(/from\s+['"]\.\.\/(adapters|ui)\//);
    });
  }
});

describe('the core runs in plain Node', () => {
  it('composes an engine and runs a turn with texts and a model it has never seen', () => {
    const url = (p) => pathToFileURL(join(ROOT, p)).href;
    const script = `
      const { createEngine } = await import(${JSON.stringify(url('src/core/engine.js'))});
      const { buildJudgePrompt } = await import(${JSON.stringify(url('src/core/judge.js'))});
      const { thinkTwiceAdult } = await import(${JSON.stringify(url('src/packs/think-twice-adult/pack.js'))});
      const t = (k) => '[' + k + ']';
      const prompts = {
        persona: t('persona'), resistance: t('resistance'), evaluator: t('evaluator'),
        registrar: t('registrar'), summary: t('summary'), opener: t('opener'),
        board: t('board'), judge: t('judge'), forbidden: ['[forbidden]'],
        stages: Object.fromEntries(thinkTwiceAdult.stages.map((s) => [s.key, t(s.key)])),
      };
      const calls = [];
      const complete = async (req) => {
        const sys = typeof req.systemPrompt === 'string' ? req.systemPrompt : req.systemPrompt.stable;
        calls.push({ mode: req.mode ?? 'probe', sys });
        return req.mode === 'registrar'
          ? { ok: true, raw: '{}' }
          : { ok: true, message: 'ומה קרה אז?', evaluation: { slots: { trigger: 1 } } };
      };
      const engine = createEngine({ pack: thinkTwiceAdult, prompts, complete });
      const { nextState, reply } = await engine.runTurn(engine.createState(), [], 'קרה משהו בעבודה');
      console.log(JSON.stringify({
        reply,
        trigger: nextState.coverage.stage1.trigger,
        calls,
        judge: buildJudgePrompt(prompts),
      }));
    `;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      encoding: 'utf8',
      // Nothing from the test runner: a plain Node, as a server would start it.
      env: { PATH: process.env.PATH },
    });
    const result = JSON.parse(out.trim().split('\n').pop());
    expect(result.reply).toBe('ומה קרה אז?');
    expect(result.trigger).toBe(1);
    // The texts the model received are the ones handed in, not Think Twice's.
    const probe = result.calls.find((c) => c.mode === 'probe');
    expect(probe.sys).toContain('[persona]');
    expect(probe.sys).toContain('[stage1]');
    expect(probe.sys).toContain('[forbidden]');
    expect(result.judge).toBe('[judge]');
  });
});

describe('the engine refuses an incomplete composition', async () => {
  const { createEngine } = await import('../../src/core/engine.js');
  const { thinkTwiceAdult } = await import('../../src/packs/think-twice-adult/pack.js');
  const { thinkTwiceAdultPrompts } = await import('../../src/packs/think-twice-adult/prompts.js');
  const complete = async () => ({ ok: true });

  it('without a model call', () => {
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts: thinkTwiceAdultPrompts })).toThrow(/complete/);
  });

  it('without a stage agent', () => {
    const { stage4, ...stages } = thinkTwiceAdultPrompts.stages;
    expect(() =>
      createEngine({ pack: thinkTwiceAdult, prompts: { ...thinkTwiceAdultPrompts, stages }, complete })
    ).toThrow(/stage4/);
  });

  it('without the persona', () => {
    const { persona, ...rest } = thinkTwiceAdultPrompts;
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts: rest, complete })).toThrow(/persona/);
  });

  it('with a text for a stage the pack does not have', () => {
    const prompts = { ...thinkTwiceAdultPrompts, stages: { ...thinkTwiceAdultPrompts.stages, stage8: 'x' } };
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts, complete })).toThrow(/stage8/);
  });

  it('on a pack this engine cannot run yet', async () => {
    const mini = JSON.parse(JSON.stringify(thinkTwiceAdult));
    mini.stages = mini.stages.slice(0, 6).map((s, i) => ({ ...s, key: `stage${i + 1}` }));
    mini.stages[5] = { ...thinkTwiceAdult.stages[6], key: 'stage6', requires: ['stage5'] };
    mini.stages[4] = { ...mini.stages[4], components: [{ type: 'collector' }] };
    expect(() => createEngine({ pack: mini, prompts: thinkTwiceAdultPrompts, complete })).toThrow(/7 stages/);
  });

  it('and a direct runTurn without its dependencies says how to fix it', async () => {
    const { runTurn } = await import('../../src/core/session.js');
    const { createState } = await import('../../src/core/state.js');
    await expect(runTurn(createState(), [], 'שלום')).rejects.toThrow(/createEngine/);
  });
});
