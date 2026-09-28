import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('builds nav items from the route config', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.nav-desktop .nav-link');
    expect(links).toHaveLength(4);
    expect(fixture.nativeElement.textContent).toContain('Market');
    expect(fixture.nativeElement.textContent).toContain('Treasure');
    expect(fixture.nativeElement.textContent).toContain('Loot Splitter');
  });

  it('opens the mobile drawer and closes it on Escape', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.drawer')).toBeNull();

    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.menu-toggle');
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).toBeNull();
  });

  it('closes the mobile drawer from its backdrop without adding a tab stop', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.menu-toggle').click();
    fixture.detectChanges();

    const backdrop: HTMLButtonElement = fixture.nativeElement.querySelector('.drawer-backdrop');
    expect(backdrop.tagName).toBe('BUTTON');
    expect(backdrop.tabIndex).toBe(-1);
    expect(backdrop.getAttribute('aria-label')).toBe('Close navigation menu');

    backdrop.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).toBeNull();
  });
});
