import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('dnd-app');

  private readonly router = inject(Router);

  protected readonly menuItems = this.router.config
    .filter((route) => route.path && route.path !== '**' && !route.redirectTo)
    .map((route) => ({
      path: route.path!,
      label: route?.data?.["name"]
    }));
}
