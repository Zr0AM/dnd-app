import { Routes } from '@angular/router';

export interface NavData {
  name: string;
  icon: string;
}

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home-component/home-component').then((m) => m.HomeComponent),
    title: 'Home · Adventurer’s Ledger',
    data: { name: 'Home', icon: 'd20' } satisfies NavData,
  },
  {
    path: 'market',
    loadComponent: () =>
      import('./market-component/market-component').then((m) => m.MarketComponent),
    title: 'Market · Adventurer’s Ledger',
    data: { name: 'Market', icon: 'scroll' } satisfies NavData,
  },
  {
    path: 'loot-generator',
    loadComponent: () =>
      import('./treasure-generator/treasure-generator').then((m) => m.TreasureGenerator),
    title: 'Loot Generator · Adventurer’s Ledger',
    data: { name: 'Loot Generator', icon: 'chest' } satisfies NavData,
  },
  {
    path: 'loot-splitter',
    loadComponent: () => import('./loot-splitter/loot-splitter').then((m) => m.LootSplitter),
    title: 'Loot Splitter · Adventurer’s Ledger',
    data: { name: 'Loot Splitter', icon: 'coins' } satisfies NavData,
  },
  {
    // Reached from the footer only, so it has no `data` and stays out of the nav menu.
    path: 'legal',
    loadComponent: () => import('./legal/legal').then((m) => m.Legal),
    title: 'Legal & attribution · Adventurer’s Ledger',
  },
  // Keeps links shared before the Loot Generator was renamed working.
  { path: 'treasure', redirectTo: 'loot-generator', pathMatch: 'full' },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/home', pathMatch: 'full' },
];
