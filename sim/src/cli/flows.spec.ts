import { describe, it, expect } from 'vitest';
import { scriptedPrompter } from './prompt-scripted';
import {
  browseFlow,
  campaignFlow,
  evalFlow,
  evalSpecFromConfig,
  mainMenu,
  optimizeFlow,
  rescoreFlow,
  type FlowDeps,
} from './flows';
import { defaultConfig } from './config';
import type { BrowseInfo, CliEngine, EvalLine, EvalSpec } from './engine';
import type { CliIo } from './report-io';
import type { RunReport } from '../opt/reports';

// --- fakes -----------------------------------------------------------------

function fakeReport(runKey = 'rk'): RunReport {
  return {
    version: 1,
    runKey,
    config: { level: 5, role: 'equal' },
    objectiveNames: ['reliability', 'offense', 'survival', 'efficiency', 'control', 'support'],
    objectiveBounds: {},
    weights: {},
    paretoFront: [],
    leaderboard: [
      {
        key: 'g1',
        rank: 0,
        genome: {} as RunReport['leaderboard'][number]['genome'],
        description: 'barbarian hero',
        metrics: {
          winRate: 0.6,
          avgDamageDealt: 42,
          avgHpFracRetained: 0.5,
          avgRounds: 4,
          runs: 10,
        },
        objectives: {
          reliability: 1,
          offense: 2,
          survival: 1,
          efficiency: 1,
          control: 0,
          support: 0,
        },
        weightedScore: 0.55,
      },
    ],
  } as unknown as RunReport;
}

interface Recorder {
  optimizeCfg?: ReturnType<typeof defaultConfig>;
  evalSpec?: EvalSpec;
  annotatedLevel?: number;
  browsedLevel?: number;
}

function fakeDeps(rec: Recorder): FlowDeps {
  const engine: CliEngine = {
    optimize: (cfg) => {
      rec.optimizeCfg = cfg;
      return fakeReport('opt');
    },
    evalBuild: (spec): EvalLine => {
      rec.evalSpec = spec;
      return {
        description: `L${spec.level} ${spec.classSlug}`,
        context: spec.context,
        winRate: 0.42,
        winRateCi: [0.3, 0.55],
        objectives: {
          reliability: 0.42,
          offense: 30,
          survival: 0.2,
          efficiency: -29,
          control: 0,
          support: spec.context === 'party' ? 12 : 0,
        },
        runs: spec.runs,
      };
    },
    annotateCampaign: (report, level) => {
      rec.annotatedLevel = level;
      return {
        ...report,
        leaderboard: report.leaderboard.map((e) => ({ ...e, campaignDayWinRate: 0.33 })),
      };
    },
    browse: (level): BrowseInfo => {
      rec.browsedLevel = level;
      return {
        level,
        classes: [{ slug: 'fighter', subclass: 'Champion', kind: 'martial' }],
        roles: [{ name: 'tank', weights: { survival: 3 } }],
        scenarios: [{ id: 'goblins', difficulty: 'medium', shape: 'open', enemies: 3 }],
      };
    },
    weaponNames: () => ['Greatsword', 'Longbow'],
  };

  const store = new Map<string, RunReport>([['sim/out/saved.json', fakeReport('saved')]]);
  const io: CliIo = {
    writeReport: (report, dir) => `${dir}/${report.runKey}.json`,
    listReports: () => [...store.keys()].map((p) => p.split('/').pop() as string),
    readReport: (path) => store.get(path) ?? fakeReport(),
  };

  return { engine, io, seedGen: () => 999 };
}

// --- tests -----------------------------------------------------------------

describe('optimizeFlow', () => {
  it('walks the config screens and runs with the chosen values', async () => {
    const rec: Recorder = {};
    const deps = fakeDeps(rec);
    // level=3, role=equal, classes=blank(all), preset=quick, customGA=n,
    // campaign=n, seed=7, out=sim/out, confirm=Run
    const p = scriptedPrompter(['1', '1', '', '1', 'n', 'n', '7', 'sim/out', '1']);
    await optimizeFlow(p, deps, defaultConfig(5));
    expect(rec.optimizeCfg?.level).toBe(3);
    expect(rec.optimizeCfg?.role).toBe('equal');
    expect(rec.optimizeCfg?.classes).toEqual([]);
    expect(rec.optimizeCfg?.ga.populationSize).toBe(16); // quick
    expect(rec.optimizeCfg?.campaign).toBe(false);
    expect(rec.optimizeCfg?.seed).toBe(7);
    expect(p.output.join('\n')).toContain('Top builds — L3, equal (seed 7)');
    expect(p.output.join('\n')).toContain('barbarian hero');
    expect(p.output.join('\n')).toContain('wrote sim/out/opt.json');
  });

  it('cancels without running', async () => {
    const rec: Recorder = {};
    const p = scriptedPrompter(['2', '1', '', '2', 'n', 'n', '1', 'sim/out', '3']); // confirm=Cancel
    await optimizeFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(rec.optimizeCfg).toBeUndefined();
    expect(p.output.join('\n')).toContain('cancelled');
  });

  it('lets the custom-GA path override the numbers', async () => {
    const rec: Recorder = {};
    // level=5, role=equal, classes=blank, preset=standard, customGA=y, pop=40,
    // gens=5, runs=9, mut=0.5, campaign=n, seed=1, out=sim/out, Run
    const p = scriptedPrompter([
      '2',
      '1',
      '',
      '2',
      'y',
      '40',
      '5',
      '9',
      '0.5',
      'n',
      '1',
      'sim/out',
      '1',
    ]);
    await optimizeFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(rec.optimizeCfg?.ga).toEqual({
      populationSize: 40,
      generations: 5,
      evalRuns: 9,
      mutationRate: 0.5,
    });
  });
});

describe('evalFlow', () => {
  it('builds a solo spec from the screens', async () => {
    const rec: Recorder = {};
    // level=5, class=fighter, context=solo, role=equal, runs=blank(16), seed=3, override=n
    const p = scriptedPrompter(['2', '1', '1', '1', '', '3', 'n']);
    await evalFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(rec.evalSpec).toMatchObject({
      level: 5,
      classSlug: 'fighter',
      context: 'solo',
      seed: 3,
      runs: 16,
    });
    expect(p.output.join('\n')).toContain('L5 fighter');
    expect(p.output.join('\n')).toContain('win 0.42');
  });

  it('collects gear overrides for a martial class', async () => {
    const rec: Recorder = {};
    // level=5, class=fighter, context=solo, role=equal, runs=blank, seed=1,
    // override=y, weapon=Longbow(#3, after "(default)"), shield=n, two-handed=y, style=great-weapon(#3)
    const p = scriptedPrompter(['2', '1', '1', '1', '', '1', 'y', '3', 'n', 'y', '3']);
    await evalFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(rec.evalSpec?.weaponName).toBe('Longbow');
    expect(rec.evalSpec?.twoHanded).toBe(true);
    expect(rec.evalSpec?.fightingStyle).toBe('great-weapon');
  });
});

describe('campaignFlow + rescoreFlow', () => {
  it('annotates a saved report', async () => {
    const rec: Recorder = {};
    const p = scriptedPrompter(['1']); // pick the one saved report
    await campaignFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(rec.annotatedLevel).toBe(5);
    expect(p.output.join('\n')).toContain('camp');
    expect(p.output.join('\n')).toContain('wrote');
  });

  it('rescores a saved report under a new role', async () => {
    const rec: Recorder = {};
    const p = scriptedPrompter(['1', '3']); // report, then role index 3
    await rescoreFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(p.output.join('\n')).toContain('Rescored for');
  });

  it('reports when no saved reports exist', async () => {
    const deps = fakeDeps({});
    const empty: FlowDeps = { ...deps, io: { ...deps.io, listReports: () => [] } };
    const p = scriptedPrompter([]);
    await campaignFlow(p, empty, defaultConfig(5));
    expect(p.output.join('\n')).toContain('no saved reports');
  });
});

describe('browseFlow + mainMenu', () => {
  it('lists classes at a level', async () => {
    const rec: Recorder = {};
    const p = scriptedPrompter(['2', '1']); // level=5, classes
    await browseFlow(p, fakeDeps(rec), defaultConfig(5));
    expect(rec.browsedLevel).toBe(5);
    expect(p.output.join('\n')).toContain('fighter');
    expect(p.output.join('\n')).toContain('Champion');
  });

  it('runs browse from the main menu then quits', async () => {
    const rec: Recorder = {};
    // main=browse(#5), level=5, scenarios(#3), main=quit(#6)
    const p = scriptedPrompter(['5', '2', '3', '6']);
    await mainMenu(p, fakeDeps(rec), defaultConfig(5));
    expect(p.output.join('\n')).toContain('goblins');
    expect(p.output.join('\n')).toContain('bye');
  });
});

describe('evalSpecFromConfig (flags path)', () => {
  it('requires a class and reads context/runs flags', () => {
    const cfg = defaultConfig(11);
    const spec = evalSpecFromConfig(cfg, {
      class: 'rogue',
      context: 'party',
      runs: '8',
      shield: true,
    });
    expect(spec).toMatchObject({
      level: 11,
      classSlug: 'rogue',
      context: 'party',
      runs: 8,
      shield: true,
    });
  });

  it('defaults runs by context and throws on a missing/bad class', () => {
    expect(evalSpecFromConfig(defaultConfig(5), { class: 'monk' }).runs).toBe(16);
    expect(evalSpecFromConfig(defaultConfig(5), { class: 'monk', context: 'party' }).runs).toBe(12);
    expect(() => evalSpecFromConfig(defaultConfig(5), {})).toThrow(/--class/);
    expect(() => evalSpecFromConfig(defaultConfig(5), { class: 'goblin' })).toThrow(
      /unknown class/,
    );
  });
});
