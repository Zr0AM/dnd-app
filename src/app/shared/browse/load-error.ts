import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { EmptyState } from '../empty-state/empty-state';
import { Icon } from '../icon/icon';

// Panel shown when a catalog list fails to load, with a retry action.
@Component({
  selector: 'app-load-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, Icon],
  host: { class: 'panel' },
  template: `
    <app-empty-state icon="alert" tone="danger" [heading]="heading()" [message]="message()">
      <button type="button" class="btn btn--primary" (click)="retry.emit()">
        <app-icon name="arrow-right" [size]="18" /> Try again
      </button>
    </app-empty-state>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class LoadError {
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly retry = output();
}
