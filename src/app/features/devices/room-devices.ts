import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { ChangeOutcome } from '../../core/api/registry-changes';
import {
  DeviceDetails,
  DeviceRegistry,
  RegisteredDevice,
  SmartDevice,
} from '../../data-access/devices/device-registry-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { RoomDevices as RoomGroup } from './device-groups';
import { changeSummary, describeDeviceError } from './device-errors';
import {
  kindIcon,
  kindLabel,
  lightKindLabel,
  placementLabel,
  vendorLabel,
} from './device-labels';
import {
  bindingOf,
  blindsUsing,
  openingSensorsOf,
  sameDevice,
} from './device-rules';
import { SmartDeviceForm } from './smart-device-form';

/** What the card shows besides its devices: nothing more, a form, or a question. */
type Panel =
  | { readonly kind: 'view' }
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly id: number }
  | { readonly kind: 'remove'; readonly id: number };

const VIEW: Panel = { kind: 'view' };

/**
 * The devices of one room as the registry holds them, with everything the administrator can
 * do about them: register one more, change one, switch it off and on for the services, remove
 * it.
 *
 * **Nothing here is optimistic.** A change is sent, the registry is read again, and the card
 * shows that answer; a change that failed is told in the card, next to the devices as the
 * registry has them. **What cannot be undone asks first**, in the card itself: removing a
 * device.
 *
 * **One thing at a time in a card**: while a form or a question is open, the buttons of the
 * other rows wait - a change made from one of them would close the form with what was typed
 * into it, or put its failure into a form that never made it.
 *
 * A device moved to another room leaves this card and appears in the other one - which is why
 * the card emits nothing after a change: it may be gone by then.
 */
@Component({
  selector: 'app-room-devices',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    SmartDeviceForm,
  ],
  templateUrl: './room-devices.html',
  styleUrl: './room-devices.scss',
  // the rows are pieces of text side by side - a kind, a vendor, an address and a channel:
  // stripped of the white space between them a screen reader gets "ShellyGen 2"
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomDevices {
  /** Two cards on one page must not share the ids their questions are named by. */
  private static cards = 0;
  protected readonly id = `room-devices-${RoomDevices.cards++}`;

  readonly group = input.required<RoomGroup>();
  /** The key of the name of the floor the room lies on. */
  readonly floor = input.required<MessageKey>();
  /**
   * Everything the registry answered, an entry this page cannot show included: what a binding
   * must not repeat.
   */
  readonly all = input.required<readonly SmartDevice[]>();
  readonly registry = input.required<DeviceRegistry>();

  private readonly injector = inject(Injector);
  private readonly cancelButton = viewChild('cancelButton', { read: ElementRef });

  protected readonly describe = describeDeviceError;
  protected readonly summary = changeSummary;
  protected readonly kindIcon = kindIcon;
  protected readonly kindLabel = kindLabel;
  protected readonly lightKindLabel = lightKindLabel;
  protected readonly placementLabel = placementLabel;
  protected readonly vendorLabel = vendorLabel;
  protected readonly bindingOf = bindingOf;

  /**
   * A value of the answer as a number - or `undefined` for anything else. Nothing checks an
   * answer, and only a number of our own reading may be a parameter of a translation: text
   * from outside is printed as it came.
   */
  protected numberOf(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  protected readonly panel = signal<Panel>(VIEW);
  /** Why the last change asked for in this card was not carried out. */
  protected readonly failure = signal<ApiError | undefined>(undefined);
  /** A change asked for in this card is on its way. */
  protected readonly saving = signal(false);

  /** A change is on its way, from this card or another: one at a time. */
  protected readonly busy = computed(() => this.registry().changing());
  protected readonly devices = computed(() => this.group().devices);

  constructor() {
    // A form or a question about a device is about that device. When it goes - removed in
    // another tab, moved to another room by the change just made - the panel goes for good:
    // it must not come back by itself should the device return.
    effect(() => {
      const panel = this.panel();
      if (
        (panel.kind === 'edit' || panel.kind === 'remove') &&
        !this.devices().some((device) => device.id === panel.id)
      ) {
        this.panel.set(VIEW);
      }
    });
  }

  /**
   * The opening sensors of the window of blinds (HAS-290), by their names in the registry - an
   * id it does not hold is shown as the id.
   */
  protected sensorsOf(device: SmartDevice): readonly { readonly id: number; readonly name?: string }[] {
    return openingSensorsOf(device).map((id) => ({
      id,
      name: this.all().find((one) => one.id === id)?.name,
    }));
  }

  /** The blinds that name this device as a sensor of their window: the registry keeps it. */
  protected usersOf(device: RegisteredDevice): readonly SmartDevice[] {
    return blindsUsing(device.id, this.all());
  }

  /** Every device of the registry but one: what the binding of that one must not repeat. */
  protected othersThan(id: number | undefined): readonly SmartDevice[] {
    return this.all().filter((device) => device.id !== id);
  }

  protected open(panel: Panel): void {
    this.failure.set(undefined);
    this.panel.set(panel);
    if (panel.kind === 'remove') {
      // the button that was pressed is gone with the question: the safe answer takes the focus
      afterNextRender(() => this.cancelButton()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  protected close(): void {
    this.open(VIEW);
  }

  protected add(details: DeviceDetails): void {
    void this.run(this.registry().add(details));
  }

  protected save(before: RegisteredDevice, details: DeviceDetails): void {
    if (sameDevice(before, details)) {
      // nothing was changed: no write for it - every write stores the whole row
      this.close();
      return;
    }
    void this.run(this.registry().replace(before, details));
  }

  protected setEnabled(device: RegisteredDevice, enabled: boolean): void {
    void this.run(this.registry().setEnabled(device.id, enabled));
  }

  protected remove(id: number): void {
    void this.run(this.registry().remove(id));
  }

  /**
   * Waits for a change and for the registry read after it. Carried out, the card shows its
   * devices again - as the registry has them now; not carried out, the form or the question
   * stays, with the reason.
   */
  private async run(change: Promise<ChangeOutcome>): Promise<void> {
    this.failure.set(undefined);
    this.saving.set(true);
    const outcome = await change;
    this.saving.set(false);
    if (outcome.carriedOut) {
      this.panel.set(VIEW);
    } else {
      this.failure.set(outcome.failure);
    }
  }
}
