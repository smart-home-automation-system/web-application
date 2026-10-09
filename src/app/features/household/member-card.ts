import { DOCUMENT } from '@angular/common';
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
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import {
  ChangeOutcome,
  DeviceDetails,
  HouseholdMember,
  HouseholdRegistry,
  MemberDetails,
} from '../../data-access/household/household-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { permissionLabel, roleLabel } from '../../shared/member-labels/member-labels';
import { QrCode } from '../../shared/qr-code/qr-code';
import { DeviceForm } from './device-form';
import { changeSummary, describeHouseholdError } from './household-errors';
import { MemberForm } from './member-form';
import { memberLink } from './member-link';

/** What the card shows below the member: nothing more, a form, or a question. */
type Panel =
  | { readonly kind: 'view' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'add-device' }
  | { readonly kind: 'edit-device'; readonly mac: string }
  | { readonly kind: 'remove-device'; readonly mac: string };

const VIEW: Panel = { kind: 'view' };

/**
 * One member of the household as the registry holds them, with everything the administrator
 * can do about them: change the details, the rooms and the permissions, switch the member off
 * and on, remove them, manage their devices, and hand out their personal link.
 *
 * **Nothing here is optimistic.** A change is sent, the registry is read again, and the card
 * shows that answer; a change that failed is told in the card, next to the member as the
 * registry has them. **What cannot be undone asks first**, in the card itself: removing a
 * member or a device.
 *
 * The member using the application in this browser (`own`) cannot be renamed, demoted, switched
 * off or removed from here: each of those would take the profile this browser remembers, or
 * close this very page to the person on it.
 */
@Component({
  selector: 'app-member-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DeviceForm,
    MemberForm,
    QrCode,
  ],
  templateUrl: './member-card.html',
  styleUrl: './member-card.scss',
  // the rows are pieces of text side by side - rooms, a device and its address: stripped of the
  // white space between them a screen reader and the clipboard get "bedroomwardrobe"
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberCard {
  /** Two cards on one page must not share the ids their questions are named by. */
  private static cards = 0;
  protected readonly id = `member-card-${MemberCard.cards++}`;

  readonly member = input.required<HouseholdMember>();
  /** The whole registry: what a name, a phone number and a MAC address must not repeat. */
  readonly members = input.required<readonly HouseholdMember[]>();
  readonly registry = input.required<HouseholdRegistry>();
  /** The member is the one using the application in this browser. */
  readonly own = input(false);

  private readonly injector = inject(Injector);
  private readonly origin = inject(DOCUMENT).location.origin;
  private readonly cancelButton = viewChild('cancelButton', { read: ElementRef });

  protected readonly describe = describeHouseholdError;
  protected readonly summary = changeSummary;
  protected readonly roleLabel = roleLabel;
  protected readonly permissionLabel = permissionLabel;

  protected readonly panel = signal<Panel>(VIEW);
  /** Why the last change asked for in this card was not carried out. */
  protected readonly failure = signal<ApiError | undefined>(undefined);
  /** A change asked for in this card is on its way. */
  protected readonly saving = signal(false);
  protected readonly codeShown = signal(false);

  /** A change is on its way, from this card or another: one at a time. */
  protected readonly busy = computed(() => this.registry().changing());

  /** Switched off only when the registry says so: a member without the field is not. */
  protected readonly active = computed(() => this.member().active !== false);
  protected readonly others = computed(() =>
    this.members().filter((other) => other.name !== this.member().name),
  );
  protected readonly devices = computed(() => this.member().devices ?? []);
  protected readonly link = computed(() => memberLink(this.origin, this.member().name));

  /** The address of the device being edited; a new device has none yet. */
  private readonly editedMac = computed(() => {
    const panel = this.panel();
    return panel.kind === 'edit-device' ? panel.mac : undefined;
  });

  /** The names of the member's devices other than the one being edited. */
  protected readonly otherDeviceNames = computed(() =>
    this.devices().flatMap((device) =>
      device.mac === this.editedMac() || device.name === undefined ? [] : [device.name],
    ),
  );

  /** Every address in the registry other than that of the device being edited. */
  protected readonly otherMacs = computed(() =>
    this.members()
      .flatMap((member) => member.devices ?? [])
      .flatMap((device) =>
        device.mac === undefined || device.mac === this.editedMac() ? [] : [device.mac],
      ),
  );

  /** The member as the form of the card was opened with - what its changes are measured by. */
  private editedFrom: HouseholdMember | undefined;

  protected readonly icon = computed(() => {
    if (!this.active()) {
      return 'person_off';
    }
    return this.member().role === 'admin' ? 'shield_person' : 'person';
  });

  constructor() {
    // A form or a question about a device is about that device. When it goes - removed in
    // another tab, or by the change just made - the panel goes for good: it must not come
    // back by itself should a device with that address be registered again.
    effect(() => {
      const panel = this.panel();
      if (
        (panel.kind === 'edit-device' || panel.kind === 'remove-device') &&
        !this.devices().some((device) => device.mac === panel.mac)
      ) {
        this.panel.set(VIEW);
      }
    });
  }

  /** The device a form or a question of this card is about. */
  protected deviceOf(mac: string) {
    return this.devices().find((device) => device.mac === mac);
  }

  protected open(panel: Panel): void {
    this.failure.set(undefined);
    if (panel.kind === 'edit') {
      this.editedFrom = this.member();
    }
    this.panel.set(panel);
    if (panel.kind === 'remove' || panel.kind === 'remove-device') {
      // the button that was pressed is gone with the question: the safe answer takes the focus
      afterNextRender(() => this.cancelButton()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  protected close(): void {
    this.open(VIEW);
  }

  /**
   * Saves the form against the member **as the form was opened with**, not as the registry has
   * them now: only what somebody changed in the form is sent. Compared with the member of this
   * moment, a room or a permission granted elsewhere while the form was open would read as a
   * change of the form - and be written back to what it was.
   */
  protected save(details: MemberDetails): void {
    void this.run(this.registry().update(this.editedFrom ?? this.member(), details));
  }

  protected setActive(active: boolean): void {
    void this.run(this.registry().setActive(this.member().name, active));
  }

  protected remove(): void {
    void this.run(this.registry().remove(this.member().name));
  }

  protected addDevice(device: DeviceDetails): void {
    void this.run(this.registry().addDevice(this.member().name, device));
  }

  protected saveDevice(mac: string, device: DeviceDetails): void {
    const before = this.deviceOf(mac);
    if (before?.name === device.name && before.mac === device.mac) {
      // nothing was changed: no write for it, like a member saved as they were
      this.close();
      return;
    }
    void this.run(this.registry().updateDevice(this.member().name, mac, device));
  }

  protected removeDevice(mac: string): void {
    void this.run(this.registry().removeDevice(this.member().name, mac));
  }

  /**
   * Waits for a change and for the registry read after it. Carried out, the card shows the
   * member again - as the registry has them now; not carried out, the form or the question
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
