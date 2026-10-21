import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { sameName } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { isRecord } from '../../core/util/is-record';
import { HouseholdApi, HouseholdMember } from '../../data-access/household/household-api';
import { MessageKey } from '../../i18n/messages';
import { SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { ADD_MEMBER_DIALOG_SIZE, AddMemberDialog, AddMemberDialogData } from './add-member-dialog';
import { MemberCard } from './member-card';

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
  imports: [MatButtonModule, MatIconModule, TranslocoDirective, MemberCard, SourcesStrip],
  templateUrl: './household.html',
  styleUrl: './household.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Household {
  private readonly profiles = inject(ProfileStore);
  private readonly dialog = inject(MatDialog);
  // Asked for anew, never an answer already on its way: that one may predate the change.
  protected readonly registry = inject(HouseholdApi).watchRegistry(
    () => void this.profiles.refreshAfterChange(),
  );

  /** The one call of the page, told in the strip of sources as on the blinds page (HAS-266). */
  protected readonly sources = [
    { id: 'registry', label: 'household.registry.title' as MessageKey, resource: this.registry },
  ];

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

  protected isOwn(member: HouseholdMember): boolean {
    const profile = this.profiles.profile();
    return profile !== undefined && sameName(profile.name, member.name);
  }

  /** The new member is added in a window of its own, which follows the registry while open. */
  protected startAdding(): void {
    const data: AddMemberDialogData = {
      registry: this.registry,
      members: computed(() => this.members() ?? []),
    };
    this.dialog.open(AddMemberDialog, {
      ...ADD_MEMBER_DIALOG_SIZE,
      data,
      autoFocus: 'first-tabbable',
      // Escape or a click beside it would lose what was typed, or the failure of a change on its
      // way: the window closes with the buttons of the form only (review of HAS-266)
      disableClose: true,
    });
  }
}
