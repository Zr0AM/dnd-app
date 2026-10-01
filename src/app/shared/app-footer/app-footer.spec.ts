import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { BUILD_INFO, BuildInfo, formatBuildInfo } from '../../core/build-info/build-info';
import { AppFooter } from './app-footer';

function render(info: BuildInfo = { build: '2026-09-30_042', commit: 'a1b2c3d' }) {
  TestBed.configureTestingModule({
    imports: [AppFooter],
    providers: [provideRouter([]), { provide: BUILD_INFO, useValue: info }],
  });
  const fixture = TestBed.createComponent(AppFooter);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return { el, text: (node: Element) => node.textContent.replace(/[ \t\r\n]+/g, ' ').trim() };
}

describe('AppFooter', () => {
  it('renders a footer landmark', () => {
    expect(render().el.querySelector('footer')).toBeTruthy();
  });

  it('shows the app name and injected build info', () => {
    const { el, text } = render();
    expect(text(el.querySelector('.footer__build')!)).toBe(
      'Adventurer’s Ledger · 2026-09-30_042 · a1b2c3d',
    );
  });

  it('does not show the package version or the word build', () => {
    const { el, text } = render();
    expect(text(el)).not.toMatch(/\bv\d|0\.1\.0|\bbuild\b/i);
  });

  it('leaves out build parts that are unknown', () => {
    const { el, text } = render({ build: 'unknown', commit: 'a1b2c3d' });
    expect(text(el.querySelector('.footer__build')!)).toBe('Adventurer’s Ledger · a1b2c3d');
  });

  it('shows just the app name when nothing about the build is known', () => {
    const { el, text } = render({ build: 'unknown', commit: 'unknown' });
    expect(text(el.querySelector('.footer__build')!)).toBe('Adventurer’s Ledger');
  });

  it('links to /legal and to the Creative Commons licence page', () => {
    const { el, text } = render();
    const links = Array.from(el.querySelectorAll('a'));
    expect(links.map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['Legal & attribution', '/legal'],
      ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
    ]);
    const cc = links[1];
    expect(cc.getAttribute('target')).toBe('_blank');
    expect(cc.getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].hasAttribute('target')).toBe(false);
    expect(text(el)).toContain('Includes SRD 5.2.1 content under CC BY 4.0');
    expect(text(el.querySelector('.footer__legal')!)).toBe(
      'Legal & attribution Includes SRD 5.2.1 content under CC BY 4.0',
    );
  });

  it('does not render a dangling separator glyph', () => {
    expect(render().el.textContent).not.toMatch(/Legal & attribution\s*·|CC BY 4\.0\s*·/);
  });

  it('contains no Wizards of the Coast or D&D Beyond text', () => {
    const { el, text } = render();
    expect(text(el)).not.toMatch(/Wizards|D&D Beyond|dndbeyond/i);
  });
});

describe('formatBuildInfo', () => {
  it('joins build number and commit', () => {
    expect(formatBuildInfo({ build: '2026-01-02_1042', commit: 'abc1234' })).toBe(
      '2026-01-02_1042 · abc1234',
    );
  });

  it('leaves out an unknown build number or commit independently', () => {
    expect(formatBuildInfo({ build: 'unknown', commit: 'abc1234' })).toBe('abc1234');
    expect(formatBuildInfo({ build: '2026-01-02_dev', commit: 'unknown' })).toBe('2026-01-02_dev');
    expect(formatBuildInfo({ build: 'unknown', commit: 'unknown' })).toBe('');
  });
});
