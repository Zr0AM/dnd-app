import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  GameDataService,
  MonsterDetail,
  MonsterListRow,
} from '../core/game-data/game-data.service';
import { abilityModifier } from '../core/game-data/game-format';
import { Skeleton } from '../shared/skeleton/skeleton';

@Component({
  selector: 'app-monster-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  styleUrl: '../shared/browse/detail.scss',
  template: `
    <dl>
      <div>
        <dt>Type</dt>
        <dd>
          {{ monster().monsterSizes ?? '' }} {{ monster().creatureTypeName }}
          @if (detail.value()?.monsterTypeTags; as tags) {
            {{ tags }}
          }
        </dd>
      </div>
      <div>
        <dt>Challenge</dt>
        <dd>CR {{ monster().crLabel }} ({{ monster().xp.toLocaleString('en-US') }} XP)</dd>
      </div>
      <div>
        <dt>Armor class</dt>
        <dd>
          {{ monster().monsterAc }}
          @if (detail.value()?.monsterAcNote; as note) {
            ({{ note }})
          }
        </dd>
      </div>
      <div>
        <dt>Hit points</dt>
        <dd>{{ monster().monsterHpAvg }}{{ hitDice(detail.value()) }}</dd>
      </div>
      @if (detail.value(); as d) {
        <div>
          <dt>Alignment</dt>
          <dd>{{ d.monsterAlignment }}</dd>
        </div>
        <div>
          <dt>Passive Perception</dt>
          <dd>{{ d.monsterPassivePerception }}</dd>
        </div>
        @if (d.monsterLanguages) {
          <div>
            <dt>Languages</dt>
            <dd>{{ d.monsterLanguages }}</dd>
          </div>
        }
      }
    </dl>

    @if (detail.isLoading()) {
      <app-skeleton height="4rem" radius="var(--radius-md)" />
    } @else if (detail.error()) {
      <p class="muted">The full stat block couldn’t be loaded.</p>
      <button type="button" class="btn btn--ghost retry" (click)="detail.reload()">
        Try again
      </button>
    } @else if (detail.value(); as d) {
      <dl class="abilities">
        @for (ability of abilities(d); track ability.label) {
          <div>
            <dt>{{ ability.label }}</dt>
            <dd>{{ ability.score }} ({{ ability.mod }})</dd>
          </div>
        }
      </dl>
      @if (d.monsterDescription) {
        <p>{{ d.monsterDescription }}</p>
      }
    }
  `,
})
export class MonsterDetails {
  private readonly data = inject(GameDataService);

  readonly monster = input.required<MonsterListRow>();

  protected readonly detail = this.data.monsterDetail(() => this.monster().monsterID);

  protected hitDice(d: MonsterDetail | undefined): string {
    if (!d?.monsterHpDiceCount) {
      return '';
    }
    const bonus = d.monsterHpBonus
      ? d.monsterHpBonus > 0
        ? ` + ${d.monsterHpBonus}`
        : ` − ${Math.abs(d.monsterHpBonus)}`
      : '';
    return ` (${d.monsterHpDiceCount}d${d.monsterHpDiceSides}${bonus})`;
  }

  protected abilities(d: MonsterDetail) {
    return [
      { label: 'STR', score: d.monsterStr },
      { label: 'DEX', score: d.monsterDex },
      { label: 'CON', score: d.monsterCon },
      { label: 'INT', score: d.monsterInt },
      { label: 'WIS', score: d.monsterWis },
      { label: 'CHA', score: d.monsterCha },
    ].map((a) => ({ ...a, mod: abilityModifier(a.score) }));
  }
}
