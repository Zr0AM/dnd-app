import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

export type SortState = 'ascending' | 'descending' | 'none';

// Column-header sort control; the label is projected content.
@Component({
  selector: 'app-sort-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button type="button" (click)="sortChange.emit()">
      <span><ng-content /></span>
      @if (state() !== 'none') {
        <app-icon [name]="state() === 'ascending' ? 'chevron-up' : 'chevron-down'" [size]="14" />
      }
    </button>
  `,
  styles: `
    button {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      border: none;
      background: none;
      padding: 0;
      font: inherit;
      font-weight: 700;
      color: var(--text);
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover {
      color: var(--primary);
    }
  `,
})
export class SortButton {
  readonly state = input.required<SortState>();
  readonly sortChange = output();
}
