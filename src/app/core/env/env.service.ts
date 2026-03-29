import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface EnvConfig {
  API_KEY: string;
  // Add other expected config properties here
}

@Injectable({providedIn: 'root'})
export class EnvService {
  // 1. Inject HttpClient directly as a class field (cleaner syntax)
  private readonly http = inject(HttpClient);

  // 2. Make the observable public so other components can access it
  // and give it a proper type signature.
  public readonly env$: Observable<EnvConfig>;

  constructor() {
    // 3. Set up the observable
    // shareReplay(1) ensures the HTTP request is only made once
    // and all subsequent subscribers get the cached result.
    this.env$ = environment.production
      ? this.http.get<EnvConfig>('/api/config').pipe(shareReplay(1))
      // TypeScript requires 'unknown' cast first if the type being cast from doesn't overlap (e.g., if envConfig is typed as null)
      : of((environment.envConfig || {}) as unknown as EnvConfig).pipe(shareReplay(1));

    console.log("ENV environment service loaded: ", environment.envConfig);
  }
}
