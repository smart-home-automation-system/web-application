import { ChangeDetectionStrategy, Component, OnInit, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { DeviceDetails, MemberDevice } from '../../data-access/household/household-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { changeSummary, describeHouseholdError } from './household-errors';
import {
  deviceNameProblem,
  macProblem,
  normaliseMac,
  normaliseName,
  problemOf,
  rule,
} from './member-rules';

/**
 * The form of a device of a member - a new one, or `device` as the registry holds it. Like the
 * form of a member it checks before anything is sent and sends nothing itself.
 */
@Component({
  selector: 'app-device-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
  ],
  template: `
    <ng-container *transloco="let t">
      <form class="form" novalidate (submit)="$event.preventDefault(); submit()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ t('household.device.name') }}</mat-label>
          <input matInput autocomplete="off" maxlength="60" [formControl]="name" />
          @if (problemOf(name); as problem) {
            <mat-error>{{ t(problem) }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ t('household.device.mac') }}</mat-label>
          <input
            matInput
            class="mac"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="20"
            [formControl]="mac"
          />
          <mat-hint>{{ t('household.device.macHint') }}</mat-hint>
          @if (problemOf(mac); as problem) {
            <mat-error>{{ t(problem) }}</mat-error>
          }
        </mat-form-field>

        @if (busy()) {
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="t('household.change.saving')" />
        }
        @if (failure(); as failed) {
          <app-api-error-strip
            data-testid="change-failure"
            [error]="failed"
            [summary]="t(summary(failed))"
            [describeWith]="describe"
          />
        }

        <div class="form__actions">
          <button matButton type="button" [disabled]="busy()" (click)="cancelled.emit()">
            {{ t('household.form.cancel') }}
          </button>
          <button matButton="filled" type="submit" [disabled]="busy()">
            {{ t(device() ? 'household.form.save' : 'household.form.add') }}
          </button>
        </div>
      </form>
    </ng-container>
  `,
  styleUrl: './member-form.scss',
  styles: `
    .mac {
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceForm implements OnInit {
  /** The device to change; without one the form adds a device. */
  readonly device = input<MemberDevice>();
  /** The names of the member's other devices: a member has one device of a name. */
  readonly otherNames = input<readonly string[]>([]);
  /** The addresses of every other device in the registry: an address is registered once. */
  readonly otherMacs = input<readonly string[]>([]);
  /** A change is on its way. */
  readonly busy = input(false);
  /** Why the last attempt to save was not carried out. */
  readonly failure = input<ApiError>();

  readonly saved = output<DeviceDetails>();
  readonly cancelled = output();

  protected readonly problemOf = problemOf;
  protected readonly describe = describeHouseholdError;
  protected readonly summary = changeSummary;

  protected readonly name = new FormControl('', {
    nonNullable: true,
    validators: rule(deviceNameProblem, () => this.otherNames()),
  });
  protected readonly mac = new FormControl('', {
    nonNullable: true,
    validators: rule(macProblem, () => this.otherMacs()),
  });

  ngOnInit(): void {
    const device = this.device();
    if (device !== undefined) {
      this.name.setValue(device.name ?? '');
      this.mac.setValue(device.mac ?? '');
    }
  }

  protected submit(): void {
    this.name.markAsTouched();
    this.mac.markAsTouched();
    if (this.name.invalid || this.mac.invalid || this.busy()) {
      return;
    }
    this.saved.emit({ name: normaliseName(this.name.value), mac: normaliseMac(this.mac.value) });
  }
}
