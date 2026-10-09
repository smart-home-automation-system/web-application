import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { HouseholdMember, MemberDetails } from '../../data-access/household/household-api';
import { MEMBER_PERMISSIONS, MEMBER_ROLES } from '../../data-access/household/registry-values';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { changeSummary, describeHouseholdError } from './household-errors';
import {
  nameProblem,
  normaliseName,
  normalisePhone,
  phoneProblem,
  problemOf,
  rule,
} from './member-rules';
import { RoomsPicker } from './rooms-picker';

const ROLE_LABELS: Readonly<Record<(typeof MEMBER_ROLES)[number], MessageKey>> = {
  admin: 'profiles.role.admin',
  resident: 'profiles.role.resident',
};

const PERMISSION_LABELS: Readonly<Record<(typeof MEMBER_PERMISSIONS)[number], MessageKey>> = {
  heating_switch: 'household.permission.heatingSwitch',
};

/**
 * The form of a member - a new one, or `member` as the registry holds them now. It checks what
 * the registry would refuse before anything is sent (`member-rules.ts`) and sends nothing
 * itself: `saved` carries what was entered, and whoever shows the form makes the change and
 * tells how it ended (`busy`, `failure`).
 *
 * Created anew for every use, so it starts from the member as they are at that moment.
 */
@Component({
  selector: 'app-member-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    RoomsPicker,
  ],
  templateUrl: './member-form.html',
  styleUrl: './member-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberForm implements OnInit {
  /** Two forms on one page must not share the ids their groups are named by. */
  private static forms = 0;
  protected readonly id = `member-form-${MemberForm.forms++}`;

  /** The member to change; without one the form adds a member. */
  readonly member = input<HouseholdMember>();
  /** Everybody else in the registry: a name and a phone number belong to one member. */
  readonly others = input<readonly HouseholdMember[]>([]);
  /**
   * The member is the one using the application in this browser: their name and role are not
   * to be changed from here - the profile this browser remembers would be gone, or the page
   * closed to the person editing it.
   */
  readonly own = input(false);
  /** A change is on its way. */
  readonly busy = input(false);
  /** Why the last attempt to save was not carried out. */
  readonly failure = input<ApiError>();

  readonly saved = output<MemberDetails>();
  readonly cancelled = output();

  protected readonly roles = MEMBER_ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly knownPermissions = MEMBER_PERMISSIONS;
  protected readonly permissionLabels = PERMISSION_LABELS;
  protected readonly problemOf = problemOf;
  protected readonly describe = describeHouseholdError;
  protected readonly summary = changeSummary;

  protected readonly name = new FormControl('', {
    nonNullable: true,
    validators: rule(nameProblem, () => this.others().map((other) => other.name)),
  });
  protected readonly phone = new FormControl('', {
    nonNullable: true,
    validators: rule(phoneProblem, () =>
      this.others().flatMap((other) => (other.phone === undefined ? [] : [other.phone])),
    ),
  });
  /** `undefined`: none chosen - the registry then keeps the role it has, or names a resident. */
  protected readonly role = signal<string | undefined>(undefined);
  protected readonly rooms = signal<readonly string[]>([]);
  /** Everything granted, a permission this version does not know included: it is sent back. */
  protected readonly permissions = signal<readonly string[]>([]);

  /** What the name field holds, as a signal - a form control is none. */
  private readonly typedName = signal('');

  /**
   * The name of an existing member is about to change. Their personal link is built from it and
   * the presence history is kept under it, so the form says what follows before it is saved.
   */
  protected readonly renaming = computed(() => {
    const before = this.member()?.name;
    return before !== undefined && normaliseName(this.typedName()) !== before;
  });

  constructor() {
    this.name.valueChanges.subscribe((value) => this.typedName.set(value));
  }

  ngOnInit(): void {
    const member = this.member();
    if (member === undefined) {
      this.role.set('resident');
      return;
    }
    this.name.setValue(member.name);
    this.phone.setValue(member.phone ?? '');
    this.role.set(member.role);
    this.rooms.set(member.rooms ?? []);
    this.permissions.set(member.permissions ?? []);
    if (this.own()) {
      this.name.disable();
    }
  }

  protected grant(permission: string, granted: boolean): void {
    this.permissions.update((held) => {
      const without = held.filter((one) => one !== permission);
      return granted ? [...without, permission] : without;
    });
  }

  protected submit(): void {
    this.name.markAsTouched();
    this.phone.markAsTouched();
    // a disabled control is neither valid nor invalid: the own name is not checked, nor changed
    if (this.name.invalid || this.phone.invalid || this.busy()) {
      return;
    }
    this.saved.emit({
      name: normaliseName(this.name.value),
      phone: normalisePhone(this.phone.value),
      role: this.role(),
      rooms: this.rooms(),
      permissions: this.permissions(),
    });
  }
}
