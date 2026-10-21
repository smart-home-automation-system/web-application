import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { HeatingSwitch } from '../../shared/heating-switch/heating-switch';

/**
 * The switch of the heating of the whole house on the page of a member - the card shared with
 * the heating dashboard. A component of its own so that the state of the switch is asked for
 * only while the card is there: the page renders it for a member the registry granted
 * `heating_switch`, and for nobody else nothing is polled.
 */
@Component({
  selector: 'app-house-heating',
  imports: [HeatingSwitch],
  template: `<app-heating-switch [control]="heating" />`,
  styles: `
    // the card of the switch is the item of the grid of the page: it stretches to its row
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HouseHeating {
  protected readonly heating = inject(HeatingApi).watchSwitch();
}
