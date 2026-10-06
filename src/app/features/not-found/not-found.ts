import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <section class="message-page">
      <mat-icon class="message-page__icon">explore_off</mat-icon>
      <h1>Page not found</h1>
      <p>There is nothing at this address. The link may be outdated or mistyped.</p>
      <a matButton="filled" routerLink="/">Go to the overview</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
