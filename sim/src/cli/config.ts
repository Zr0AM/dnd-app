// Pure configuration for an optimization run: the RunConfig the menus build and the
// flags set, the mapping to engine options, and the stdout summary formatter. No I/O
// and no prompts here, so every piece is unit-tested directly; the menu flow and the
// file writer live elsewhere.

import { BUILD_CLASSES, type BuildClass } from '../opt/genome';
import { ROLE_WEIGHTS, roleWeights, type RoleWeights } from '../opt/roles';
import { equalWeights } from '../opt/reports';
import type { Nsga2Options } from '../opt/nsga2';
import type { RunReport } from '../opt/reports';

export const LEVELS = [3, 5, 11, 17] as const;
export type Level = (typeof LEVELS)[number];

/** Role weighting the leaderboard is scored by: a ROLE_WEIGHTS key, or equal weights. */
export const ROLE_CHOICES = ['equal', ...Object.keys(ROLE_WEIGHTS)] as const;

export interface GaParams {
  readonly populationSize: number;
  readonly generations: number;
  readonly evalRuns: number;
  readonly mutationRate: number;
}

/** Effort presets that expand to raw GA numbers. */
export const GA_PRESETS: Readonly<Record<'quick' | 'standard' | 'thorough', GaParams>> = {
  quick: { populationSize: 16, generations: 6, evalRuns: 8, mutationRate: 0.3 },
  standard: { populationSize: 32, generations: 12, evalRuns: 12, mutationRate: 0.3 },
  thorough: { populationSize: 64, generations: 24, evalRuns: 20, mutationRate: 0.3 },
};

export interface RunConfig {
  readonly level: Level;
  readonly role: string;
  /** Genome class pool; empty means all classes. */
  readonly classes: readonly BuildClass[];
  readonly ga: GaParams;
  /** Also score each reported build's adventuring-day win rate (slower). */
  readonly campaign: boolean;
  readonly seed: number;
  readonly outDir: string;
}

/** A sensible default config for a level (standard effort, equal weights, all classes). */
export function defaultConfig(level: Level = 5): RunConfig {
  return {
    level,
    role: 'equal',
    classes: [],
    ga: GA_PRESETS.standard,
    campaign: false,
    seed: 1,
    outDir: 'sim/out',
  };
}

/** The objective weights a role implies (equal weights for 'equal'). */
export function weightsFrom(role: string): RoleWeights {
  return role === 'equal' ? equalWeights() : roleWeights(role);
}

/** Map a config to NSGA-II options. */
export function nsga2OptionsFrom(config: RunConfig): Nsga2Options {
  return {
    populationSize: config.ga.populationSize,
    generations: config.ga.generations,
    mutationRate: config.ga.mutationRate,
    eval: { runs: config.ga.evalRuns },
    classes: config.classes.length ? config.classes : undefined,
  };
}

const isLevel = (n: number): n is Level => (LEVELS as readonly number[]).includes(n);
const isBuildClass = (s: string): s is BuildClass =>
  (BUILD_CLASSES as readonly string[]).includes(s);

/** Parse `--key value` / `--flag` argv (after the mode token) into a plain map. */
export function parseArgs(args: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const nextIsValue = i + 1 < args.length && !args[i + 1].startsWith('--');
    if (nextIsValue) {
      out[key] = args[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** Overlay parsed flags onto a base config, validating as we go (throws on bad input). */
export function applyFlags(base: RunConfig, flags: Record<string, string | boolean>): RunConfig {
  let cfg = base;
  const level = flags['level'];
  if (level !== undefined) {
    const lvl = Number(level);
    if (!isLevel(lvl)) throw new Error(`--level must be one of ${LEVELS.join(', ')}`);
    cfg = { ...cfg, level: lvl, ga: cfg.ga === base.ga ? presetForLevel(lvl) : cfg.ga };
  }
  const role = flags['role'];
  if (typeof role === 'string') {
    if (!(ROLE_CHOICES as readonly string[]).includes(role)) {
      throw new Error(`--role must be one of ${ROLE_CHOICES.join(', ')}`);
    }
    cfg = { ...cfg, role };
  }
  const classes = flags['classes'];
  if (typeof classes === 'string') {
    const list = classes.split(',').map((s) => s.trim());
    const bad = list.filter((s) => !isBuildClass(s));
    if (bad.length) throw new Error(`unknown class(es): ${bad.join(', ')}`);
    cfg = { ...cfg, classes: list as BuildClass[] };
  }
  const preset = flags['preset'];
  if (typeof preset === 'string') {
    const p = GA_PRESETS[preset as keyof typeof GA_PRESETS];
    if (!p) throw new Error(`--preset must be quick, standard or thorough`);
    cfg = { ...cfg, ga: p };
  }
  const gaNum = (key: 'pop' | 'gens' | 'runs' | 'mutation', field: keyof GaParams) => {
    const raw = flags[key];
    if (raw !== undefined) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`--${key} must be a non-negative number`);
      cfg = { ...cfg, ga: { ...cfg.ga, [field]: n } };
    }
  };
  gaNum('pop', 'populationSize');
  gaNum('gens', 'generations');
  gaNum('runs', 'evalRuns');
  gaNum('mutation', 'mutationRate');
  const campaign = flags['campaign'];
  if (campaign !== undefined) cfg = { ...cfg, campaign: campaign !== false };
  const seed = flags['seed'];
  if (seed !== undefined) {
    const n = Number(seed);
    if (!Number.isInteger(n)) throw new Error('--seed must be an integer');
    cfg = { ...cfg, seed: n };
  }
  const out = flags['out'];
  if (typeof out === 'string') cfg = { ...cfg, outDir: out };
  return cfg;
}

/** Scale the default GA effort to the level (higher levels want a touch more search). */
export function presetForLevel(level: Level): GaParams {
  return level >= 11 ? GA_PRESETS.thorough : GA_PRESETS.standard;
}

/** A compact, human-readable leaderboard table for stdout. */
export function formatSummary(report: RunReport, limit = 10): string {
  const rows = report.leaderboard.slice(0, limit);
  const showControl = rows.some((r) => (r.objectives['control'] ?? 0) > 0);
  const showSupport = rows.some((r) => (r.objectives['support'] ?? 0) > 0);
  const showCampaign = rows.some((r) => r.campaignDayWinRate !== undefined);
  const header = ['#', 'build', 'score', 'win', 'dmg'];
  if (showControl) header.push('ctrl');
  if (showSupport) header.push('supp');
  if (showCampaign) header.push('camp');

  const lines = rows.map((r, i) => {
    const cells = [
      String(i + 1),
      r.description,
      r.weightedScore.toFixed(2),
      r.metrics.winRate.toFixed(2),
      r.metrics.avgDamageDealt.toFixed(0),
    ];
    if (showControl) cells.push((r.objectives['control'] ?? 0).toFixed(1));
    if (showSupport) cells.push((r.objectives['support'] ?? 0).toFixed(1));
    if (showCampaign) cells.push(r.campaignDayWinRate!.toFixed(2));
    return cells;
  });

  const widths = header.map((h, c) => Math.max(h.length, ...lines.map((l) => l[c].length)));
  const fmt = (cells: string[]) =>
    cells
      .map((cell, c) => (c === 1 ? cell.padEnd(widths[c]) : cell.padStart(widths[c])))
      .join('  ');
  return [fmt(header), ...lines.map(fmt)].join('\n');
}
