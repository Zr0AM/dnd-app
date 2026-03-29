import { Component, OnInit } from '@angular/core';
import { envConfig } from '../../environments/env-config.local';

@Component({
  selector: 'app-market-component',
  templateUrl: './market-component.html',
  styleUrl: './market-component.scss',
})
export class MarketComponent implements OnInit {

  ngOnInit() {
    console.log(envConfig);
  }

}
