import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { Icon, IconName } from './icon';

const NAMES: IconName[] = [
  'd20',
  'scroll',
  'coins',
  'search',
  'filter',
  'x',
  'menu',
  'chevron-down',
  'chevron-up',
  'chevron-left',
  'chevron-right',
  'chevrons-left',
  'chevrons-right',
  'external',
  'plus',
  'minus',
  'arrow-right',
  'alert',
  'sparkles',
  'shield',
  'gem',
];

describe('Icon', () => {
  let fixture: ComponentFixture<Icon>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Icon] }).compileComponents();
    fixture = TestBed.createComponent(Icon);
  });

  it('renders a shape for every icon name', () => {
    for (const name of NAMES) {
      fixture.componentRef.setInput('name', name);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg, `svg missing for ${name}`).toBeTruthy();
      expect(svg.querySelector('path, circle'), `shape missing for ${name}`).toBeTruthy();
    }
  });

  it('exposes an accessible label when provided and hides itself otherwise', () => {
    fixture.componentRef.setInput('name', 'd20');
    fixture.detectChanges();
    let svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');

    fixture.componentRef.setInput('label', 'Twenty-sided die');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Twenty-sided die');
  });

  it('applies the requested size', () => {
    fixture.componentRef.setInput('name', 'coins');
    fixture.componentRef.setInput('size', 32);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });
});
