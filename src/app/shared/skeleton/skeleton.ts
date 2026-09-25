import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    role: 'presentation',
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': 'radius()',
  },
  styles: `
    :host {
      display: block;
      background: linear-gradient(
        100deg,
        color-mix(in srgb, var(--text) 8%, transparent) 20%,
        color-mix(in srgb, var(--text) 16%, transparent) 40%,
        color-mix(in srgb, var(--text) 8%, transparent) 60%
      );
      background-size: 220% 100%;
      animation: shimmer 1.4s var(--ease-in-out) infinite;
    }

    @keyframes shimmer {
      0% {
        background-position: 180% 0;
      }
      100% {
        background-position: -80% 0;
      }
    }
  `,
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly radius = input('var(--radius-sm)');
}
