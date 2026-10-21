import { ChangeDetectionStrategy, Component, Signal, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import {
  HouseholdMember,
  HouseholdRegistry,
  MemberDetails,
} from '../../data-access/household/household-api';
import { MemberForm } from './member-form';

/** What the window of a new member is opened with: the registry, and its members as a signal. */
export interface AddMemberDialogData {
  readonly registry: HouseholdRegistry;
  /** The members the form checks a name and a phone against - followed while the window is open. */
  readonly members: Signal<readonly HouseholdMember[]>;
}

/** The size of the window: as wide as the form reads well, as tall as the screen allows. */
export const ADD_MEMBER_DIALOG_SIZE = {
  width: 'min(560px, calc(100vw - 32px))',
  maxWidth: '100vw',
  maxHeight: 'calc(100dvh - 48px)',
} as const;

/**
 * A new member of the household in a window of its own (owner, 2026-10-21, HAS-266): the form
 * opened in the card of the registry moved the cards of the page. The rules of the registry hold
 * here as there - the change resolves with how it ended, and only a change carried out closes the
 * window; a failure stays in the form, as entered.
 */
@Component({
  selector: 'app-add-member-dialog',
  imports: [MatDialogModule, TranslocoDirective, MemberForm],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('household.registry.newMember') }}</h2>
      <mat-dialog-content>
        <app-member-form
          [others]="data.members()"
          [busy]="data.registry.changing()"
          [failure]="failure()"
          (saved)="add($event)"
          (cancelled)="window.close()"
        />
      </mat-dialog-content>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddMemberDialog {
  protected readonly data = inject<AddMemberDialogData>(MAT_DIALOG_DATA);
  protected readonly window = inject(MatDialogRef);
  /** Why the member of the form was not added. */
  protected readonly failure = signal<ApiError | undefined>(undefined);

  protected async add(details: MemberDetails): Promise<void> {
    this.failure.set(undefined);
    const outcome = await this.data.registry.add(details);
    if (outcome.carriedOut) {
      this.window.close();
    } else {
      this.failure.set(outcome.failure);
    }
  }
}
