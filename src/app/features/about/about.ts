import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { BUILD_INFO } from '../../core/build-info/build-info';
import { LocalDateTimePipe } from '../../shared/local-date-time/local-date-time.pipe';

/** Which build is running - the first thing to check after a deployment. */
@Component({
  selector: 'app-about',
  imports: [TranslocoDirective, LocalDateTimePipe],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('about.title') }}</h1>
      </header>

      <dl class="facts">
        <dt>{{ t('about.version') }}</dt>
        <dd data-testid="app-version">{{ build.version }}</dd>
        <dt>{{ t('about.commit') }}</dt>
        <dd>{{ build.commit }}</dd>
        <dt>{{ t('about.built') }}</dt>
        <dd data-testid="app-built">
          {{
            build.builtAt
              ? (build.builtAt | localDateTime: { dateStyle: 'medium', timeStyle: 'medium' })
              : t('about.localBuild')
          }}
        </dd>
      </dl>
    </ng-container>
  `,
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  protected readonly build = BUILD_INFO;
}
