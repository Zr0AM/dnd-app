import { Component, OnInit, inject } from '@angular/core';
import { EnvService } from '../core/env/env.service';

@Component({
  selector: 'app-market-component',
  imports: [],
  templateUrl: './market-component.html',
  styleUrl: './market-component.scss',
})
export class MarketComponent implements OnInit {

  protected readonly envService = inject(EnvService);

  ngOnInit() {
    console.log('Env service: ', this.envService);
  }

}
