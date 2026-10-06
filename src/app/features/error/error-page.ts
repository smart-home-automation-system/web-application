import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Where a failed navigation ends. The usual cause is a new version deployed while this tab was
 * open - the page it tries to load no longer exists on the server - so the way out is a reload
 * from the start page, which fetches the current build.
 */
@Component({
  selector: 'app-error-page',
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
  template: `
    <section class="message-page" *transloco="let t">
      <mat-icon class="message-page__icon">error</mat-icon>
      <h1>{{ t('errorPage.title') }}</h1>
      <p>{{ t('errorPage.text') }}</p>
      <button matButton="filled" type="button" (click)="reload()">
        {{ t('errorPage.action') }}
      </button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPage {
  private readonly document = inject(DOCUMENT);

  protected reload(): void {
    this.document.location.assign('/');
  }
}
