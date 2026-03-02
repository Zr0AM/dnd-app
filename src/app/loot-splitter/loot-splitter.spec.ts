import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LootSplitter } from './loot-splitter';

describe('LootSplitter', () => {
  let component: LootSplitter;
  let fixture: ComponentFixture<LootSplitter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LootSplitter]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LootSplitter);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
