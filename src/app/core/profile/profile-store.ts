import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { HouseholdApi } from '../../data-access/household/household-api';
import { ApiError, toApiError } from '../api/api-error';
import { Profile, parseProfile, sameName, sameProfile, toProfiles } from './profile';

/** Where the profile is kept: the member with the role and rooms the registry last gave them. */
const STORAGE_KEY = 'smart-home.profile';

/**
 * How opening a profile ended: `unknown` - nobody active in the registry answers to the name;
 * `unavailable` - the registry could not be asked, so nothing is known either way.
 */
export type OpenResult = 'opened' | 'unknown' | 'unavailable';

/**
 * Who is using the application in this browser. A profile is opened by a personal link
 * (`/u/<member>`) or from the picker, checked against the household registry and remembered -
 * with its role and rooms, so the application starts as the same person at once, also while the
 * backend is away. Every start asks the registry again: a role changed there, or a member
 * switched off, takes effect with the next answer.
 *
 * **This is not a login.** Anybody who can reach the application can open anybody's link; the
 * profile decides what the interface offers, never what the backend answers. Phase 2 puts a
 * token into the link and lets the gateway check it - `open()` then takes the token instead of
 * the name, and nothing outside `core/profile` changes.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly api = inject(HouseholdApi);
  private readonly document = inject(DOCUMENT);
  private readonly active = signal<Profile | undefined>(readStored(), { equal: sameProfile });
  private readonly registry = signal<readonly Profile[] | undefined>(undefined);
  private readonly failure = signal<ApiError | undefined>(undefined);
  private readonly pending = signal(false);
  private inFlight: Promise<boolean> | undefined;

  /** The profile in use, `undefined` until somebody chose one. */
  readonly profile: Signal<Profile | undefined> = this.active.asReadonly();
  /** The active members of the household as last answered; `undefined` before the first answer. */
  readonly members: Signal<readonly Profile[] | undefined> = this.registry.asReadonly();
  /** True while the registry is being asked. */
  readonly loading: Signal<boolean> = this.pending.asReadonly();
  /** Why the last question to the registry failed; cleared by the next answer. */
  readonly error: Signal<ApiError | undefined> = this.failure.asReadonly();

  constructor() {
    this.watchOtherTabs();
  }

  /**
   * Asks the registry for the household and brings the profile in use up to date: a new role or
   * new rooms replace the remembered ones, and a member who is gone or switched off loses the
   * profile. Answers false when the registry could not be asked - the profile then stays as it
   * was remembered. Calls made while one is under way share its answer.
   */
  refresh(): Promise<boolean> {
    this.inFlight ??= this.load().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  /**
   * Opens the profile of a member, by the name a personal link carries. The registry is asked
   * first, so only somebody who is in it, and active, gets a profile.
   */
  async open(member: string): Promise<OpenResult> {
    if (!(await this.refresh())) {
      return 'unavailable';
    }
    const found = this.registry()?.find((candidate) => sameName(candidate.name, member));
    if (found === undefined) {
      return 'unknown';
    }
    this.use(found);
    return 'opened';
  }

  private async load(): Promise<boolean> {
    this.pending.set(true);
    try {
      const answer: unknown = await firstValueFrom(this.api.members());
      if (!Array.isArray(answer)) {
        // a 200 that is not the registry: nothing to conclude about anybody from it
        throw new ApiError('invalid-response', 200);
      }
      const members = toProfiles(answer);
      this.registry.set(members);
      this.failure.set(undefined);
      this.reconcile(members);
      return true;
    } catch (error) {
      this.failure.set(toApiError(error));
      return false;
    } finally {
      this.pending.set(false);
    }
  }

  private reconcile(members: readonly Profile[]): void {
    const current = this.active();
    if (current !== undefined) {
      this.use(members.find((candidate) => candidate.name === current.name));
    }
  }

  private use(profile: Profile | undefined): void {
    this.active.set(profile);
    // storage can be unavailable (private mode, blocked site data): the profile then lasts a session
    try {
      if (profile === undefined) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      }
    } catch {
      // nothing to do
    }
  }

  /** A profile opened or lost in another tab of this browser is the profile of this one too. */
  private watchOtherTabs(): void {
    const view = this.document.defaultView;
    const onStorage = (event: StorageEvent) => {
      // a null key is "everything was cleared"
      if (event.key === STORAGE_KEY || event.key === null) {
        this.active.set(readStored());
      }
    };
    view?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => view?.removeEventListener('storage', onStorage));
  }
}

function readStored(): Profile | undefined {
  try {
    return parseProfile(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    // unreadable storage or a value that is not JSON: as if nobody was chosen
    return undefined;
  }
}
