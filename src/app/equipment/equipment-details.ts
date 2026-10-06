import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { EquipmentListRow, GameDataService } from '../core/game-data/game-data.service';
import { formatCp, formatWeight } from '../core/game-data/game-format';
import { Skeleton } from '../shared/skeleton/skeleton';

@Component({
  selector: 'app-equipment-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  styleUrl: '../shared/browse/detail.scss',
  template: `
    <dl>
      <div>
        <dt>Cost</dt>
        <dd>{{ formatCp(item().costCp) }}</dd>
      </div>
      <div>
        <dt>Weight</dt>
        <dd>{{ formatWeight(item().weightLb) }}</dd>
      </div>
      @if (item().weaponCategory) {
        <div>
          <dt>Weapon</dt>
          <dd>{{ item().weaponCategory }}, {{ item().weaponRange }}</dd>
        </div>
        @if (item().damageDiceCount) {
          <div>
            <dt>Damage</dt>
            <dd>
              {{ item().damageDiceCount }}d{{ item().damageDiceSides }}
              {{ item().damageTypeName }}
            </dd>
          </div>
        }
        @if (item().masteryName) {
          <div>
            <dt>Mastery</dt>
            <dd>{{ item().masteryName }}</dd>
          </div>
        }
      }
      @if (item().armorCategory) {
        <div>
          <dt>Armor</dt>
          <dd>{{ item().armorCategory }}</dd>
        </div>
        <div>
          <dt>Armor class</dt>
          <dd>{{ item().armorBaseAc }}{{ dexNote() }}</dd>
        </div>
      }
    </dl>

    @if (detail.isLoading()) {
      <app-skeleton height="2.5rem" radius="var(--radius-md)" />
    } @else if (detail.error()) {
      <p class="muted">The description couldn’t be loaded.</p>
      <button type="button" class="btn btn--ghost retry" (click)="detail.reload()">
        Try again
      </button>
    } @else if (detail.value()?.equipmentDescription; as text) {
      <p>{{ text }}</p>
    }
  `,
})
export class EquipmentDetails {
  private readonly data = inject(GameDataService);

  readonly item = input.required<EquipmentListRow>();

  protected readonly detail = this.data.equipmentDetail(() => this.item().equipmentID);

  protected readonly formatCp = formatCp;
  protected readonly formatWeight = formatWeight;

  protected dexNote(): string {
    const cap = this.item().armorDexCap;
    if (cap === null) {
      return ' + Dex modifier';
    }
    return cap === 0 ? '' : ` + Dex modifier (max ${cap})`;
  }
}
