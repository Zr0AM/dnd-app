// A scripted Prompter for tests: it answers each prompt from a queue of strings, as
// if a user had typed them, applying the same parsing as the real backend. Printed
// lines are captured for assertions. Running out of scripted input throws, so an
// under-scripted test fails loudly rather than hanging.

import {
  parseConfirm,
  renderChoices,
  resolveMultiSelection,
  resolveSelection,
  type Choice,
  type Prompter,
} from './prompt';

export interface ScriptedPrompter extends Prompter {
  /** Lines emitted via print(), in order. */
  readonly output: readonly string[];
  /** Inputs not yet consumed. */
  remaining(): number;
}

export function scriptedPrompter(inputs: readonly string[]): ScriptedPrompter {
  const queue = [...inputs];
  const output: string[] = [];
  const next = (label: string): string => {
    if (queue.length === 0) throw new Error(`scripted prompter ran out of input at: ${label}`);
    return queue.shift()!;
  };

  return {
    output,
    remaining: () => queue.length,
    print: (line = '') => output.push(line),

    async select<T>(message: string, choices: readonly Choice<T>[], def?: number): Promise<T> {
      const input = next(message);
      const i = resolveSelection(input, choices);
      const idx = i >= 0 ? i : (def ?? 0);
      return choices[idx].value;
    },

    async multiselect<T>(
      message: string,
      choices: readonly Choice<T>[],
      def?: readonly T[],
    ): Promise<T[]> {
      const input = next(message);
      const idxs = resolveMultiSelection(input, choices);
      if (idxs.length === 0 && def) return [...def];
      return idxs.map((i) => choices[i].value);
    },

    async text(message: string, def?: string): Promise<string> {
      const input = next(message);
      return input === '' ? (def ?? '') : input;
    },

    async number(message: string, def?: number): Promise<number> {
      const input = next(message);
      if (input === '' && def !== undefined) return def;
      const n = Number(input);
      return Number.isFinite(n) ? n : (def ?? 0);
    },

    async confirm(message: string, def?: boolean): Promise<boolean> {
      const input = next(message);
      return parseConfirm(input) ?? def ?? false;
    },
  };
}

// Re-export so tests can build expected menu text without importing two modules.
export { renderChoices };
