import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslocoDirective],
  template: `
    <section class="message-page" *transloco="let t">
      <mat-icon class="message-page__icon">explore_off</mat-icon>
      <h1>{{ t('notFound.title') }}</h1>
      <p>{{ t('notFound.text') }}</p>
      <a matButton="filled" routerLink="/">{{ t('notFound.action') }}</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
