import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'd20'
  | 'scroll'
  | 'coins'
  | 'search'
  | 'filter'
  | 'x'
  | 'menu'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevrons-left'
  | 'chevrons-right'
  | 'external'
  | 'plus'
  | 'minus'
  | 'arrow-right'
  | 'alert'
  | 'sparkles'
  | 'shield'
  | 'gem';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-label]="label() || null"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false"
    >
      @switch (name()) {
        @case ('d20') {
          <path d="M12 2 2 8.5v7L12 22l10-6.5v-7L12 2Z" />
          <path d="M12 2v6m0 8v6M2 8.5 12 14l10-5.5" />
          <path d="m7 11 5 3 5-3-5-3-5 3Z" />
        }
        @case ('scroll') {
          <path d="M19 17V5a2 2 0 0 0-2-2H5" />
          <path
            d="M8 21h11a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"
          />
        }
        @case ('coins') {
          <circle cx="8" cy="8" r="6" />
          <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
          <path d="M7 6h1v4" />
          <path d="m16.71 13.88.7.71-2.82 2.82" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        }
        @case ('filter') {
          <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
        }
        @case ('x') {
          <path d="M18 6 6 18M6 6l12 12" />
        }
        @case ('menu') {
          <path d="M4 6h16M4 12h16M4 18h16" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('chevron-up') {
          <path d="m6 15 6-6 6 6" />
        }
        @case ('chevron-left') {
          <path d="m15 18-6-6 6-6" />
        }
        @case ('chevron-right') {
          <path d="m9 18 6-6-6-6" />
        }
        @case ('chevrons-left') {
          <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
        }
        @case ('chevrons-right') {
          <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />
        }
        @case ('external') {
          <path d="M15 3h6v6M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('minus') {
          <path d="M5 12h14" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14m-7-7 7 7-7 7" />
        }
        @case ('alert') {
          <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4M12 17h.01" />
        }
        @case ('sparkles') {
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
        }
        @case ('shield') {
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        }
        @case ('gem') {
          <path d="M6 3h12l4 6-10 12L2 9Z" />
          <path d="M11 3 8 9l4 12 4-12-3-6M2 9h20" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly label = input('');
}
