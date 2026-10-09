import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { sameName } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { isRecord } from '../../core/util/is-record';
import {
  HouseholdApi,
  HouseholdMember,
  MemberDetails,
} from '../../data-access/household/household-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { MemberCard } from './member-card';
import { MemberForm } from './member-form';

/**
 * The administration of the household: everybody the registry of `database-service` holds,
 * switched off or not, with their phone, rooms, permissions, devices and personal link - and
 * the one place of the application that changes the registry.
 *
 * **The administrator's page** (its route says nothing about access, which means exactly that)
 * and the only one that reads the whole registry, phone numbers and MAC addresses included;
 * every other view asks for the profiles. Like the roles themselves this is navigation, not
 * access control: the registry answers whoever reaches the gateway.
 *
 * Who may open what follows the registry, so after every change the profiles are asked for
 * again - a member switched off here loses their profile in this browser at once, not at the
 * next start.
 */
@Component({
  selector: 'app-household',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    MemberCard,
    MemberForm,
  ],
  templateUrl: './household.html',
  styleUrl: './household.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Household {
  private readonly profiles = inject(ProfileStore);
  // Asked for anew, never an answer already on its way: that one may predate the change.
  protected readonly registry = inject(HouseholdApi).watchRegistry(
    () => void this.profiles.refreshAfterChange(),
  );

  /**
   * The members of the answer, or `undefined` when the answer is not a list of them. Nothing
   * checks an answer at runtime: an entry without a name cannot be shown or addressed.
   */
  protected readonly members = computed((): readonly HouseholdMember[] | undefined => {
    const answer: unknown = this.registry.value();
    return Array.isArray(answer)
      ? (answer as unknown[]).filter(
          (entry): entry is HouseholdMember =>
            isRecord(entry) && typeof entry['name'] === 'string' && entry['name'] !== '',
        )
      : undefined;
  });

  protected readonly adding = signal(false);
  /** Why the member of the form was not added. */
  protected readonly addFailure = signal<ApiError | undefined>(undefined);

  protected isOwn(member: HouseholdMember): boolean {
    const profile = this.profiles.profile();
    return profile !== undefined && sameName(profile.name, member.name);
  }

  protected startAdding(): void {
    this.addFailure.set(undefined);
    this.adding.set(true);
  }

  protected stopAdding(): void {
    this.addFailure.set(undefined);
    this.adding.set(false);
  }

  protected async add(details: MemberDetails): Promise<void> {
    this.addFailure.set(undefined);
    const outcome = await this.registry.add(details);
    if (outcome.carriedOut) {
      this.adding.set(false);
    } else {
      this.addFailure.set(outcome.failure);
    }
  }
}
