import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Item } from '../../core/items/items.service';
import { formatCostGp } from '../../core/items/item-cost';
import { Icon } from '../icon/icon';

export type ItemDetailField = 'type' | 'cost' | 'attunement' | 'source';

const ALL_FIELDS: readonly ItemDetailField[] = ['type', 'cost', 'attunement', 'source'];

// `itemDescriptionSource` the API emits for SRD text; it is credited site-wide, not per item.
const SRD_SOURCE = 'SRD 5.2.1, CC-BY-4.0';

// The catalog uses placeholder strings rather than leaving fields empty.
function present(value: string | null | undefined, placeholder: string): value is string {
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
    @if (description(); as text) {
      <div class="description">
        <p class="description__text">{{ text }}</p>
        @if (provenance(); as label) {
          <p class="provenance">Description: {{ label }}</p>
        }
      </div>
    }
    @if (quote(); as text) {
      <p class="quote flavor">“{{ text }}”</p>
    }
    @if (visual(); as text) {
      <p class="visual">{{ text }}</p>
    }
    @if (restrictions(); as text) {
      <p class="restrictions"><strong>Restrictions:</strong> {{ text }}</p>
    }
    @if (isEmpty()) {
      <p class="empty">No description available for this item yet.</p>
    }
    @if (showLink() && item().itemUrl) {
      <a class="link" [href]="item().itemUrl" target="_blank" rel="noopener noreferrer">
        View full entry <app-icon name="external" [size]="14" />
      </a>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
      /* Let the grid track shrink below a long word instead of widening the
         table cell / card it sits in. */
      grid-template-columns: minmax(0, 1fr);
      font-size: var(--text-sm);
    }
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .description {
      display: grid;
      gap: var(--space-1);
    }
    .description__text {
      max-width: 72ch;
      font-size: var(--text-base);
      line-height: 1.6;
      /* Keep the paragraph breaks D&D Beyond descriptions carry. */
      white-space: pre-line;
    }
    .provenance,
    .empty {
      font-size: var(--text-xs);
      color: var(--text-muted);
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
  protected readonly description = computed(() => {
    const text = this.item().itemDescription;
    return text?.trim() ? text : '';
  });
  // Provenance label under the description. SRD text is credited in the footer
  // and on /legal, so it gets no per-item line; D&D Beyond is labelled, and any
  // other non-empty source is shown verbatim.
  protected readonly provenance = computed(() => {
    const source = this.item().itemDescriptionSource?.trim() ?? '';
    return source === SRD_SOURCE ? '' : source;
  });
  // Nothing at all to read: show a placeholder instead of an empty panel.
  protected readonly isEmpty = computed(
    () => !this.description() && !this.quote() && !this.visual() && !this.restrictions(),
  );
}
