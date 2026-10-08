import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { BoilerDeviceStatus } from '../../data-access/boiler/boiler-api';
import { isRecord } from '../../core/util/is-record';
import { MessageKey } from '../../i18n/messages';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';

/** A device of the boiler room as the schematic shows it. */
export interface DeviceView {
  /** The relay is on; `undefined` when the answer does not say. */
  readonly working: boolean | undefined;
  /** What the service last noted about the device, in its own words. */
  readonly message?: string;
  /** House wall-clock time of that note. */
  readonly at?: string;
}

/**
 * Reads a device out of the answer. Nothing checks an answer at runtime: whatever is not what
 * the service is documented to send - no device, a text where the flag should be - reads as
 * "does not say", never as "off".
 */
export function toDeviceView(status: BoilerDeviceStatus | undefined): DeviceView {
  const device: unknown = status;
  if (!isRecord(device)) {
    return { working: undefined };
  }
  const note = isRecord(device['lastMessageReply']) ? device['lastMessageReply'] : {};
  const message = note['message'];
  const at = note['timestamp'];
  return {
    working: typeof device['working'] === 'boolean' ? device['working'] : undefined,
    message: typeof message === 'string' && message !== '' ? message : undefined,
    at: typeof at === 'string' ? at : undefined,
  };
}

/**
 * One device in the schematic of the boiler room: its name, whether it runs, and the last thing
 * the service noted about it with how long ago that was. A running device is tinted with the
 * colour of the domain; what says so to somebody who does not see colours is the word.
 */
@Component({
  selector: 'app-boiler-device',
  imports: [MatIconModule, TranslocoDirective, HouseAgePipe],
  template: `
    <ng-container *transloco="let t">
      <div class="device__head">
        <mat-icon class="device__icon">{{ icon() }}</mat-icon>
        <h3 class="device__name">{{ t(name()) }}</h3>
      </div>
      <p class="device__state">{{ t(state()) }}</p>
      <!-- the words of the service: printed as they are, never through the translations -->
      @if (device().message; as message) {
        <p class="device__message">{{ message }}</p>
      }
      @if (device().at | houseAge; as age) {
        <p class="device__age">{{ age }}</p>
      }
    </ng-container>
  `,
  styleUrl: './boiler-device.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.device--working]': 'device().working === true',
    '[attr.data-state]':
      "device().working === undefined ? 'unknown' : device().working ? 'on' : 'off'",
  },
})
export class BoilerDevice {
  /** Name of a Material Symbols icon. */
  readonly icon = input.required<string>();
  readonly name = input.required<MessageKey>();
  readonly device = input.required<DeviceView>();
  /** The words for a device that runs and one that does not: a furnace is on, a pump runs. */
  readonly onLabel = input.required<MessageKey>();
  readonly offLabel = input.required<MessageKey>();

  protected readonly state = computed((): MessageKey => {
    const working = this.device().working;
    if (working === undefined) {
      return 'boilerRoom.noStatus';
    }
    return working ? this.onLabel() : this.offLabel();
  });
}
