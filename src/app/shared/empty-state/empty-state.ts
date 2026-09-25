import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="art" [class.art--danger]="tone() === 'danger'">
      <app-icon [name]="icon()" [size]="34" />
    </div>
    <h3>{{ heading() }}</h3>
    @if (message()) {
      <p class="flavor">{{ message() }}</p>
    }
    <div class="actions">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--space-3);
      padding: var(--space-7) var(--space-4);
    }
    .art {
      display: grid;
      place-items: center;
      width: 4.5rem;
      height: 4.5rem;
      border-radius: var(--radius-full);
      color: var(--accent-gold);
      background: color-mix(in srgb, var(--accent-gold) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent-gold) 30%, transparent);
    }
    .art--danger {
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 12%, transparent);
      border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    }
    h3 {
      margin: 0;
    }
    p {
      max-width: 32ch;
      color: var(--text-muted);
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class EmptyState {
  readonly icon = input<IconName>('sparkles');
  readonly heading = input.required<string>();
  readonly message = input('');
  readonly tone = input<'default' | 'danger'>('default');
}
