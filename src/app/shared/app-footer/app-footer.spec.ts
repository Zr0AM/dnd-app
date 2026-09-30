import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { BUILD_INFO, BuildInfo, formatBuildInfo } from '../../core/build-info/build-info';
import { AppFooter } from './app-footer';

function render(info: BuildInfo = { version: '0.1.0', commit: 'a1b2c3d', date: '2026-09-30' }) {
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
      'Adventurer’s Ledger · v0.1.0 · a1b2c3d · built 2026-09-30',
    );
  });

  it('leaves out build parts that are unknown', () => {
    const { el, text } = render({ version: '0.1.0', commit: 'unknown', date: 'unknown' });
    expect(text(el.querySelector('.footer__build')!)).toBe('Adventurer’s Ledger · v0.1.0');
  });

  it('has one link to /legal and mentions the SRD license as plain text', () => {
    const { el, text } = render();
    const links = Array.from(el.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/legal');
    expect(text(links[0])).toBe('Legal & attribution');
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
  it('joins version, commit and date', () => {
    expect(formatBuildInfo({ version: '1.2.3', commit: 'abc1234', date: '2026-01-02' })).toBe(
      'v1.2.3 · abc1234 · built 2026-01-02',
    );
  });
});
