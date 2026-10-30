import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError, toApiError } from '../../core/api/api-error';
import { LanguageMenu } from '../../core/layout/language-menu';
import { ProfileStore } from '../../core/profile/profile-store';
import { ApplianceApi, ClaimReply, TagRead } from '../../data-access/appliance/appliance-api';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { describeClaimError, readTag, worthRetrying } from './tag-read';

/**
 * Where the page is: the link was no tag read; nobody is known to hold the phone; the claim is on its
 * way; it was recorded; it failed; or the member was changed after a read that is spent - the tag has to
 * be read once more.
 */
type Phase = 'invalid' | 'choose' | 'opening' | 'sending' | 'done' | 'failed' | 'again';

/**
 * The page an NFC tag on an appliance opens (HAS-346): `/t?picc_data=…&cmac=…`, the SUN read of an
 * NTAG 424 DNA (HAS-343). It claims the chore of that appliance at once for the member this browser
 * remembers, and says how it ended in a few words on the whole screen.
 *
 * **It opens in the default browser of the phone, never in the installed application** - iOS reads the
 * tag in the background and opens its URL there. That browser keeps its own profile, apart from the
 * application's: when it knows nobody the page asks "who is holding the phone" once and makes the choice
 * the profile of this browser (`ProfileStore.open`, as a personal link does). "Not you?" changes it.
 *
 * A read is good for one claim, so the page never sends one by itself twice: the address loses the read
 * the moment it is taken (a reload or a tab restored later sends nothing), and a second attempt is the
 * person's - safe, because the service answers a read it already took with `REPLAYED_TAG`.
 */
@Component({
  selector: 'app-tag-claim',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    DisplayTextPipe,
    LanguageMenu,
  ],
  templateUrl: './tag-claim.html',
  styleUrl: './tag-claim.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagClaim {
  protected readonly profiles = inject(ProfileStore);
  private readonly api = inject(ApplianceApi);

  /** The read of the link, kept in memory only: the address no longer carries it. */
  private readonly read: TagRead | undefined;
  protected readonly phase = signal<Phase>('choose');
  protected readonly reply = signal<ClaimReply | undefined>(undefined);
  protected readonly failure = signal<ApiError | undefined>(undefined);
  /** The member the last claim was sent for - the one the outcome on screen is about. */
  protected readonly sentFor = signal<string | undefined>(undefined);
  /** The profile could not be opened: the registry did not answer. */
  protected readonly openFailed = signal(false);

  protected readonly member = computed(() => this.profiles.profile()?.name);
  protected readonly failureText = computed(() => {
    const failure = this.failure();
    return failure === undefined ? undefined : describeClaimError(failure);
  });
  protected readonly retryable = computed(() => {
    const failure = this.failure();
    return failure !== undefined && worthRetrying(failure);
  });

  constructor() {
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    this.read = readTag(query.get('picc_data'), query.get('cmac'));
    // a reload, or the browser restoring the tab tomorrow, must not send the read again
    inject(Location).replaceState('/t');

    if (this.read === undefined) {
      this.phase.set('invalid');
    } else if (this.member() === undefined) {
      this.choose();
    } else {
      this.send();
    }
  }

  /** "Not you?": the list of the household, to make somebody else the profile of this browser. */
  protected choose(): void {
    this.openFailed.set(false);
    this.phase.set('choose');
    void this.profiles.refresh();
  }

  protected async chosen(name: string): Promise<void> {
    // the read is spent once the service recorded it: the next claim needs the next read of the tag
    const spent = this.reply() !== undefined;
    this.openFailed.set(false);
    this.phase.set('opening');
    const result = await this.profiles.open(name);
    if (result === 'unavailable') {
      this.openFailed.set(true);
      this.phase.set('choose');
    } else if (result === 'unknown') {
      // gone from the registry since the list was read: the list is asked for again
      this.choose();
    } else if (spent) {
      this.phase.set('again');
    } else {
      this.send();
    }
  }

  protected retry(): void {
    this.send();
  }

  private send(): void {
    const member = this.member();
    if (this.read === undefined || member === undefined) {
      return;
    }
    this.sentFor.set(member);
    this.failure.set(undefined);
    this.phase.set('sending');
    this.api.claim(this.read, member).subscribe({
      next: (reply) => {
        this.reply.set(reply ?? {});
        this.phase.set('done');
      },
      error: (failure: unknown) => {
        const error = toApiError(failure);
        if (error.hasCode('UNKNOWN_MEMBER')) {
          // the remembered member is no longer in the registry - the read is not spent yet
          this.failure.set(error);
          this.choose();
          return;
        }
        this.failure.set(error);
        this.phase.set('failed');
      },
    });
  }
}
