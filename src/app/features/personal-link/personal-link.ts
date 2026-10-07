import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { ProfileStore } from '../../core/profile/profile-store';
import { describeApiError } from '../../shared/api-error/describe-api-error';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';

/**
 * The personal link of a household member, `/u/<member>`: asks the registry for the member,
 * makes theirs the profile of this browser and goes on to the application - to the page their
 * role starts on. A link that names nobody, or somebody switched off, ends on a message that
 * says so; so does a registry that cannot be asked, with a way to try again. A profile already
 * in use is left alone in both cases.
 *
 * What comes after `/u/` is all this page knows about the link. In phase 2 it is a token instead
 * of a name; `ProfileStore.open()` is where that difference lives.
 */
@Component({
  selector: 'app-personal-link',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    DisplayTextPipe,
  ],
  template: `
    <section class="message-page" *transloco="let t">
      @switch (state()) {
        @case ('opening') {
          <mat-icon class="message-page__icon">account_circle</mat-icon>
          <h1>{{ t('personalLink.opening') }}</h1>
          <mat-progress-bar
            class="progress"
            mode="indeterminate"
            [attr.aria-label]="t('personalLink.opening')"
          />
        }
        @case ('unknown') {
          <mat-icon class="message-page__icon">person_off</mat-icon>
          <h1>{{ t('personalLink.unknownTitle') }}</h1>
          <p>{{ t('personalLink.unknownText') }}</p>
          <a matButton="filled" routerLink="/">{{ t('personalLink.continue') }}</a>
        }
        @case ('unavailable') {
          <mat-icon class="message-page__icon">cloud_off</mat-icon>
          <h1>{{ t('personalLink.unavailableTitle') }}</h1>
          @if (profiles.error(); as error) {
            <p role="alert">{{ describeApiError(error) | displayText }}</p>
          }
          <button matButton="filled" type="button" (click)="retry()">
            {{ t('profiles.retry') }}
          </button>
        }
      }
    </section>
  `,
  styles: `
    .progress {
      margin-top: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonalLink {
  protected readonly profiles = inject(ProfileStore);
  private readonly router = inject(Router);
  protected readonly state = signal<'opening' | 'unknown' | 'unavailable'>('opening');
  protected readonly describeApiError = describeApiError;
  private member = '';
  /** Counts the attempts, so that a slow answer cannot overrule a link opened after it. */
  private attempts = 0;

  constructor() {
    // the router keeps this page when one link is followed from another: listen, not read once
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.member = params.get('member') ?? '';
        void this.open();
      });
  }

  protected retry(): void {
    void this.open();
  }

  private async open(): Promise<void> {
    const attempt = ++this.attempts;
    this.state.set('opening');
    const result = await this.profiles.open(this.member);
    if (attempt !== this.attempts) {
      return;
    }
    if (result === 'opened') {
      // the start address leads everybody to the page of their role; the link leaves the history
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } else {
      this.state.set(result);
    }
  }
}
