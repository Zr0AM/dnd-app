import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HomeComponent } from './home-component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.match('/api/items');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the feature cards', () => {
    expect(fixture.nativeElement.textContent).toContain('The Emporium');
    expect(fixture.nativeElement.textContent).toContain('Loot Splitter');
  });

  it('shows the live item count once the catalog loads', async () => {
    // detectChanges in beforeEach already issued the resource request.
    TestBed.tick();
    httpMock
      .expectOne('/api/items')
      .flush({ success: true, results: [{ itemID: 1 }, { itemID: 2 }, { itemID: 3 }] });
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('3');
    expect(fixture.nativeElement.textContent).toContain('items catalogued');
  });
});
