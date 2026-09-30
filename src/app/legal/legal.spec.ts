import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { BUILD_INFO } from '../core/build-info/build-info';
import { routes } from '../app.routes';
import { Legal } from './legal';

const ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by ' +
  'Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is ' +
  'licensed under the Creative Commons Attribution 4.0 International License, available at ' +
  'https://creativecommons.org/licenses/by/4.0/legalcode.';

// Only ASCII whitespace is normalised: /\s/ also matches NBSP, which would let a non-breaking
// space inside the required wording pass the exact-text assertions.
const collapse = (node: Element) => node.textContent.replace(/[ \t\r\n]+/g, ' ').trim();

function render(attach = false) {
  TestBed.configureTestingModule({
    imports: [Legal],
    providers: [
      {
        provide: BUILD_INFO,
        useValue: { version: '0.1.0', commit: 'a1b2c3d', date: '2026-09-30' },
      },
    ],
  });
  const fixture = TestBed.createComponent(Legal);
  const el = fixture.nativeElement as HTMLElement;
  if (attach) document.body.appendChild(el);
  fixture.detectChanges();
  return el;
}

describe('Legal page', () => {
  it('has a single h1', () => {
    const el = render();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(collapse(el.querySelector('h1')!)).toBe('Legal & attribution');
  });

  it('moves focus to the h1 on arrival', () => {
    const el = render(true);
    const h1 = el.querySelector('h1')!;
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(h1);
    el.remove();
  });

  it('renders the required attribution verbatim as one paragraph', () => {
    const el = render();
    const paragraphs = el.querySelectorAll('blockquote p');
    expect(paragraphs).toHaveLength(1);
    expect(collapse(paragraphs[0])).toBe(ATTRIBUTION);
  });

  it('links both URLs safely in a new tab', () => {
    const links = Array.from(render().querySelectorAll<HTMLAnchorElement>('blockquote a'));
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

  it('rejects a non-breaking space inside the required wording', () => {
    const el = render();
    const p = el.querySelector('blockquote p')!;
    p.innerHTML = p.innerHTML.replace('System Reference', 'System\u00a0Reference');
    expect(collapse(p)).not.toBe(ATTRIBUTION);
  });

  it('mentions Wizards of the Coast exactly once and adds no other claims', () => {
    const text = collapse(render());
    expect(text.match(/Wizards/g)).toHaveLength(1);
    expect(text).not.toMatch(/Hasbro|affiliat|compatible|fifth edition/i);
  });

  it('shows the injected build info', () => {
    expect(collapse(render().querySelector('.legal-build')!)).toBe(
      'v0.1.0 · a1b2c3d · built 2026-09-30',
    );
  });
});

describe('/legal route', () => {
  it('resolves to the Legal page', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/legal');
    expect(router.url).toBe('/legal');
    const route = router.config.find((r) => r.path === 'legal')!;
    expect(await route.loadComponent!()).toBe(Legal);
  });
});
