import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BUILD_INFO, formatBuildInfo } from '../core/build-info/build-info';

@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal.html',
  styleUrl: './legal.scss',
})
export class Legal {
  protected readonly buildInfo = formatBuildInfo(inject(BUILD_INFO));
}
