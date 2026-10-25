import { Injectable, Signal, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PushSubscriptionApi } from '../../data-access/household/push-subscription-api';
import { ApiError } from '../api/api-error';
import { ProfileStore } from '../profile/profile-store';
import { readText, writeText } from '../storage/browser-storage';
import { PUSH_PLATFORM, PushPlatform, sameKey } from './push-platform';

/**
 * Where the notifications of this device stand for the member on the page:<br>
 * `checking` - the browser is being asked;<br>
 * `unsupported` - no service worker, no Push API or no notifications here;<br>
 * `install` - a tab of Safari on an iPhone: the application has to be on the home screen first;<br>
 * `unconfigured` - the house has no VAPID key (`GET /household/push-config` answered `{}`);<br>
 * `denied` - the member blocked them, which only the settings of the device undo;<br>
 * `off` / `on` - the switch.
 */
export type DevicePushState =
  'checking' | 'unsupported' | 'install' | 'unconfigured' | 'denied' | 'off' | 'on';

/** A change that did not go through: told by the registry (`api`) or by the browser. */
export type DevicePushFailure =
  { readonly kind: 'api'; readonly error: ApiError } | { readonly kind: 'browser' };

const KEY_PREFIX = 'smart-home.push.';

/**
 * The Web Push subscription of this browser for the member of the profile (HAS-284). The member
 * switches it once, on My room or the settings; notification-service then pushes to it while they
 * are at home (HAS-276).
 * <p>
 * **What this browser did is remembered per member** (`localStorage['smart-home.push.<member>']`):
 * the subscription is the browser's, the member is the profile's - a tablet opened on two personal
 * links holds one subscription, and the registry gives it to whoever switched on last. **It is
 * checked again at every start**: a subscription the browser lost (iOS drops one now and then) is
 * made anew while the permission still stands, and an existing one is stored again - the write is an
 * upsert, so a registry that lost it, or a member renamed, gets it back.
 * <p>
 * **No optimistic state**: the switch shows `on` only once the registry stored it. Switching off ends
 * the subscription of the browser first - the device is silent whatever the registry answers - and
 * then removes it from the registry; a removal that fails leaves a row the push service answers 410
 * for, which notification-service removes by itself.
 */
@Injectable({ providedIn: 'root' })
export class PushSubscriptionStore {
  private readonly platform: PushPlatform = inject(PUSH_PLATFORM);
  private readonly api = inject(PushSubscriptionApi);
  private readonly profiles = inject(ProfileStore);

  private readonly current = signal<DevicePushState>('checking');
  private readonly pending = signal(false);
  private readonly failed = signal<DevicePushFailure | undefined>(undefined);
  private checkedFor: string | undefined;

  readonly state: Signal<DevicePushState> = this.current.asReadonly();
  /** A change on its way; a second one is ignored meanwhile. */
  readonly busy: Signal<boolean> = this.pending.asReadonly();
  readonly failure: Signal<DevicePushFailure | undefined> = this.failed.asReadonly();
  /** The pushes that arrive while the application is open. */
  readonly messages = this.platform.messages;

  constructor() {
    // once per member: the start, and another profile opened on this device
    effect(() => {
      const member = this.profiles.profile()?.name;
      if (member !== undefined && member !== this.checkedFor) {
        this.checkedFor = member;
        untracked(() => void this.check(member));
      }
    });
  }

  /** Has to be called from the tap itself: the permission is asked first, inside the gesture. */
  async enable(): Promise<void> {
    const member = this.profiles.profile()?.name;
    if (member === undefined || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failed.set(undefined);
    try {
      const permission = await this.platform.requestPermission();
      if (permission !== 'granted') {
        this.current.set(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const publicKey = await this.publicKey();
      if (publicKey === undefined) {
        this.current.set('unconfigured');
        return;
      }
      const subscription = await this.subscribed(publicKey);
      await firstValueFrom(this.api.store(member, subscription));
      writeText(keyOf(member), 'on');
      this.current.set('on');
    } catch (error) {
      this.failed.set(failureOf(error));
    } finally {
      this.pending.set(false);
    }
  }

  async disable(): Promise<void> {
    const member = this.profiles.profile()?.name;
    if (member === undefined || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failed.set(undefined);
    try {
      const subscription = await this.platform.current();
      await this.platform.unsubscribe();
      writeText(keyOf(member), undefined);
      this.current.set('off');
      if (subscription) {
        await firstValueFrom(this.api.remove(member, subscription.endpoint));
      }
    } catch (error) {
      this.failed.set(failureOf(error));
    } finally {
      this.pending.set(false);
    }
  }

  private async check(member: string): Promise<void> {
    this.failed.set(undefined);
    if (!this.platform.supported) {
      this.current.set(this.platform.offersHomeScreen ? 'install' : 'unsupported');
      return;
    }
    const permission = this.platform.permission();
    if (permission === 'denied') {
      this.current.set('denied');
      return;
    }
    if (readText(keyOf(member)) !== 'on') {
      this.current.set('off');
      return;
    }
    if (permission !== 'granted') {
      // the permission was reset on the device: what was switched on is gone with it
      writeText(keyOf(member), undefined);
      this.current.set('off');
      return;
    }
    try {
      const publicKey = await this.publicKey();
      if (this.overtaken(member)) {
        return;
      }
      if (publicKey === undefined) {
        this.current.set('unconfigured');
        return;
      }
      const subscription = await this.subscribed(publicKey);
      if (this.overtaken(member)) {
        return;
      }
      this.current.set('on');
      await firstValueFrom(this.api.store(member, subscription));
    } catch (error) {
      if (!this.overtaken(member)) {
        this.failed.set(failureOf(error));
      }
    }
  }

  /**
   * The subscription of this browser for the key of the house: the one it holds, or a new one - also
   * in place of one made with a key the house no longer has (a regenerated VAPID pair): the push
   * services refuse every push to it with 403, which nobody would ever remove, and the browser
   * refuses a second subscription with another key until the first is ended.
   */
  private async subscribed(publicKey: string) {
    const held = await this.platform.current();
    if (held && (held.serverKey === undefined || sameKey(held.serverKey, publicKey))) {
      return held;
    }
    if (held) {
      await this.platform.unsubscribe();
    }
    return this.platform.subscribe(publicKey);
  }

  /** A change the member started, or another profile opened, took over from the check of the start. */
  private overtaken(member: string): boolean {
    return this.pending() || this.profiles.profile()?.name !== member;
  }

  private async publicKey(): Promise<string | undefined> {
    const config = await firstValueFrom(this.api.config());
    const key = config?.publicKey;
    return typeof key === 'string' && key !== '' ? key : undefined;
  }
}

// the profile finds a member whatever the case (sameName): a name spelled anew keeps its switch
function keyOf(member: string): string {
  return KEY_PREFIX + member.toLowerCase();
}

function failureOf(error: unknown): DevicePushFailure {
  return error instanceof ApiError ? { kind: 'api', error } : { kind: 'browser' };
}
