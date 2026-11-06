import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { ProfileStore } from '../../core/profile/profile-store';
import { dayAwareFormat, houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { MemberRequestsApi } from '../../data-access/household/member-requests-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { problemOf, validator } from '../../shared/form-rules/form-rules';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import {
  REQUEST_TEXT_MAX_LENGTH,
  normaliseRequestText,
  requestTextProblem,
} from '../household/member-rules';
import { describeRequestError, toRequestLists } from './my-requests-views';

/**
 * "Requests" on My room (HAS-411, epic HAS-407): the errands the household wrote for the member of the
 * profile - texted to them once, at 08:00 of the next morning, by notification-service 0.9.0 - each ticked
 * off or removed here, and a form to write one for anybody of the household. For every member with a
 * profile, in the row of the household; not a capability of a room.
 *
 * `GET /household/member/{name}/requests?done=true` every minute (`database-service` >= 0.22.0; an older
 * one answers the bare 404, which the card tells). Nothing optimistic: after a write the list is read
 * again, and only that answer moves the card. The text is checked before it is sent (`requestTextProblem`,
 * a copy of `MemberRequestRules`).
 */
@Component({
  selector: 'app-my-requests',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseDateTimePipe,
  ],
  templateUrl: './my-requests.html',
  styleUrl: './my-requests.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRequests {
  private readonly profiles = inject(ProfileStore);
  private readonly ticker = inject(Ticker);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;

  protected readonly me = computed(() => this.profiles.profile()?.name);
  protected readonly requests = inject(MemberRequestsApi).watch(this.me);

  /** The lists of the member on screen - never those of another profile while its answer is on its way. */
  protected readonly lists = computed(() => {
    const answered = this.requests.value();
    return answered !== undefined && answered.query === this.me()
      ? toRequestLists(answered.answer, this.me())
      : undefined;
  });
  /** The error and the freshness are those of the member on screen only. */
  protected readonly settled = computed(() => this.requests.settledFor()?.query === this.me());

  /** Whom a request can be written for: the profiles of the household, the member of the profile first. */
  protected readonly recipients = computed(() => {
    const me = this.me();
    const others = (this.profiles.members() ?? [])
      .map((member) => member.name)
      .filter((name) => name.toLowerCase() !== me?.toLowerCase());
    return me === undefined ? others : [me, ...others];
  });

  protected readonly recipient = new FormControl<string>('', { nonNullable: true });
  protected readonly text = new FormControl<string>('', {
    nonNullable: true,
    validators: validator(requestTextProblem),
  });
  // a group, or the form has no directive and `ngSubmit` never comes
  protected readonly form = new FormGroup({ recipient: this.recipient, text: this.text });
  protected readonly TEXT_MAX = REQUEST_TEXT_MAX_LENGTH;
  protected readonly problemOf = problemOf;

  protected readonly doneShown = signal(false);

  protected readonly failure = computed(() => {
    const failed = this.requests.failure();
    // a request removed already is removed: the list read again no longer has it
    if (
      failed === undefined ||
      (failed.change.kind === 'remove' && failed.error.hasCode('NOT_FOUND_REQUEST'))
    ) {
      return undefined;
    }
    const summary: MessageKey =
      failed.error.kind === 'network'
        ? 'requests.change.noAnswer'
        : failed.change.kind === 'add'
          ? 'requests.change.addFailed'
          : failed.change.kind === 'done'
            ? 'requests.change.doneFailed'
            : 'requests.change.removeFailed';
    return { ...failed, summary };
  });

  /** The request whose tick or removal is on its way. */
  protected readonly changingId = computed(() => {
    const change = this.requests.changing();
    return change !== undefined && change.kind !== 'add' ? change.id : undefined;
  });

  /** "Added for" a member whose list is not on this card. */
  protected readonly addedForOther = computed(() => {
    const added = this.requests.added();
    return added !== undefined && added.toLowerCase() !== this.me()?.toLowerCase()
      ? added
      : undefined;
  });

  private readonly today = computed(() => houseDay(this.ticker.now(), this.zone));
  protected readonly describeError = describeRequestError;

  constructor() {
    // the member of the profile is chosen until somebody chooses another; a profile changed in
    // another tab chooses its member
    effect(() => {
      const me = this.me();
      if (me !== undefined) {
        this.recipient.setValue(me);
      }
    });
  }

  protected timeFormat(text: string): Intl.DateTimeFormatOptions {
    return dayAwareFormat(text, this.today());
  }

  protected async add(): Promise<void> {
    const me = this.me();
    const recipient = this.recipient.value;
    this.text.markAsTouched();
    this.text.updateValueAndValidity();
    if (me === undefined || recipient === '' || this.text.invalid) {
      return;
    }
    const taken = await this.requests.add(recipient, normaliseRequestText(this.text.value), me);
    if (taken) {
      this.text.reset('');
    }
  }

  protected done(id: number): void {
    const me = this.me();
    if (me !== undefined) {
      this.requests.done(id, me);
    }
  }

  protected remove(id: number): void {
    this.requests.remove(id);
  }

  protected toggleDone(): void {
    this.doneShown.update((shown) => !shown);
  }
}
