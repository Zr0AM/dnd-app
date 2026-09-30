import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Item } from '../../core/items/items.service';
import { formatCostGp } from '../../core/items/item-cost';
import { Icon } from '../icon/icon';

export type ItemDetailField = 'type' | 'cost' | 'attunement' | 'source';

const ALL_FIELDS: readonly ItemDetailField[] = ['type', 'cost', 'attunement', 'source'];

// The catalog uses placeholder strings rather than leaving fields empty.
function present(value: string | undefined, placeholder: string): value is string {
  return !!value && value !== placeholder;
}

@Component({
  selector: 'app-item-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (fields().length) {
      <dl>
        @for (field of fields(); track field) {
          <div>
            @switch (field) {
              @case ('type') {
                <dt>Type</dt>
                <dd>{{ item().itemType }}</dd>
              }
              @case ('cost') {
                <dt>Cost</dt>
                <dd>{{ formatCostGp(item().itemCost) }}</dd>
              }
              @case ('attunement') {
                <dt>Attunement</dt>
                <dd>{{ item().itemAttunement }}</dd>
              }
              @case ('source') {
                <dt>Source</dt>
                <dd>{{ item().itemSource }}</dd>
              }
            }
          </div>
        }
      </dl>
    }
    @if (quote(); as text) {
      <p class="quote flavor">“{{ text }}”</p>
    }
    @if (visual(); as text) {
      <p>{{ text }}</p>
    }
    @if (restrictions(); as text) {
      <p><strong>Restrictions:</strong> {{ text }}</p>
    }
    @if (showLink()) {
      <a class="link" [href]="item().itemUrl" target="_blank" rel="noopener">
        View full entry <app-icon name="external" [size]="14" />
      </a>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
      font-size: var(--text-sm);
    }
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
      gap: var(--space-2);
      margin: 0;
    }
    dt {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
    dd {
      margin: 0;
      font-weight: 600;
    }
    .quote {
      color: var(--text-muted);
    }
    .link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-weight: 600;
      justify-self: start;
    }
  `,
})
export class ItemDetails {
  readonly item = input.required<Item>();
  readonly fields = input<readonly ItemDetailField[]>(ALL_FIELDS);
  readonly showLink = input(true);

  protected readonly formatCostGp = formatCostGp;

  protected readonly quote = computed(() => {
    const text = this.item().itemShopkeeperDesc;
    return present(text, 'N/A') ? text : '';
  });
  protected readonly visual = computed(() => {
    const text = this.item().itemVisualDesc;
    return present(text, 'N/A') ? text : '';
  });
  protected readonly restrictions = computed(() => {
    const text = this.item().itemRestrictions;
    return present(text, 'None') ? text : '';
  });
}
