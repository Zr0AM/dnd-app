import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <nav aria-label="Pagination">
      <label class="size">
        <span>Per page</span>
        <select class="field" #sizeSelect (change)="sizeChange.emit(+sizeSelect.value)">
          @for (s of sizes(); track s) {
            <option [value]="s" [selected]="s === size()">{{ s }}</option>
          }
        </select>
      </label>

      <div class="controls">
        <button
          type="button"
          class="btn btn--icon"
          (click)="pageChange.emit(1)"
          [disabled]="page() === 1"
          aria-label="First page"
        >
          <app-icon name="chevrons-left" [size]="18" />
        </button>
        <button
          type="button"
          class="btn btn--icon"
          (click)="pageChange.emit(page() - 1)"
          [disabled]="page() === 1"
          aria-label="Previous page"
        >
          <app-icon name="chevron-left" [size]="18" />
        </button>
        <span class="page">Page {{ page() }} of {{ totalPages() }}</span>
        <button
          type="button"
          class="btn btn--icon"
          (click)="pageChange.emit(page() + 1)"
          [disabled]="page() === totalPages()"
          aria-label="Next page"
        >
          <app-icon name="chevron-right" [size]="18" />
        </button>
        <button
          type="button"
          class="btn btn--icon"
          (click)="pageChange.emit(totalPages())"
          [disabled]="page() === totalPages()"
          aria-label="Last page"
        >
          <app-icon name="chevrons-right" [size]="18" />
        </button>
      </div>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      margin-top: var(--space-4);
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .size {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      color: var(--text-muted);
    }
    .size select {
      width: auto;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .page {
      font-size: var(--text-sm);
      white-space: nowrap;
      min-width: 8ch;
      text-align: center;
    }
  `,
})
export class Pager {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly size = input.required<number>();
  readonly sizes = input<readonly number[]>([10, 25, 50]);

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();
}
