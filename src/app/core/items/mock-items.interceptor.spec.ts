import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { mockItemsInterceptor } from './mock-items.interceptor';

describe('mockItemsInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockItemsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('serves the mock catalog for GET /api/items without a network call', async () => {
    const result = await firstValueFrom(
      http.get<{ success: boolean; results: unknown[] }>('/api/items'),
    );
    expect(result.success).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    httpMock.expectNone('/api/items');
  });

  it('passes other requests through to the network', async () => {
    const response = firstValueFrom(http.get('/api/other'));
    const request = httpMock.expectOne('/api/other');
    expect(request.request.method).toBe('GET');
    request.flush({ from: 'network' });
    expect(await response).toEqual({ from: 'network' });
  });
});
