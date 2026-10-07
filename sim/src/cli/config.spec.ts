import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyFlags,
  defaultConfig,
  formatSummary,
  GA_PRESETS,
  nsga2OptionsFrom,
  parseArgs,
  presetForLevel,
  weightsFrom,
} from './config';
import { writeReport } from './report-io';
import type { RunReport } from '../opt/reports';

describe('parseArgs', () => {
  it('reads --key value pairs and bare --flags', () => {
    expect(parseArgs(['--level', '11', '--campaign', '--role', 'tank'])).toEqual({
      level: '11',
      campaign: true,
      role: 'tank',
    });
  });

  it('ignores a leading positional (the mode token is stripped by the caller)', () => {
    expect(parseArgs(['--seed', '7'])).toEqual({ seed: '7' });
  });

  it('treats a trailing flag with no value as a boolean', () => {
    expect(parseArgs(['--campaign'])).toEqual({ campaign: true });
  });
});

describe('applyFlags', () => {
  const base = defaultConfig(5);

  it('overlays valid flags', () => {
    const cfg = applyFlags(base, {
      level: '11',
      role: 'controller',
      classes: 'wizard,cleric',
      campaign: true,
      seed: '3',
      out: '/tmp/runs',
    });
    expect(cfg.level).toBe(11);
    expect(cfg.role).toBe('controller');
    expect(cfg.classes).toEqual(['wizard', 'cleric']);
    expect(cfg.campaign).toBe(true);
    expect(cfg.seed).toBe(3);
    expect(cfg.outDir).toBe('/tmp/runs');
  });

  it('scales the effort preset to the level when it was left at the default', () => {
    expect(applyFlags(base, { level: '17' }).ga).toBe(GA_PRESETS.thorough);
    expect(applyFlags(base, { level: '3' }).ga).toBe(GA_PRESETS.standard);
  });

  it('keeps an explicit preset even when the level would scale it', () => {
    const cfg = applyFlags(base, { preset: 'quick', level: '17' });
    expect(cfg.ga).toBe(GA_PRESETS.quick);
  });

  it('applies raw GA overrides on top of the preset', () => {
    const cfg = applyFlags(base, { preset: 'quick', pop: '40', gens: '5' });
    expect(cfg.ga.populationSize).toBe(40);
    expect(cfg.ga.generations).toBe(5);
    expect(cfg.ga.evalRuns).toBe(GA_PRESETS.quick.evalRuns);
  });

  it('rejects a bad level, role, class, preset, GA number and seed', () => {
    expect(() => applyFlags(base, { level: '4' })).toThrow(/--level/);
    expect(() => applyFlags(base, { role: 'nope' })).toThrow(/--role/);
    expect(() => applyFlags(base, { classes: 'wizard,goblin' })).toThrow(/goblin/);
    expect(() => applyFlags(base, { preset: 'turbo' })).toThrow(/--preset/);
    expect(() => applyFlags(base, { pop: '-2' })).toThrow(/--pop/);
    expect(() => applyFlags(base, { seed: '1.5' })).toThrow(/--seed/);
  });
});

describe('weightsFrom', () => {
  it('maps equal to equal weights and a role to its preset', () => {
    const equal = weightsFrom('equal');
    const vals = Object.values(equal);
    expect(vals.every((v) => v === vals[0])).toBe(true);
    expect(weightsFrom('tank')['survival']).toBeGreaterThan(weightsFrom('tank')['offense']);
  });

  it('throws on an unknown role', () => {
    expect(() => weightsFrom('nope')).toThrow(/unknown role/);
  });
});

describe('nsga2OptionsFrom', () => {
  it('passes the GA numbers through and omits an empty class pool', () => {
    const opts = nsga2OptionsFrom(defaultConfig(5));
    expect(opts.populationSize).toBe(GA_PRESETS.standard.populationSize);
    expect(opts.eval?.runs).toBe(GA_PRESETS.standard.evalRuns);
    expect(opts.classes).toBeUndefined();
  });

  it('forwards a restricted class pool', () => {
    const cfg = { ...defaultConfig(5), classes: ['rogue'] as const };
    expect(nsga2OptionsFrom(cfg).classes).toEqual(['rogue']);
  });
});

describe('presetForLevel', () => {
  it('uses thorough at high levels and standard below', () => {
    expect(presetForLevel(17)).toBe(GA_PRESETS.thorough);
    expect(presetForLevel(11)).toBe(GA_PRESETS.thorough);
    expect(presetForLevel(5)).toBe(GA_PRESETS.standard);
  });
});

function entry(over: Partial<RunReport['leaderboard'][number]> = {}) {
  return {
    genomeKey: 'k',
    description: 'barbarian hero',
    metrics: { winRate: 0.6, avgDamageDealt: 42, avgDamageTaken: 10, avgRoundsToWin: 4 },
    objectives: { reliability: 1, offense: 2, survival: 1, efficiency: 1, control: 0, support: 0 },
    weightedScore: 0.55,
    ...over,
  } as RunReport['leaderboard'][number];
}

function report(entries: RunReport['leaderboard']): RunReport {
  return {
    runKey: 'L5-equal-standard',
    level: 5,
    role: 'equal',
    objectiveNames: ['reliability', 'offense', 'survival', 'efficiency', 'control', 'support'],
    objectiveBounds: [],
    leaderboard: entries,
  } as unknown as RunReport;
}

describe('formatSummary', () => {
  it('shows base columns and hides control/support/campaign when all zero/absent', () => {
    const text = formatSummary(report([entry(), entry({ description: 'rogue hero' })]));
    const head = text.split('\n')[0];
    expect(head).toContain('build');
    expect(head).toContain('win');
    expect(head).not.toContain('ctrl');
    expect(head).not.toContain('supp');
    expect(head).not.toContain('camp');
    expect(text).toContain('barbarian hero');
  });

  it('adds control/support/campaign columns when any row carries them', () => {
    const text = formatSummary(
      report([
        entry({
          objectives: {
            reliability: 1,
            offense: 1,
            survival: 1,
            efficiency: 1,
            control: 2.5,
            support: 1.5,
          },
          campaignDayWinRate: 0.7,
        }),
      ]),
    );
    const head = text.split('\n')[0];
    expect(head).toContain('ctrl');
    expect(head).toContain('supp');
    expect(head).toContain('camp');
  });

  it('respects the row limit', () => {
    const many = Array.from({ length: 15 }, (_, i) => entry({ description: `b${i}` }));
    const text = formatSummary(report(many), 3);
    // header + 3 rows
    expect(text.split('\n')).toHaveLength(4);
  });
});

describe('writeReport', () => {
  it('writes the report JSON under the run key and round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sim-cli-'));
    const r = report([entry()]);
    const path = writeReport(r, dir);
    expect(path).toBe(join(dir, 'L5-equal-standard.json'));
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.runKey).toBe('L5-equal-standard');
    expect(parsed.leaderboard[0].description).toBe('barbarian hero');
  });
});
