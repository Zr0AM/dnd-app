import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-home-component',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './home-component.html',
})
export class HomeComponent {

  constructor(

  ) {
    console.log();
  }

}
