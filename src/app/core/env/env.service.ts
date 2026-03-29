import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface EnvConfig {
  API_KEY?: string;
  // Add other expected config properties here
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class EnvService {
  private readonly http = inject(HttpClient);

  public readonly env$: Observable<EnvConfig>;

  constructor() {

    // Attempt to fetch runtime configuration from Cloudflare Pages Function.
    // This allows environment variables to be injected at runtime without rebuilding the app.
    // If it fails (e.g., running locally via `ng serve` without Wrangler),
    // it falls back to the build-time environment configuration.
    this.env$ = this.http.get<EnvConfig>('/api/config').pipe(
      catchError(() => {
        console.warn('Could not load runtime config from /api/config. Falling back to build-time environment variables.');
        return of(environment.envConfig as EnvConfig);
      }),
      shareReplay(1)
    );
  }
}
