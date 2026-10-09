import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';

// Placeholder shown while a catalog list is first loading.
@Component({
  selector: 'app-browse-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  host: { class: 'panel', 'aria-hidden': 'true' },
  template: `
    <app-skeleton width="40%" height="2.25rem" />
    <div class="rows">
      @for (row of rows; track row) {
        <app-skeleton height="3rem" radius="var(--radius-md)" />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-4);
    }
    .rows {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }
  `,
})
export class BrowseSkeleton {
  protected readonly rows = [1, 2, 3, 4, 5, 6];
}
