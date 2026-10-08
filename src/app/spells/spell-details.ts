import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GameDataService, SpellListRow } from '../core/game-data/game-data.service';
import { formatSpellComponents, formatSpellLevel } from '../core/game-data/game-format';
import { Skeleton } from '../shared/skeleton/skeleton';

@Component({
  selector: 'app-spell-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  styleUrl: '../shared/browse/detail.scss',
  template: `
    <dl>
      <div>
        <dt>Level</dt>
        <dd>
          {{ levelLabel() }} {{ spell().schoolName }}{{ spell().spellIsRitual ? ' (ritual)' : '' }}
        </dd>
      </div>
      <div>
        <dt>Casting time</dt>
        <dd>{{ spell().spellCastingTime }}</dd>
      </div>
      <div>
        <dt>Range</dt>
        <dd>{{ spell().spellRange }}</dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd>
          {{ spell().spellDuration }}{{ spell().spellConcentration ? ' (concentration)' : '' }}
        </dd>
      </div>
      @if (spell().spellClasses) {
        <div>
          <dt>Classes</dt>
          <dd>{{ spell().spellClasses }}</dd>
        </div>
      }
      @if (detail.value(); as d) {
        <div>
          <dt>Components</dt>
          <dd>{{ components(d) }}</dd>
        </div>
      }
    </dl>

    @if (detail.isLoading()) {
      <app-skeleton height="4rem" radius="var(--radius-md)" />
    } @else if (detail.error()) {
      <p class="muted">The full description couldn’t be loaded.</p>
      <button type="button" class="btn btn--ghost retry" (click)="detail.reload()">
        Try again
      </button>
    } @else if (detail.value(); as d) {
      @if (d.spellMaterial) {
        <p><strong>Material:</strong> {{ d.spellMaterial }}</p>
      }
      @for (paragraph of paragraphs(d.spellDescription); track $index) {
        <p>{{ paragraph }}</p>
      }
      @if (d.spellHigherLevel) {
        <div>
          <h4>At higher levels</h4>
          @for (paragraph of paragraphs(d.spellHigherLevel); track $index) {
            <p>{{ paragraph }}</p>
          }
        </div>
      }
    }
  `,
})
export class SpellDetails {
  private readonly data = inject(GameDataService);

  readonly spell = input.required<SpellListRow>();

  protected readonly detail = this.data.spellDetail(() => this.spell().spellID);
  protected readonly levelLabel = computed(() =>
    this.spell().spellLevel === 0
      ? 'Cantrip,'
      : `${formatSpellLevel(this.spell().spellLevel)}-level`,
  );

  protected readonly components = formatSpellComponents;

  protected paragraphs(text: string): string[] {
    return text.split(/\n+/).filter(Boolean);
  }
}
