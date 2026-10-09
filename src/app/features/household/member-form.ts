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
import { sameName } from '../../core/profile/profile';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { PERMISSION_LABELS, ROLE_LABELS } from '../../shared/member-labels/member-labels';
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

  /** The name the member had when the form was opened. */
  private readonly nameBefore = signal<string | undefined>(undefined);

  /**
   * What is about to happen to the name of an existing member, said in the form before it is
   * saved. A new `name` is a new person to everything keyed by it: the personal link, the
   * icon on the phone, the presence history. Another `spelling` - only the case differs -
   * keeps the link and the profile, which find a member whatever the case; the presence
   * history, kept under the name exactly as written, still stays under the old one.
   */
  protected readonly renaming = computed((): 'name' | 'spelling' | undefined => {
    const before = this.nameBefore();
    const typed = normaliseName(this.typedName());
    if (before === undefined || typed === before) {
      return undefined;
    }
    return sameName(typed, before) ? 'spelling' : 'name';
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
    this.nameBefore.set(member.name);
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
    // checked again now: a control keeps the verdict of its last change, and the registry -
    // what a name and a phone number must not repeat - may have changed since
    this.name.updateValueAndValidity();
    this.phone.updateValueAndValidity();
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
