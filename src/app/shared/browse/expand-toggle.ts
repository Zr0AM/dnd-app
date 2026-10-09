import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

// Row chevron that shows/hides a table row's details panel.
@Component({
  selector: 'app-expand-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      class="btn btn--ghost btn--icon"
      [class.is-open]="open()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? controls() : null"
      [attr.aria-label]="'Toggle details for ' + label()"
      (click)="toggled.emit()"
    >
      <app-icon name="chevron-right" [size]="16" />
    </button>
  `,
  styles: `
    app-icon {
      transition: transform var(--dur-fast) var(--ease-out);
    }
    .is-open app-icon {
      transform: rotate(90deg);
    }
  `,
})
export class ExpandToggle {
  readonly open = input.required<boolean>();
  // id of the details element this button controls
  readonly controls = input.required<string>();
  readonly label = input.required<string>();
  readonly toggled = output();
}
