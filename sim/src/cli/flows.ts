// The interactive screens. Each flow is an async function over a Prompter (the
// menu surface) and FlowDeps (the engine + disk IO), so a test drives any screen
// with a scripted prompter and a fake engine — no TTY, no database, no filesystem.
// The same RunConfig the menus build here is what main.ts assembles from flags, so
// a run is configurable both ways from one model.

import {
  applyFlags,
  defaultConfig,
  formatSummary,
  GA_PRESETS,
  LEVELS,
  ROLE_CHOICES,
  weightsFrom,
  type GaParams,
  type Level,
  type RunConfig,
} from './config';
import { rescore } from '../opt/reports';
import { BUILD_CLASSES, isCasterClass, type BuildClass } from '../opt/genome';
import type { FightingStyle } from '../content/character';
import type { Prompter, Choice } from './prompt';
import type { CliEngine, EvalSpec } from './engine';
import { formatEvalLine } from './engine';
import type { CliIo } from './report-io';

export interface FlowDeps {
  readonly engine: CliEngine;
  readonly io: CliIo;
  /** A fresh seed when none is carried in; injected so tests are deterministic. */
  readonly seedGen?: () => number;
}

const LEVEL_CHOICES: Choice<Level>[] = LEVELS.map((l) => ({ label: `Level ${l}`, value: l }));
const ROLE_CHOICE_LIST: Choice<string>[] = ROLE_CHOICES.map((r) => ({ label: r, value: r }));
const CLASS_CHOICES: Choice<BuildClass>[] = BUILD_CLASSES.map((c) => ({ label: c, value: c }));
const PRESET_CHOICES: Choice<keyof typeof GA_PRESETS>[] = (
  Object.keys(GA_PRESETS) as (keyof typeof GA_PRESETS)[]
).map((k) => ({
  label: k,
  value: k,
  hint: `${GA_PRESETS[k].populationSize} pop × ${GA_PRESETS[k].generations} gen`,
}));
const CONTEXT_CHOICES: Choice<'solo' | 'party'>[] = [
  { label: 'solo', value: 'solo', hint: '1v monsters' },
  { label: 'party', value: 'party', hint: 'reference party (control/support score here)' },
];
const FIGHTING_STYLE_CHOICES: Choice<FightingStyle>[] = (
  ['archery', 'defense', 'great-weapon', 'two-weapon'] as const
).map((s) => ({ label: s, value: s }));

const levelIndex = (l: Level) => Math.max(0, LEVELS.indexOf(l));
const roleIndex = (r: string) =>
  Math.max(0, ROLE_CHOICES.indexOf(r as (typeof ROLE_CHOICES)[number]));
const presetKeyOf = (ga: GaParams): keyof typeof GA_PRESETS => {
  const hit = (Object.keys(GA_PRESETS) as (keyof typeof GA_PRESETS)[]).find(
    (k) => GA_PRESETS[k] === ga || GA_PRESETS[k].populationSize === ga.populationSize,
  );
  return hit ?? 'standard';
};

function freshSeed(deps: FlowDeps): number {
  return (deps.seedGen ?? (() => Math.floor(Math.random() * 1_000_000)))();
}

/** Walk the optimization config screens, starting from `start`'s values as defaults. */
export async function configureRun(
  p: Prompter,
  start: RunConfig,
  deps: FlowDeps,
): Promise<RunConfig> {
  const level = await p.select('Level', LEVEL_CHOICES, levelIndex(start.level));
  const role = await p.select(
    'Role (leaderboard weighting)',
    ROLE_CHOICE_LIST,
    roleIndex(start.role),
  );
  const classes = await p.multiselect(
    'Class filter (choose none for all 12)',
    CLASS_CHOICES,
    start.classes,
  );
  const presetKey = await p.select(
    'GA effort',
    PRESET_CHOICES,
    PRESET_CHOICES.findIndex((c) => c.value === presetKeyOf(start.ga)),
  );
  let ga: GaParams = GA_PRESETS[presetKey];
  if (await p.confirm('Customize the GA numbers?', false)) {
    ga = {
      populationSize: await p.number('Population size', ga.populationSize),
      generations: await p.number('Generations', ga.generations),
      evalRuns: await p.number('Runs per evaluation', ga.evalRuns),
      mutationRate: await p.number('Mutation rate (0–1)', ga.mutationRate),
    };
  }
  const campaign = await p.confirm(
    'Also score campaign (adventuring-day) viability? (slower)',
    start.campaign,
  );
  const seed = await p.number('Seed (reuse to reproduce a run)', start.seed || freshSeed(deps));
  const outDir = await p.text('Output directory', start.outDir);
  return { level, role, classes, ga, campaign, seed, outDir };
}

/** A multi-line echo of a config for the confirmation screen. */
export function renderConfig(cfg: RunConfig): string {
  const classes = cfg.classes.length ? cfg.classes.join(', ') : 'all 12';
  return [
    'Run configuration:',
    `  level      ${cfg.level}`,
    `  role       ${cfg.role}`,
    `  classes    ${classes}`,
    `  GA         ${cfg.ga.populationSize} pop × ${cfg.ga.generations} gen, ${cfg.ga.evalRuns} runs, mut ${cfg.ga.mutationRate}`,
    `  campaign   ${cfg.campaign ? 'yes' : 'no'}`,
    `  seed       ${cfg.seed}`,
    `  out        ${cfg.outDir}`,
  ].join('\n');
}

/** Run an optimization and emit the summary + written path (shared with flags path). */
export function executeOptimize(deps: FlowDeps, cfg: RunConfig, p: Pick<Prompter, 'print'>): void {
  const report = deps.engine.optimize(cfg);
  const path = deps.io.writeReport(report, cfg.outDir);
  p.print('');
  p.print(`Top builds — L${cfg.level}, ${cfg.role} (seed ${cfg.seed})`);
  p.print(formatSummary(report));
  p.print(`  wrote ${path}`);
}

/** The "Run an optimization" flow: configure, confirm (run / edit / cancel), execute. */
export async function optimizeFlow(p: Prompter, deps: FlowDeps, start: RunConfig): Promise<void> {
  let cfg = await configureRun(p, start, deps);
  for (;;) {
    p.print('');
    p.print(renderConfig(cfg));
    const action = await p.select(
      'Proceed?',
      [
        { label: 'Run', value: 'run' },
        { label: 'Edit a field', value: 'edit' },
        { label: 'Cancel', value: 'cancel' },
      ],
      0,
    );
    if (action === 'cancel') {
      p.print('cancelled.');
      return;
    }
    if (action === 'edit') {
      cfg = await configureRun(p, cfg, deps);
      continue;
    }
    break;
  }
  p.print('running optimization…');
  executeOptimize(deps, cfg, p);
}

/** The "Evaluate a single build" flow. */
export async function evalFlow(p: Prompter, deps: FlowDeps, start: RunConfig): Promise<void> {
  const level = await p.select('Level', LEVEL_CHOICES, levelIndex(start.level));
  const classSlug = await p.select('Class', CLASS_CHOICES, 0);
  const context = await p.select('Context', CONTEXT_CHOICES, 0);
  const role = await p.select(
    'Role (party hero role / label)',
    ROLE_CHOICE_LIST,
    roleIndex(start.role),
  );
  const runs = await p.number('Runs per scenario', context === 'party' ? 12 : 16);
  const seed = await p.number('Seed', start.seed || freshSeed(deps));

  const spec: {
    -readonly [K in keyof EvalSpec]: EvalSpec[K];
  } = { level, classSlug, context, role, seed, runs };

  if (!isCasterClass(classSlug) && (await p.confirm('Override the default gear?', false))) {
    const weapons = deps.engine.weaponNames(level);
    const weaponChoices: Choice<string>[] = [
      { label: '(default)', value: '' },
      ...weapons.map((w) => ({ label: w, value: w })),
    ];
    const weapon = await p.select('Weapon', weaponChoices, 0);
    if (weapon) spec.weaponName = weapon;
    spec.shield = await p.confirm('Shield?', false);
    spec.twoHanded = await p.confirm('Two-handed?', false);
    if (classSlug === 'fighter') {
      spec.fightingStyle = await p.select('Fighting style', FIGHTING_STYLE_CHOICES, 1);
    }
  }

  p.print('evaluating…');
  const line = deps.engine.evalBuild(spec);
  p.print('');
  p.print(formatEvalLine(line));
}

/** Pick a saved report from `outDir`; returns the full path or null if none/cancelled. */
async function pickReport(p: Prompter, deps: FlowDeps, outDir: string): Promise<string | null> {
  const files = deps.io.listReports(outDir);
  if (!files.length) {
    p.print(`no saved reports in ${outDir} — run an optimization first.`);
    return null;
  }
  const file = await p.select(
    'Report',
    files.map((f) => ({ label: f, value: f })),
    0,
  );
  return `${outDir}/${file}`;
}

/** The "Adventuring-day (campaign) check" flow: annotate a saved report in place. */
export async function campaignFlow(p: Prompter, deps: FlowDeps, start: RunConfig): Promise<void> {
  const path = await pickReport(p, deps, start.outDir);
  if (!path) return;
  const report = deps.io.readReport(path);
  const level = (Number(report.config['level']) || start.level) as Level;
  p.print('scoring the adventuring day…');
  const annotated = deps.engine.annotateCampaign(report, level);
  const written = deps.io.writeReport(annotated, start.outDir);
  p.print('');
  p.print(formatSummary(annotated));
  p.print(`  wrote ${written}`);
}

/** The "Rescore a saved report" flow: re-rank under new weights, no re-simulation. */
export async function rescoreFlow(p: Prompter, deps: FlowDeps, start: RunConfig): Promise<void> {
  const path = await pickReport(p, deps, start.outDir);
  if (!path) return;
  const report = deps.io.readReport(path);
  const role = await p.select('New role weighting', ROLE_CHOICE_LIST, 0);
  const rescored = rescore(report, weightsFrom(role));
  const written = deps.io.writeReport(rescored, start.outDir);
  p.print('');
  p.print(`Rescored for ${role}:`);
  p.print(formatSummary(rescored));
  p.print(`  wrote ${written}`);
}

/** The "Browse content" flow. */
export async function browseFlow(p: Prompter, deps: FlowDeps, start: RunConfig): Promise<void> {
  const level = await p.select('Level', LEVEL_CHOICES, levelIndex(start.level));
  const what = await p.select(
    'Browse',
    [
      { label: 'Classes', value: 'classes' },
      { label: 'Roles', value: 'roles' },
      { label: 'Scenarios', value: 'scenarios' },
    ],
    0,
  );
  const info = deps.engine.browse(level);
  p.print('');
  if (what === 'classes') {
    for (const c of info.classes)
      p.print(`  ${c.slug.padEnd(10)} ${c.kind.padEnd(8)} ${c.subclass}`);
  } else if (what === 'roles') {
    for (const r of info.roles) {
      const w = Object.entries(r.weights)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
      p.print(`  ${r.name.padEnd(14)} ${w}`);
    }
  } else {
    for (const s of info.scenarios)
      p.print(
        `  ${s.id.padEnd(22)} ${s.difficulty.padEnd(8)} ${s.shape.padEnd(10)} ${s.enemies} enemies`,
      );
  }
}

const MAIN_CHOICES: Choice<string>[] = [
  { label: 'Run an optimization', value: 'optimize', hint: 'NSGA-II + report' },
  { label: 'Evaluate a single build', value: 'eval' },
  { label: 'Adventuring-day (campaign) check', value: 'campaign' },
  { label: 'Rescore a saved report', value: 'rescore' },
  { label: 'Browse content', value: 'browse' },
  { label: 'Quit', value: 'quit' },
];

/** The main menu loop; returns when the user picks Quit. */
export async function mainMenu(p: Prompter, deps: FlowDeps, start: RunConfig): Promise<void> {
  for (;;) {
    p.print('');
    const mode = await p.select('D&D Build Optimizer', MAIN_CHOICES, 0);
    if (mode === 'quit') {
      p.print('bye.');
      return;
    }
    if (mode === 'optimize') await optimizeFlow(p, deps, start);
    else if (mode === 'eval') await evalFlow(p, deps, start);
    else if (mode === 'campaign') await campaignFlow(p, deps, start);
    else if (mode === 'rescore') await rescoreFlow(p, deps, start);
    else if (mode === 'browse') await browseFlow(p, deps, start);
  }
}

/** Dispatch a single flow by mode name (used when a mode token pre-seeds a flow). */
export async function runFlow(
  mode: string,
  p: Prompter,
  deps: FlowDeps,
  start: RunConfig,
): Promise<void> {
  switch (mode) {
    case 'run':
    case 'optimize':
      return optimizeFlow(p, deps, start);
    case 'eval':
      return evalFlow(p, deps, start);
    case 'campaign':
      return campaignFlow(p, deps, start);
    case 'rescore':
      return rescoreFlow(p, deps, start);
    case 'browse':
      return browseFlow(p, deps, start);
    default:
      throw new Error(`unknown mode: ${mode}`);
  }
}

/** Build an EvalSpec from parsed flags for the non-interactive eval path. */
export function evalSpecFromConfig(
  cfg: RunConfig,
  flags: Record<string, string | boolean>,
): EvalSpec {
  const classFlag = (flags['class'] ?? cfg.classes[0]) as string | undefined;
  if (!classFlag) throw new Error('eval needs --class <slug>');
  if (!(BUILD_CLASSES as readonly string[]).includes(classFlag))
    throw new Error(`unknown class: ${classFlag}`);
  const context = flags['context'] === 'party' ? 'party' : 'solo';
  const spec: { -readonly [K in keyof EvalSpec]: EvalSpec[K] } = {
    level: cfg.level,
    classSlug: classFlag as BuildClass,
    context,
    role: cfg.role,
    seed: cfg.seed,
    runs: typeof flags['runs'] === 'string' ? Number(flags['runs']) : context === 'party' ? 12 : 16,
  };
  if (typeof flags['weapon'] === 'string') spec.weaponName = flags['weapon'];
  if (flags['shield'] !== undefined) spec.shield = flags['shield'] !== false;
  if (flags['two-handed'] !== undefined) spec.twoHanded = flags['two-handed'] !== false;
  return spec;
}

// Re-export so main.ts composes the non-interactive path without re-deriving config.
export { applyFlags, defaultConfig };
