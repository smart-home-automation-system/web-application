import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { MemberRole } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { describeApiError } from '../../shared/api-error/describe-api-error';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { ROLE_LABELS } from '../../shared/member-labels/member-labels';

const ROLE_ICONS: Readonly<Record<MemberRole, string>> = {
  admin: 'shield_person',
  resident: 'person',
};

/**
 * The profile picker: the active members of the household, each a link to their personal
 * address (`/u/<member>`) - so choosing here and opening one's own link are the same thing, and
 * an administrator can copy a link from this page to hand it out.
 *
 * Shown while nobody is chosen in this browser, and to an administrator who wants to look at the
 * application as somebody else.
 */
@Component({
  selector: 'app-profiles',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    DisplayTextPipe,
  ],
  templateUrl: './profiles.html',
  styleUrl: './profiles.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profiles {
  protected readonly store = inject(ProfileStore);
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roleIcons = ROLE_ICONS;
  protected readonly describeApiError = describeApiError;

  constructor() {
    // the list is the registry as it is now, not as it was when the application started
    void this.store.refresh();
  }

  protected retry(): void {
    void this.store.refresh();
  }
}
