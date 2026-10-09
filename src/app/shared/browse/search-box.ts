import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-search-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <app-icon name="search" [size]="18" />
    <input
      #searchInput
      type="search"
      placeholder="Search by name…"
      [attr.aria-label]="label()"
      [value]="value()"
      (input)="value.set(searchInput.value)"
    />
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1 1 15rem;
      min-width: 12rem;
      color: var(--text-muted);
    }
    app-icon {
      position: absolute;
      left: 0.7rem;
      pointer-events: none;
    }
    input {
      width: 100%;
      padding: 0.6rem 0.7rem 0.6rem 2.3rem;
      font: inherit;
      color: var(--text);
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }
    input:focus-visible {
      outline: none;
      border-color: var(--accent-gold);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-gold) 30%, transparent);
    }
  `,
})
export class SearchBox {
  readonly value = model.required<string>();
  readonly label = input.required<string>();
}
