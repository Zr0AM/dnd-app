// The interactive prompt surface for the CLI — a tiny, dependency-free menu layer
// over Node's readline. Everything the menus do goes through the Prompter interface,
// so screens never touch readline directly and tests drive them with a scripted
// backend (no TTY). "Navigable" here means numbered selection, not arrow keys; the
// interface is shaped so an arrow-key backend (@inquirer/prompts) could slot in
// later without changing a single screen.

export interface Choice<T> {
  readonly label: string;
  readonly value: T;
  /** Optional one-line hint shown after the label. */
  readonly hint?: string;
}

export interface Prompter {
  /** Pick one of `choices`; returns the chosen value. `def` is the default index. */
  select<T>(message: string, choices: readonly Choice<T>[], def?: number): Promise<T>;
  /** Pick any number of `choices`; returns the chosen values (possibly empty). */
  multiselect<T>(message: string, choices: readonly Choice<T>[], def?: readonly T[]): Promise<T[]>;
  /** Free text with an optional default. */
  text(message: string, def?: string): Promise<string>;
  /** A number with an optional default; re-asks until the input parses. */
  number(message: string, def?: number): Promise<number>;
  /** Yes/no with a default. */
  confirm(message: string, def?: boolean): Promise<boolean>;
  /** Print a line (menus use this for headers and results). */
  print(line?: string): void;
}

/** Parse a 1-based selection ("2") or a label prefix; returns the index or -1. */
export function resolveSelection<T>(input: string, choices: readonly Choice<T>[]): number {
  const trimmed = input.trim();
  if (trimmed === '') return -1;
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
  const lower = trimmed.toLowerCase();
  const exact = choices.findIndex((c) => c.label.toLowerCase() === lower);
  if (exact >= 0) return exact;
  const matches = choices
    .map((_, i) => i)
    .filter((i) => choices[i].label.toLowerCase().startsWith(lower));
  return matches.length === 1 ? matches[0] : -1;
}

/** Parse a comma/space list of selections ("1,3 5") into distinct 0-based indices. */
export function resolveMultiSelection<T>(input: string, choices: readonly Choice<T>[]): number[] {
  const parts = input
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const i = resolveSelection(p, choices);
    if (i >= 0 && !out.includes(i)) out.push(i);
  }
  return out;
}

/** Parse a yes/no answer; undefined when it matches neither. */
export function parseConfirm(input: string): boolean | undefined {
  const s = input.trim().toLowerCase();
  if (s === 'y' || s === 'yes') return true;
  if (s === 'n' || s === 'no') return false;
  return undefined;
}

/** Render a numbered choice list (pure, for the readline backend and tests). */
export function renderChoices<T>(choices: readonly Choice<T>[], def?: number): string {
  return choices
    .map((c, i) => {
      const marker = i === def ? '>' : ' ';
      const hint = c.hint ? `  (${c.hint})` : '';
      return `  ${marker} ${i + 1}. ${c.label}${hint}`;
    })
    .join('\n');
}
