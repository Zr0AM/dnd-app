import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { EmptyState } from '../empty-state/empty-state';

// Panel shown when the active filters match nothing.
@Component({
  selector: 'app-no-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  host: { class: 'panel' },
  template: `
    <app-empty-state icon="search" [heading]="heading()" [message]="message()">
      <button type="button" class="btn" (click)="clearRequest.emit()">Clear filters</button>
    </app-empty-state>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class NoResults {
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly clearRequest = output();
}
