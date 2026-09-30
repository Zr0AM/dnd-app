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

const collapse = (node: Element) => node.textContent.replace(/\s+/g, ' ').trim();

function render() {
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
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Legal page', () => {
  it('has a single h1', () => {
    const el = render();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(collapse(el.querySelector('h1')!)).toBe('Legal & attribution');
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
