import { Routes } from '@angular/router';

export interface NavData {
  name: string;
  icon: string;
  tagline: string;
}

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home-component/home-component').then((m) => m.HomeComponent),
    title: 'Home · Adventurer’s Ledger',
    data: { name: 'Home', icon: 'd20', tagline: 'Your table’s companion' } satisfies NavData,
  },
  {
    path: 'market',
    loadComponent: () =>
      import('./market-component/market-component').then((m) => m.MarketComponent),
    title: 'Market · Adventurer’s Ledger',
    data: {
      name: 'Market',
      icon: 'scroll',
      tagline: 'Browse the magic item emporium',
    } satisfies NavData,
  },
  {
    path: 'treasure',
    loadComponent: () =>
      import('./treasure-generator/treasure-generator').then((m) => m.TreasureGenerator),
    title: 'Treasure Hoard · Adventurer’s Ledger',
    data: {
      name: 'Treasure',
      icon: 'chest',
      tagline: 'Roll a hoard from the DMG tables',
    } satisfies NavData,
  },
  {
    path: 'loot-splitter',
    loadComponent: () => import('./loot-splitter/loot-splitter').then((m) => m.LootSplitter),
    title: 'Loot Splitter · Adventurer’s Ledger',
    data: {
      name: 'Loot Splitter',
      icon: 'coins',
      tagline: 'Divide the hoard, fairly',
    } satisfies NavData,
  },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/home', pathMatch: 'full' },
];
