// Party evaluation: run a hero build inside a reference party against scaled
// encounters, under common random numbers, and attribute metrics to the hero —
// including healing done, which finally gives the support axis signal. Aggregated
// across the party templates (R4, R3) with their weights.

import type { DatabaseSync } from 'node:sqlite';
import { Random, seedFrom } from '../rng/rng';
import { Encounter, type CombatEvent } from '../combat/encounter';
import { tacticalPolicy } from '../ai/policy';
import { buildFromGenome, type MartialGenome } from './genome';
import type { MartialCatalog } from './catalog';
import {
  assembleParty,
  loadFillers,
  loadPartyScenarios,
  PARTY_TEMPLATES,
  type PartyScenario,
  type PartyTemplate,
} from '../scenario/party';
import type { Filler, Role } from '../content/fillers';
import { mean, wilsonInterval, type Interval } from './stats';

export interface PartyEvalResult {
  readonly winRate: number;
  readonly avgHeroDamage: number;
  readonly avgHeroHealing: number;
  /** Mean enemy actions the hero denied via control conditions — control. */
  readonly avgHeroActionsDenied: number;
  readonly avgHeroHpFracRetained: number;
  readonly avgAlliesAliveFrac: number;
  readonly runs: number;
  readonly ci: { readonly winRate: Interval };
}

export interface PartyEvalOptions {
  readonly runs?: number;
  readonly heroRole?: Role;
  /** Which templates to run (defaults to all, weighted). */
  readonly templates?: readonly PartyTemplate[];
}

/** The harness assets, loaded once from the database. */
export interface PartyHarness {
  readonly fillers: Partial<Record<Role, Filler>>;
  readonly scenariosByPartySize: Map<number, PartyScenario[]>;
}

export function loadPartyHarness(db: DatabaseSync, level: number): PartyHarness {
  const fillers = loadFillers(db, level);
  const scenariosByPartySize = new Map<number, PartyScenario[]>();
  for (const t of PARTY_TEMPLATES) {
    if (!scenariosByPartySize.has(t.roles.length)) {
      scenariosByPartySize.set(t.roles.length, loadPartyScenarios(db, t.roles.length));
    }
  }
  return { fillers, scenariosByPartySize };
}

function heroDamage(log: readonly CombatEvent[], id: string): number {
  let total = 0;
  for (const ev of log) {
    if (ev.kind === 'attack' && ev.attacker === id) total += ev.damage;
    else if (ev.kind === 'opportunity' && ev.attacker === id) total += ev.damage;
    else if (ev.kind === 'spell' && ev.caster === id) total += ev.damage;
  }
  return total;
}

function heroHealing(log: readonly CombatEvent[], id: string): number {
  let total = 0;
  for (const ev of log) if (ev.kind === 'spell' && ev.caster === id) total += ev.healing;
  return total;
}

/** Enemy actions the hero denied via control conditions (controlDenied events). */
function heroActionsDenied(log: readonly CombatEvent[], id: string): number {
  let total = 0;
  for (const ev of log) if (ev.kind === 'controlDenied' && ev.source === id) total += 1;
  return total;
}

/** Evaluate a hero build across the party templates, attributing metrics to it. */
export function evaluatePartyBuild(
  genome: MartialGenome,
  catalog: MartialCatalog,
  harness: PartyHarness,
  opts: PartyEvalOptions = {},
): PartyEvalResult {
  const runsPer = opts.runs ?? 12;
  const heroRole = opts.heroRole ?? 'controller';
  const templates = opts.templates ?? PARTY_TEMPLATES;

  const winSamples: number[] = [];
  const damageSamples: number[] = [];
  const healingSamples: number[] = [];
  const deniedSamples: number[] = [];
  const heroHpSamples: number[] = [];
  const alliesAliveSamples: number[] = [];

  for (const template of templates) {
    const scenarios = harness.scenariosByPartySize.get(template.roles.length) ?? [];
    for (const scenario of scenarios) {
      for (let i = 0; i < runsPer; i++) {
        const rng = new Random(seedFrom('party', template.id, scenario.id, i));
        const hero = buildFromGenome(genome, catalog, 'hero');
        const party = assembleParty(harness.fillers, template, hero, heroRole, scenario.partyCells);
        const enemies = scenario.spawnEnemies();
        const e = new Encounter({
          grid: scenario.grid,
          combatants: [...party, ...enemies],
          rng,
          policyFor: () => tacticalPolicy,
        });
        const res = e.run(50);
        const won = res.winner === 'party';
        winSamples.push(won ? 1 : 0);
        damageSamples.push(heroDamage(res.log, 'hero'));
        healingSamples.push(heroHealing(res.log, 'hero'));
        deniedSamples.push(heroActionsDenied(res.log, 'hero'));
        heroHpSamples.push(hero.isConscious ? hero.hp / hero.maxHp : 0);
        const allies = party.filter((c) => c !== hero);
        alliesAliveSamples.push(
          allies.length ? allies.filter((a) => a.isAlive).length / allies.length : 1,
        );
      }
    }
  }

  const runs = winSamples.length;
  const wins = winSamples.reduce((a, b) => a + b, 0);
  return {
    winRate: runs ? wins / runs : 0,
    avgHeroDamage: mean(damageSamples),
    avgHeroHealing: mean(healingSamples),
    avgHeroActionsDenied: mean(deniedSamples),
    avgHeroHpFracRetained: mean(heroHpSamples),
    avgAlliesAliveFrac: mean(alliesAliveSamples),
    runs,
    ci: { winRate: wilsonInterval(wins, runs) },
  };
}
