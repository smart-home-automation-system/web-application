import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { BUILD_INFO } from '../../core/build-info/build-info';

/** Which build is running - the first thing to check after a deployment. */
@Component({
  selector: 'app-about',
  imports: [DatePipe],
  template: `
    <header class="page-header">
      <h1>About</h1>
      <p>The build of the application running in this browser.</p>
    </header>

    <dl class="facts">
      <dt>Version</dt>
      <dd data-testid="app-version">{{ build.version }}</dd>
      <dt>Commit</dt>
      <dd>{{ build.commit }}</dd>
      <dt>Built</dt>
      <dd>{{ build.builtAt ? (build.builtAt | date: 'medium') : 'local build' }}</dd>
    </dl>
  `,
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  protected readonly build = BUILD_INFO;
}
