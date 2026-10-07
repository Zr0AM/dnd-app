// The engine the interactive flows drive. Flows never touch the simulator, the
// seed DB, or NSGA-II directly — they call a CliEngine, so a test can inject a fake
// and exercise the menu navigation deterministically without loading a database or
// running a single fight. `liveEngine()` is the real implementation: it opens the
// in-memory seed DB once, caches a catalog per level, and wires the library calls.

import { Random } from '../rng/rng';
import {
  BUILD_CLASSES,
  isCasterClass,
  randomGenome,
  repair,
  type BuildClass,
  type MartialGenome,
} from '../opt/genome';
import type { FightingStyle } from '../content/character';
import type { Role } from '../content/fillers';
import { loadMartialCatalog, type MartialCatalog } from '../opt/catalog';
import { runNsga2 } from '../opt/nsga2';
import {
  buildReport,
  describeGenome,
  equalWeights,
  type BuildReportEntry,
  type RunReport,
} from '../opt/reports';
import { evaluate, objectivesOf, OBJECTIVE_NAMES } from '../opt/evaluate';
import {
  evaluatePartyBuild,
  loadPartyHarness,
  partyObjectivesOf,
  type PartyHarness,
} from '../opt/party-evaluate';
import { annotateCampaignViability } from '../opt/campaign';
import { roleWeights } from '../opt/roles';
import { nsga2OptionsFrom, weightsFrom, type Level, type RunConfig } from './config';

/** A single build to evaluate ad hoc: a class plus optional gear overrides. */
export interface EvalSpec {
  readonly level: Level;
  readonly classSlug: BuildClass;
  readonly context: 'solo' | 'party';
  /** Role whose weighting labels the result (and the party hero's role). */
  readonly role: string;
  readonly seed: number;
  readonly runs: number;
  readonly weaponName?: string;
  readonly shield?: boolean;
  readonly twoHanded?: boolean;
  readonly fightingStyle?: FightingStyle;
}

/** A labeled evaluation of one build: the named objective vector plus win rate. */
export interface EvalLine {
  readonly description: string;
  readonly context: 'solo' | 'party';
  readonly winRate: number;
  readonly winRateCi: readonly [number, number];
  readonly objectives: Record<string, number>;
  readonly runs: number;
}

export interface BrowseClass {
  readonly slug: BuildClass;
  readonly subclass: string;
  readonly kind: 'martial' | 'caster';
}
export interface BrowseRole {
  readonly name: string;
  readonly weights: Record<string, number>;
}
export interface BrowseScenario {
  readonly id: string;
  readonly difficulty: string;
  readonly shape: string;
  readonly enemies: number;
}
export interface BrowseInfo {
  readonly level: number;
  readonly classes: readonly BrowseClass[];
  readonly roles: readonly BrowseRole[];
  readonly scenarios: readonly BrowseScenario[];
}

export interface CliEngine {
  /** Run a solo NSGA-II optimization and return the report (campaign-annotated if asked). */
  optimize(config: RunConfig): RunReport;
  /** Evaluate one ad-hoc build, solo or in the reference party. */
  evalBuild(spec: EvalSpec): EvalLine;
  /** Annotate an already-built report with each build's adventuring-day win rate. */
  annotateCampaign(report: RunReport, level: Level): RunReport;
  /** Browse the content available at a level. */
  browse(level: Level): BrowseInfo;
  /** The weapon names legal at a level (for the eval gear menu). */
  weaponNames(level: Level): string[];
}

/** Map a config role to a party hero role, falling back to controller. */
const PARTY_ROLES: readonly Role[] = [
  'tank',
  'sustained-dps',
  'burst',
  'healer',
  'controller',
  'buffer',
];
export function heroRoleFor(role: string): Role {
  return (PARTY_ROLES as readonly string[]).includes(role) ? (role as Role) : 'controller';
}

/** Build a legal genome for `spec`'s class, then overlay any gear overrides. */
export function genomeForSpec(spec: EvalSpec, catalog: MartialCatalog): MartialGenome {
  const base = randomGenome(catalog, new Random(spec.seed, `eval:${spec.classSlug}`), 'eval', [
    spec.classSlug,
  ]);
  if (isCasterClass(spec.classSlug)) return base; // casters use a fixed package
  const over: MartialGenome = {
    ...base,
    weaponName: spec.weaponName ?? base.weaponName,
    shield: spec.shield ?? base.shield,
    twoHanded: spec.twoHanded ?? base.twoHanded,
    fightingStyle: spec.fightingStyle ?? base.fightingStyle,
  };
  return repair(over, catalog);
}

const named = (vec: readonly number[]): Record<string, number> => {
  const out: Record<string, number> = {};
  OBJECTIVE_NAMES.forEach((n, i) => (out[n] = vec[i]));
  return out;
};

/** The real engine, backed by the committed seed database. */
export function liveEngine(buildDb: () => import('node:sqlite').DatabaseSync): CliEngine {
  let db: import('node:sqlite').DatabaseSync | undefined;
  const catalogs = new Map<number, MartialCatalog>();
  const harnesses = new Map<number, PartyHarness>();
  const getDb = () => (db ??= buildDb());
  const catalog = (level: Level): MartialCatalog => {
    let c = catalogs.get(level);
    if (!c) catalogs.set(level, (c = loadMartialCatalog(getDb(), level)));
    return c;
  };
  const harness = (level: Level): PartyHarness => {
    let h = harnesses.get(level);
    if (!h) harnesses.set(level, (h = loadPartyHarness(getDb(), level)));
    return h;
  };

  return {
    optimize(config) {
      const cat = catalog(config.level);
      const random = new Random(config.seed, 'nsga2');
      const result = runNsga2(cat, random, nsga2OptionsFrom(config));
      const weights = weightsFrom(config.role);
      const report = buildReport(result, { ...config }, weights);
      return config.campaign ? annotateCampaignViability(report, cat, { days: 12 }) : report;
    },
    evalBuild(spec) {
      const cat = catalog(spec.level);
      const genome = genomeForSpec(spec, cat);
      const description = describeGenome(genome).replace('L?', `L${spec.level}`);
      if (spec.context === 'party') {
        const r = evaluatePartyBuild(genome, cat, harness(spec.level), {
          runs: spec.runs,
          heroRole: heroRoleFor(spec.role),
        });
        return {
          description,
          context: 'party',
          winRate: r.winRate,
          winRateCi: [r.ci.winRate.lo, r.ci.winRate.hi],
          objectives: named(partyObjectivesOf(r)),
          runs: r.runs,
        };
      }
      const r = evaluate(genome, cat, { runs: spec.runs });
      return {
        description,
        context: 'solo',
        winRate: r.winRate,
        winRateCi: [r.ci.winRate.lo, r.ci.winRate.hi],
        objectives: named(objectivesOf(r)),
        runs: r.runs,
      };
    },
    annotateCampaign(report, level) {
      return annotateCampaignViability(report, catalog(level), { days: 12 });
    },
    browse(level) {
      const cat = catalog(level);
      const classes: BrowseClass[] = BUILD_CLASSES.map((slug) => ({
        slug,
        subclass: cat.subclassFor(slug),
        kind: isCasterClass(slug) ? 'caster' : 'martial',
      }));
      const roles: BrowseRole[] = [
        'sustained-dps',
        'burst',
        'tank',
        'generalist',
        'controller',
        'healer',
        'buffer',
      ].map((name) => ({ name, weights: roleWeights(name) }));
      const scenarios: BrowseScenario[] = cat.scenarios.map((s) => ({
        id: s.id,
        difficulty: String(s.difficulty),
        shape: s.shape,
        enemies: s.spawnEnemies().length,
      }));
      return { level, classes, roles, scenarios };
    },
    weaponNames(level) {
      return catalog(level).weapons.map((w) => w.name);
    },
  };
}

/** Pretty-print one eval line (used by the eval/campaign flows and tests). */
export function formatEvalLine(line: EvalLine): string {
  const objs = OBJECTIVE_NAMES.map((n) => `${n} ${(line.objectives[n] ?? 0).toFixed(2)}`).join(
    '  ',
  );
  const ci = `[${line.winRateCi[0].toFixed(2)}, ${line.winRateCi[1].toFixed(2)}]`;
  return [
    line.description,
    `  context ${line.context}, ${line.runs} runs`,
    `  win ${line.winRate.toFixed(2)} ${ci}`,
    `  ${objs}`,
  ].join('\n');
}

/** Build an entry's campaign line for browse-style listings (small helper). */
export function entryLine(e: BuildReportEntry): string {
  const camp =
    e.campaignDayWinRate !== undefined ? `  camp ${e.campaignDayWinRate.toFixed(2)}` : '';
  return `${e.description}  score ${e.weightedScore.toFixed(2)}  win ${e.metrics.winRate.toFixed(2)}${camp}`;
}

/** The default weights helper, re-exported so flows need not reach into reports. */
export { equalWeights, roleWeights };
