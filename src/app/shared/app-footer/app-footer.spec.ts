import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { BUILD_INFO, BuildInfo, formatBuildInfo } from '../../core/build-info/build-info';
import { AppFooter } from './app-footer';

const ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by ' +
  'Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is ' +
  'licensed under the Creative Commons Attribution 4.0 International License, available at ' +
  'https://creativecommons.org/licenses/by/4.0/legalcode.';

function render(info: BuildInfo = { version: '0.1.0', commit: 'a1b2c3d', date: '2026-09-30' }) {
  TestBed.configureTestingModule({
    imports: [AppFooter],
    providers: [{ provide: BUILD_INFO, useValue: info }],
  });
  const fixture = TestBed.createComponent(AppFooter);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return { el, text: (node: Element) => node.textContent.replace(/\s+/g, ' ').trim() };
}

describe('AppFooter', () => {
  it('renders a contentinfo footer landmark', () => {
    const { el } = render();
    expect(el.querySelector('footer')).toBeTruthy();
  });

  it('renders the Creative Commons attribution verbatim', () => {
    const { el, text } = render();
    const paragraph = el.querySelector('.footer__attribution')!;
    expect(text(paragraph)).toBe(ATTRIBUTION);
  });

  it('links both URLs safely in a new tab', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.footer__attribution a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://www.dndbeyond.com/srd',
      'https://creativecommons.org/licenses/by/4.0/legalcode',
    ]);
    for (const a of links) {
      expect(a.textContent.trim()).toBe(a.getAttribute('href'));
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('mentions Wizards of the Coast only inside the required sentence', () => {
    const { el, text } = render();
    const all = text(el);
    expect(all.match(/Wizards/g)).toHaveLength(1);
    expect(all.match(/Wizards of the Coast LLC/g)).toHaveLength(1);
    expect(all).not.toMatch(/Hasbro|affiliat|compatible|fifth edition/i);
    expect(text(el.querySelector('.footer__build')!)).not.toMatch(/Wizards/);
  });

  it('shows the injected build info', () => {
    const { el, text } = render();
    expect(text(el.querySelector('.footer__build')!)).toBe('v0.1.0 · a1b2c3d · built 2026-09-30');
  });

  it('leaves out build parts that are unknown', () => {
    const { el, text } = render({ version: '0.1.0', commit: 'unknown', date: 'unknown' });
    expect(text(el.querySelector('.footer__build')!)).toBe('v0.1.0');
  });
});

describe('formatBuildInfo', () => {
  it('joins version, commit and date', () => {
    expect(formatBuildInfo({ version: '1.2.3', commit: 'abc1234', date: '2026-01-02' })).toBe(
      'v1.2.3 · abc1234 · built 2026-01-02',
    );
  });
});
