import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { filter } from 'rxjs';
import { Icon, IconName } from './shared/icon/icon';
import { NavData } from './app.routes';

interface MenuItem {
  path: string;
  label: string;
  icon: IconName;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, A11yModule, Icon],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);

  protected readonly menuItems: MenuItem[] = this.router.config
    .filter((route) => route.path && route.path !== '**' && !route.redirectTo)
    .map((route) => {
      const data = route.data as Partial<NavData> | undefined;
      return {
        path: route.path!,
        label: data?.name ?? route.path!,
        icon: (data?.icon as IconName) ?? 'sparkles',
      };
    });

  constructor() {
    // Close the mobile drawer whenever navigation completes (covers link
    // clicks, browser back/forward and programmatic navigation alike).
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu() {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu() {
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.menuOpen()) {
      this.closeMenu();
    }
  }
}
