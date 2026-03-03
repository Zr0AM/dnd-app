import { Routes } from '@angular/router';
import { HomeComponent } from './home-component/home-component';
import {LootSplitter} from './loot-splitter/loot-splitter';

export const routes: Routes = [
  {path: 'home', component: HomeComponent, data: {name: 'home'}},
  {path: 'loot-splitter', component: LootSplitter, data: {name: 'Loot splitter'}},
  {path: '', redirectTo: '/home', pathMatch: 'full'},
  {path: '**', redirectTo: '/home', pathMatch: 'full'}
];
