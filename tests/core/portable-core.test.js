// Principle 4 — the core is portable: no UI, no platform, no bundler.
//
// CLAUDE.md recorded it as knowingly violated: promptBuilder.js and judge.js
// imported .md files with Vite's `?raw`, and session.js imported the browser's
// model adapter, which reads Vite's import.meta.env. Plain Node could not load the
// core at all, so it could not run on a server, in a simulation, or for a second
// interview without the first one's texts welded in.
//
// The fix injects all three (createEngine: pack, prompts, complete). This file
// keeps it fixed, in two layers, because either alone has a hole:
//
//   the scan   reads every core file for a forbidden import or platform API. It
//              cannot see what a core file reaches THROUGH another module.
//   the run    loads every core module and runs a whole turn in a plain Node
//              process, under a resolve hook that throws the moment ANY import in
//              the graph — direct, transitive, dynamic, executed mid-turn —
//              resolves into src/adapters/ or src/ui/, or asks for `?raw`.
//
// The run alone used to be the second layer, without the hook, and router-guard
// showed on 8.10.2026 that it proved less than it claimed: the model adapter reads
// import.meta.env only when called, so it LOADS in plain Node, and a core that
// imported it — directly, dynamically, or through content/signposting.js — passed.
// The hook closes that, and the control test at the bottom proves the hook bites.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(__dirname, '../..');
const CORE = join(ROOT, 'src/core');
const url = (p) => pathToFileURL(join(ROOT, p)).href;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
const coreFiles = walk(CORE);

// The code of a file without its comments, so a comment that EXPLAINS why `?raw`
// left (several do) is not mistaken for the thing itself.
function code(file) {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

// Static, dynamic and side-effect imports alike: `from '…'`, `import('…')`, `import '…'`.
const PLATFORM_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"][^'"]*\/(adapters|ui)\//;

describe('the scan: no core file imports a platform', () => {
  it('finds the core', () => {
    const names = coreFiles.map((f) => relative(CORE, f));
    expect(names).toContain('session.js');
    expect(names).toContain('engine.js');
  });

  for (const file of coreFiles) {
    it(`${relative(ROOT, file)}: no ?raw, import.meta, adapter/UI import or browser API`, () => {
      const c = code(file);
      expect(c).not.toMatch(/['"][^'"]*\?raw['"]/);
      expect(c).not.toMatch(/import\.meta/);
      expect(c).not.toMatch(PLATFORM_IMPORT);
      expect(c).not.toMatch(/\b(window|document)\.|\b(localStorage|sessionStorage)\b/);
    });
  }
});

// Loaded into the child process with module.register. Everything the child
// imports after registering passes through `resolve`.
const HOOKS = `
export async function resolve(specifier, context, next) {
  if (specifier.includes('?raw')) {
    throw new Error('PORTABILITY ' + context.parentURL + ' imports ' + specifier);
  }
  const r = await next(specifier, context);
  if (/\\/src\\/(adapters|ui)\\//.test(r.url)) {
    throw new Error('PORTABILITY ' + context.parentURL + ' reaches ' + r.url);
  }
  return r;
}`;

// A plain Node process — no Vite, no vitest transform, none of the runner's
// environment — with the hook armed before anything from the project loads.
function plainNode(body) {
  const script = `
    import { register } from 'node:module';
    register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(HOOKS)}));
    ${body}
  `;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('the run: the core works in plain Node, and reaches no platform', () => {
  it('loads every core module and runs a turn with texts and a model it has never seen', () => {
    const out = plainNode(`
      for (const f of ${JSON.stringify(coreFiles.map((f) => pathToFileURL(f).href))}) await import(f);
      const { createEngine } = await import(${JSON.stringify(url('src/core/engine.js'))});
      const { buildJudgePrompt } = await import(${JSON.stringify(url('src/core/judge.js'))});
      const { thinkTwiceAdult } = await import(${JSON.stringify(url('src/packs/think-twice-adult/pack.js'))});
      const t = (k) => '[' + k + ']';
      const prompts = {
        guidelines: {
          super: '<!-- @identity required -->\\n<!-- @rules -->\\n[super]\\n',
          specific: '<!-- @identity -->\\n[identity]\\n',
        },
        resistance: t('resistance'), evaluator: t('evaluator'),
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
      // The turn runs under the hook too, so an import executed mid-turn is caught.
      const { nextState, reply } = await engine.runTurn(engine.createState(), [], 'קרה משהו בעבודה');
      console.log(JSON.stringify({
        reply,
        trigger: nextState.coverage.stage1.trigger,
        calls,
        judge: buildJudgePrompt(prompts),
      }));
    `);
    const result = JSON.parse(out.trim().split('\n').pop());
    expect(result.reply).toBe('ומה קרה אז?');
    expect(result.trigger).toBe(1);
    // The texts the model received are the ones handed in, not Think Twice's.
    const probe = result.calls.find((c) => c.mode === 'probe');
    // The super file and the interview's own, composed — markers gone.
    expect(probe.sys).toContain('[identity]\n[super]');
    expect(probe.sys).not.toContain('<!--');
    expect(probe.sys).toContain('[stage1]');
    expect(probe.sys).toContain('[forbidden]');
    expect(result.judge).toBe('[judge]');
  });

  // The controls: a guard that never fires proves nothing. Each loads, under the
  // same hook, something that does what the core must not — and must fail naming it.
  const failureOf = (body) => {
    try {
      plainNode(body);
    } catch (e) {
      return String(e.stderr ?? e.message);
    }
    return '';
  };

  it('control: a module that imports the model adapter is caught', () => {
    // A module that is neither in src/adapters nor in src/ui, importing the adapter
    // — the shape router-guard used to slip one past the old test.
    const reachesAdapter = `import ${JSON.stringify(url('src/adapters/model.js'))};`;
    const failure = failureOf(
      `await import('data:text/javascript,' + encodeURIComponent(${JSON.stringify(reachesAdapter)}));`
    );
    expect(failure).toMatch(/PORTABILITY .* reaches .*src\/adapters\/model\.js/);
  });

  it('control: a module that loads a text with ?raw is caught', () => {
    // The pack's own Vite loader — right for the browser, never for the core.
    const failure = failureOf(`await import(${JSON.stringify(url('src/packs/think-twice-adult/prompts.js'))});`);
    expect(failure).toMatch(/PORTABILITY .* imports .*\?raw/);
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

  it('without the interviewer guidelines', () => {
    const { guidelines, ...rest } = thinkTwiceAdultPrompts;
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts: rest, complete })).toThrow(/guidelines/);
  });

  // The specific file beats the super file — except where the super file locks a
  // rule. One directed question per turn is a hard rule for every interview.
  it('with a specific file that overrides a locked rule', () => {
    const { guidelines } = thinkTwiceAdultPrompts;
    const prompts = {
      ...thinkTwiceAdultPrompts,
      guidelines: { ...guidelines, specific: guidelines.specific + '<!-- @one-question -->\nשתי שאלות זה בסדר.\n' },
    };
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts, complete })).toThrow(/locked/);
  });

  it('with a specific file that does not say who the interview is', () => {
    const { guidelines } = thinkTwiceAdultPrompts;
    const prompts = { ...thinkTwiceAdultPrompts, guidelines: { ...guidelines, specific: '<!-- @extra -->\nx\n' } };
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts, complete })).toThrow(/identity/);
  });

  it('with an empty blacklist', () => {
    const prompts = { ...thinkTwiceAdultPrompts, forbidden: [] };
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts, complete })).toThrow(/forbidden/);
  });

  it('without the registrar text while the registrar is on', async () => {
    const { REGISTRAR_ENABLED } = await import('../../src/core/promptBuilder.js');
    const { registrar, ...rest } = thinkTwiceAdultPrompts;
    const attempt = () => createEngine({ pack: thinkTwiceAdult, prompts: rest, complete });
    if (REGISTRAR_ENABLED) expect(attempt).toThrow(/registrar/);
    else expect(attempt).not.toThrow();
  });

  it('with a text for a stage the pack does not have', () => {
    const prompts = { ...thinkTwiceAdultPrompts, stages: { ...thinkTwiceAdultPrompts.stages, stage8: 'x' } };
    expect(() => createEngine({ pack: thinkTwiceAdult, prompts, complete })).toThrow(/stage8/);
  });

  it('on a pack this engine cannot run yet', () => {
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

  // Safety comes before everything, the dependencies included: an acute-distress
  // message reaches the safe stop even from a caller that composed nothing.
  it('but the safety stop needs no dependencies at all', async () => {
    const { runTurn } = await import('../../src/core/session.js');
    const { createState } = await import('../../src/core/state.js');
    const { Decision } = await import('../../src/core/router.js');
    const { decision } = await runTurn(createState(), [], 'אני רוצה למות');
    expect(decision).toBe(Decision.SAFETY_STOP);
  });
});

// The browser build composes the interview in one place; the tests run that same
// object (tests/helpers/engine.js), so this pins what it is composed of.
describe('the browser composition', async () => {
  const { interview } = await import('../../src/ui/interview.js');
  const { thinkTwiceAdult } = await import('../../src/packs/think-twice-adult/pack.js');
  const { thinkTwiceAdultPrompts } = await import('../../src/packs/think-twice-adult/prompts.js');

  it('runs Think Twice with its own texts', () => {
    expect(interview.pack).toBe(thinkTwiceAdult);
    expect(interview.prompts).toBe(thinkTwiceAdultPrompts);
  });

  it('ships no judge rubric to the browser', () => {
    expect(interview.prompts.judge).toBeUndefined();
  });
});
