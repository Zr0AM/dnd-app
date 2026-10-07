import { describe, it, expect } from 'vitest';
import {
  parseConfirm,
  renderChoices,
  resolveMultiSelection,
  resolveSelection,
  type Choice,
} from './prompt';
import { scriptedPrompter } from './prompt-scripted';

const choices: Choice<string>[] = [
  { label: 'solo', value: 's' },
  { label: 'party', value: 'p' },
  { label: 'pack', value: 'k' },
];

describe('selection parsing', () => {
  it('resolves a 1-based number', () => {
    expect(resolveSelection('1', choices)).toBe(0);
    expect(resolveSelection('3', choices)).toBe(2);
    expect(resolveSelection('0', choices)).toBe(-1);
    expect(resolveSelection('4', choices)).toBe(-1);
  });

  it('resolves an exact or unambiguous prefix label', () => {
    expect(resolveSelection('solo', choices)).toBe(0);
    expect(resolveSelection('so', choices)).toBe(0); // unique prefix
    expect(resolveSelection('par', choices)).toBe(1); // unique prefix of "party"
    expect(resolveSelection('pa', choices)).toBe(-1); // ambiguous (party / pack)
    expect(resolveSelection('p', choices)).toBe(-1); // ambiguous (party / pack)
    expect(resolveSelection('', choices)).toBe(-1);
  });

  it('parses a multi-selection list, de-duplicated', () => {
    expect(resolveMultiSelection('1,3 1', choices)).toEqual([0, 2]);
    expect(resolveMultiSelection('solo, pack', choices)).toEqual([0, 2]);
    expect(resolveMultiSelection('', choices)).toEqual([]);
  });

  it('parses yes/no', () => {
    expect(parseConfirm('y')).toBe(true);
    expect(parseConfirm('Yes')).toBe(true);
    expect(parseConfirm('n')).toBe(false);
    expect(parseConfirm('maybe')).toBeUndefined();
  });

  it('renders a numbered list marking the default', () => {
    const text = renderChoices(choices, 1);
    expect(text).toContain('1. solo');
    expect(text).toContain('> 2. party'); // default marker
  });
});

describe('scriptedPrompter', () => {
  it('answers prompts from its queue and applies defaults', async () => {
    const p = scriptedPrompter(['2', '', 'yes', '48', 'hello']);
    expect(await p.select('mode', choices)).toBe('p'); // "2"
    expect(await p.select('mode', choices, 0)).toBe('s'); // blank -> default index 0
    expect(await p.confirm('ok?', false)).toBe(true); // "yes"
    expect(await p.number('pop', 10)).toBe(48); // "48"
    expect(await p.text('name', 'def')).toBe('hello');
    expect(p.remaining()).toBe(0);
  });

  it('falls back to the default on blank multiselect and captures output', async () => {
    const p = scriptedPrompter(['']);
    expect(await p.multiselect('classes', choices, ['s', 'k'])).toEqual(['s', 'k']);
    p.print('done');
    expect(p.output).toContain('done');
  });

  it('throws when under-scripted', async () => {
    const p = scriptedPrompter([]);
    await expect(p.select('mode', choices)).rejects.toThrow(/ran out of input/);
  });
});
