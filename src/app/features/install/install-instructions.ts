import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * How to put the application on the home screen of an iPhone. Safari offers no install prompt -
 * "Add to Home Screen" is behind the Share button - so the steps are spelled out.
 *
 * Shown by the personal link, and only there: the icon opens the address it was added from, so
 * the page somebody adds has to be their own link (the web app manifest names no start address).
 * Whoever would rather stay in the browser goes on to the application.
 */
@Component({
  selector: 'app-install-instructions',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <mat-icon class="message-page__icon">add_to_home_screen</mat-icon>
      <h1>{{ t('install.title') }}</h1>
      <p>{{ t('install.lead') }}</p>

      <mat-card appearance="outlined" class="steps">
        <mat-card-content>
          <ol class="steps__list" [attr.aria-label]="t('install.steps')">
            <li>
              <mat-icon>ios_share</mat-icon>
              <span>{{ t('install.share') }}</span>
            </li>
            <li>
              <mat-icon>add_box</mat-icon>
              <span>{{ t('install.add') }}</span>
            </li>
            <li>
              <mat-icon>check</mat-icon>
              <span>{{ t('install.confirm') }}</span>
            </li>
          </ol>
        </mat-card-content>
      </mat-card>

      <a matButton="outlined" routerLink="/" replaceUrl>{{ t('install.continue') }}</a>
    </ng-container>
  `,
  styles: `
    // the parts are laid out by the page that shows them (.message-page)
    :host {
      display: contents;
    }

    .steps {
      align-self: stretch;
      margin-bottom: 8px;
      text-align: start;
    }

    mat-card-content {
      padding: 12px;
    }

    .steps__list {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-large);
      letter-spacing: var(--mat-sys-body-large-tracking);

      li {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      mat-icon {
        flex: none;
        color: var(--mat-sys-on-surface-variant);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallInstructions {}
