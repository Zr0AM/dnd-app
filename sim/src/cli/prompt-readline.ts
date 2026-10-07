// The real Prompter: numbered menus and prompts over Node's readline. The only
// module that touches the terminal. All parsing is the shared pure logic in
// ./prompt, so behavior matches the scripted test backend exactly.

import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import {
  parseConfirm,
  renderChoices,
  resolveMultiSelection,
  resolveSelection,
  type Choice,
  type Prompter,
} from './prompt';

export function readlinePrompter(): Prompter {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const print = (line = ''): void => process.stdout.write(`${line}\n`);

  const ask = (q: string): Promise<string> => rl.question(q);

  return {
    print,

    async select<T>(message: string, choices: readonly Choice<T>[], def?: number): Promise<T> {
      for (;;) {
        print(message);
        print(renderChoices(choices, def));
        const input = await ask(def !== undefined ? `  [${def + 1}] > ` : '  > ');
        const i = input.trim() === '' && def !== undefined ? def : resolveSelection(input, choices);
        if (i >= 0) return choices[i].value;
        print('  ? please enter a number from the list');
      }
    },

    async multiselect<T>(
      message: string,
      choices: readonly Choice<T>[],
      def?: readonly T[],
    ): Promise<T[]> {
      print(message);
      print(renderChoices(choices));
      const input = await ask('  (comma-separated, blank = default) > ');
      const idxs = resolveMultiSelection(input, choices);
      if (idxs.length === 0 && def) return [...def];
      return idxs.map((i) => choices[i].value);
    },

    async text(message: string, def?: string): Promise<string> {
      const input = await ask(def !== undefined ? `${message} [${def}] ` : `${message} `);
      return input.trim() === '' && def !== undefined ? def : input.trim();
    },

    async number(message: string, def?: number): Promise<number> {
      for (;;) {
        const input = await ask(def !== undefined ? `${message} [${def}] ` : `${message} `);
        if (input.trim() === '' && def !== undefined) return def;
        const n = Number(input.trim());
        if (Number.isFinite(n)) return n;
        print('  ? please enter a number');
      }
    },

    async confirm(message: string, def?: boolean): Promise<boolean> {
      const hint = def === undefined ? '(y/n)' : def ? '(Y/n)' : '(y/N)';
      for (;;) {
        const input = await ask(`${message} ${hint} `);
        const v = parseConfirm(input);
        if (v !== undefined) return v;
        if (input.trim() === '' && def !== undefined) return def;
        print('  ? please answer y or n');
      }
    },
  };
}
