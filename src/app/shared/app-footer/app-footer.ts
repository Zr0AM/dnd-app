import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BUILD_INFO, formatBuildInfo } from '../../core/build-info/build-info';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-footer.html',
  styleUrl: './app-footer.scss',
})
export class AppFooter {
  protected readonly buildInfo = formatBuildInfo(inject(BUILD_INFO));
}
