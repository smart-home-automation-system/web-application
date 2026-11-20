import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError, toApiError } from '../../core/api/api-error';
import {
  SAFETY_REACTIONS,
  SafetyApi,
  SafetyAutomation as Automation,
  SafetyReaction,
} from '../../data-access/safety/safety-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { REACTION_LABELS, describeSafetyError } from '../../shared/safety/safety-labels';

/**
 * The switches of the reactions to a fire alarm (HAS-468, safety-service >= 0.5.0, `GET` / `PUT /safety/automation`):
 * light the way out, open the blinds of the room, stop the air conditioners - each off by default. A change sends the
 * whole body with the one switch turned, then the switches are read again; **no switch flips itself**
 * (`disableToggleValue`) - it shows what the service stored. Offered only while every switch is known: the `PUT`
 * replaces them all, so a value left out of the answer would be sent back made up. One change at a time.
 */
@Component({
  selector: 'app-safety-automation',
  imports: [
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
  ],
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="card--domain" data-testid="safety-automation">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>emergency_home</mat-icon></div>
          <mat-card-title>{{ t('safety.automation.title') }}</mat-card-title>
          <mat-card-subtitle>
            <app-data-freshness
              [lastUpdated]="automation.lastUpdated()"
              [stale]="automation.stale()"
            />
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="card__content">
          <p class="note">{{ t('safety.automation.explain') }}</p>
          @if (stored(); as switches) {
            <div class="switches">
              @for (reaction of REACTIONS; track reaction) {
                <mat-slide-toggle
                  [attr.data-reaction]="reaction"
                  data-testid="safety-reaction"
                  [checked]="switches[reaction]"
                  [disabled]="saving()"
                  (toggleChange)="turn(switches, reaction)"
                >
                  {{ t(LABELS[reaction]) }}
                </mat-slide-toggle>
              }
            </div>
          } @else if (automation.value() !== undefined) {
            <p class="note" data-testid="automation-unknown">
              {{ t('safety.automation.notKnown') }}
            </p>
          }
          <app-api-error-strip [error]="automation.error()" [describeWith]="describeError" />
          <app-api-error-strip
            [error]="saveFailure()"
            [summary]="t('safety.automation.saveFailed')"
            [describeWith]="describeError"
          />
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './safety-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyAutomation {
  private readonly api = inject(SafetyApi);
  protected readonly automation = this.api.watchAutomation();

  protected readonly REACTIONS = SAFETY_REACTIONS;
  protected readonly LABELS = REACTION_LABELS;
  protected readonly describeError = describeSafetyError;

  protected readonly saving = signal(false);
  protected readonly saveFailure = signal<ApiError | undefined>(undefined);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  /** Every switch as stored, or `undefined` while one of them is not known. */
  protected readonly stored = computed((): Required<Automation> | undefined => {
    const answer = this.automation.value();
    if (answer === undefined || answer === null) {
      return undefined;
    }
    const known = SAFETY_REACTIONS.every((reaction) => typeof answer[reaction] === 'boolean');
    return known ? (answer as Required<Automation>) : undefined;
  });

  /** The whole body with one switch turned, then the switches read again - only that answer moves them. */
  protected turn(switches: Required<Automation>, reaction: SafetyReaction): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveFailure.set(undefined);
    const after = (failure?: ApiError) =>
      void this.automation.refresh().then(() => {
        if (!this.destroyed) {
          this.saving.set(false);
          this.saveFailure.set(failure);
        }
      });
    this.api.saveAutomation({ ...switches, [reaction]: !switches[reaction] }).subscribe({
      error: (failure: unknown) => after(toApiError(failure)),
      complete: () => after(),
    });
  }
}
