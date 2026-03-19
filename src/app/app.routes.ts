import { Routes } from '@angular/router';
import { HomeComponent } from './home-component/home-component';
import { LootSplitter } from './loot-splitter/loot-splitter';
import { MarketComponent } from './market-component/market-component';

export const routes: Routes = [
  {path: 'home', component: HomeComponent, title: 'DND', data: {name: 'home'}},
  {path: 'market', component: MarketComponent, title: 'DND', data: {name: 'market'}},
  {path: 'loot-splitter', component: LootSplitter, title: 'DND', data: {name: 'Loot splitter'}},
  {path: '', redirectTo: '/home', pathMatch: 'full'},
  {path: '**', redirectTo: '/home', pathMatch: 'full'}
];
