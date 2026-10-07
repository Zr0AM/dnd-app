// Entry point for the sim CLI: `npm run sim` (interactive menus) or
// `npm run sim -- <mode> --flags…` (scripted). A leading non-flag token is the mode;
// with --yes (or --no-interactive) a mode runs straight from flags, otherwise the
// flags pre-seed the interactive screens. Everything below the dispatch is the pure
// config + the flows module, both unit-tested; this file is the thin I/O shell.

import process from 'node:process';
import { buildSeedDatabase } from '../content/load-db';
import { liveEngine, formatEvalLine } from './engine';
import { liveIo } from './report-io';
import { readlinePrompter } from './prompt-readline';
import { applyFlags, defaultConfig, parseArgs } from './config';
import { evalSpecFromConfig, executeOptimize, mainMenu, runFlow, type FlowDeps } from './flows';

const HELP = `D&D Build Optimizer — sim CLI

  npm run sim                         interactive menus
  npm run sim -- <mode> [flags] --yes run <mode> straight from flags

Modes: optimize (alias run), eval, campaign, rescore, browse

Flags (optimize): --level 3|5|11|17  --role <role|equal>  --classes a,b,c
                  --preset quick|standard|thorough  --pop N --gens N --runs N
                  --mutation R  --campaign  --seed N  --out <dir>
Flags (eval):     --class <slug>  --context solo|party  --role <role>
                  --runs N  --seed N  [--weapon <name> --shield --two-handed]
`;

const print = (line = ''): void => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    print(HELP);
    return;
  }

  const hasMode = argv.length > 0 && !argv[0].startsWith('--');
  const mode = hasMode ? argv[0] : undefined;
  const flags = parseArgs(hasMode ? argv.slice(1) : argv);
  const base = applyFlags(defaultConfig(5), flags);

  const deps: FlowDeps = { engine: liveEngine(buildSeedDatabase), io: liveIo };
  const nonInteractive = flags['yes'] === true || flags['no-interactive'] === true;

  // Scripted path: a mode plus --yes runs from flags alone, no menus.
  if (mode && nonInteractive) {
    if (mode === 'run' || mode === 'optimize') {
      print('running optimization…');
      executeOptimize(deps, base, { print });
    } else if (mode === 'eval') {
      const line = deps.engine.evalBuild(evalSpecFromConfig(base, flags));
      print(formatEvalLine(line));
    } else {
      throw new Error(`mode "${mode}" has no non-interactive path; drop --yes to use the menus`);
    }
    return;
  }

  // Interactive path: a mode pre-seeds that flow; otherwise the main menu.
  const p = readlinePrompter();
  if (mode) await runFlow(mode, p, deps, base);
  else await mainMenu(p, deps, base);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    print(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
