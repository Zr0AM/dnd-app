import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { BUILD_INFO, formatBuildInfo } from '../core/build-info/build-info';

@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal.html',
  styleUrl: './legal.scss',
})
export class Legal implements AfterViewInit {
  protected readonly buildInfo = formatBuildInfo(inject(BUILD_INFO)) || 'unavailable';
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  // The footer link that leads here sits at the bottom of the previous page, so move focus to
  // the top of this one; otherwise keyboard and screen-reader users stay at the footer.
  ngAfterViewInit() {
    this.heading().nativeElement.focus();
  }
}
