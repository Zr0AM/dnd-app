import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ItemsService } from '../core/items/items.service';
import { Icon, IconName } from '../shared/icon/icon';

interface Feature {
  path: string;
  icon: IconName;
  title: string;
  blurb: string;
}

@Component({
  selector: 'app-home-component',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, Icon],
  templateUrl: './home-component.html',
  styleUrl: './home-component.scss',
})
export class HomeComponent {
  private readonly itemsService = inject(ItemsService);

  protected readonly catalog = this.itemsService.catalog;

  protected readonly features: Feature[] = [
    {
      path: '/market',
      icon: 'scroll',
      title: 'The Emporium',
      blurb: 'Search, sort and sift a full catalog of magic items — from common trinkets to world-shaking artifacts.',
    },
    {
      path: '/loot-splitter',
      icon: 'coins',
      title: 'Loot Splitter',
      blurb: 'Drop in the hoard and the party size; get a fair, denomination-aware split in an instant.',
    },
  ];
}
