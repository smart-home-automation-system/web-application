import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { EMPTY, Observable, firstValueFrom, timeout } from 'rxjs';

import { offersHomeScreen, runsInstalled } from '../pwa/install-context';

/** What the browser says about notifications of this application. */
export type PushPermission = 'default' | 'granted' | 'denied';

/** The subscription of this browser as the registry stores it (`PushSubscription` of the SDK). */
export interface BrowserSubscription {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
  /** The public key of the house it was made with, base64url - absent where the browser does not say. */
  readonly serverKey?: string;
}

/**
 * Web Push as this browser offers it (HAS-284): whether it can take a push at all, the permission,
 * its subscription. One door, like `pollingResource` for the transport: the real one is Angular's
 * `SwPush` and the `Notification` of the browser, the `mock` build puts a fake one in its place
 * (`src/mocks/mock-push.ts`) - the dev server and the mock build register no service worker, so
 * without it the switch could be neither looked at nor tested in a browser.
 */
export interface PushPlatform {
  /** The service worker runs and the browser has the Push API and notifications. */
  readonly supported: boolean;
  /** A tab of Safari on an iPhone: push comes only after the application is on the home screen. */
  readonly offersHomeScreen: boolean;
  permission(): PushPermission;
  /** Has to be called from the tap itself: iOS asks only inside a user gesture. */
  requestPermission(): Promise<PushPermission>;
  /** The subscription the browser holds now, `null` for none. */
  current(): Promise<BrowserSubscription | null>;
  subscribe(serverPublicKey: string): Promise<BrowserSubscription>;
  /** Ends the subscription of the browser; nothing to end is no error. */
  unsubscribe(): Promise<void>;
  /** The pushes that arrive while the application is open. */
  readonly messages: Observable<unknown>;
}

export const PUSH_PLATFORM = new InjectionToken<PushPlatform>('push platform', {
  providedIn: 'root',
  factory: () => swPushPlatform(),
});

// the worker answers the subscription it holds once it is ready - and it is registered
// `registerWhenStable:30000`: a page that polls is never stable, so it is ready only after 30 s
const READY_WITHIN_MS = 35_000;

function swPushPlatform(): PushPlatform {
  const swPush = inject(SwPush, { optional: true });
  const view = inject(DOCUMENT).defaultView;
  const supported =
    swPush?.isEnabled === true &&
    !!view &&
    'Notification' in view &&
    'PushManager' in view &&
    // iOS gives push to the home-screen application only, whatever it has in a tab
    (!('standalone' in view.navigator) || runsInstalled(view));

  return {
    supported,
    offersHomeScreen: offersHomeScreen(view),
    permission: () =>
      view && 'Notification' in view ? (view.Notification.permission as PushPermission) : 'denied',
    requestPermission: async () =>
      view && 'Notification' in view
        ? ((await view.Notification.requestPermission()) as PushPermission)
        : 'denied',
    current: async () => {
      if (!swPush?.isEnabled) {
        return null;
      }
      const subscription = await firstValueFrom(
        swPush.subscription.pipe(timeout(READY_WITHIN_MS)),
      ).catch(() => null);
      return subscription ? toBrowserSubscription(subscription) : null;
    },
    subscribe: async (serverPublicKey) => {
      if (!swPush?.isEnabled) {
        throw new Error('No service worker takes pushes in this browser');
      }
      return toBrowserSubscription(await swPush.requestSubscription({ serverPublicKey }));
    },
    unsubscribe: async () => {
      if (swPush?.isEnabled) {
        // SwPush throws when there is nothing to end - which is what was asked for
        await swPush.unsubscribe().catch(() => undefined);
      }
    },
    messages: swPush?.isEnabled ? swPush.messages : EMPTY,
  };
}

/** The keys as the browser hands them out: base64url, what the registry checks them as. */
export function toBrowserSubscription(subscription: PushSubscription): BrowserSubscription {
  const json = subscription.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('The browser gave a subscription without its keys');
  }
  const key = subscription.options?.applicationServerKey;
  return {
    endpoint: json.endpoint,
    keys: { p256dh, auth },
    ...(key ? { serverKey: base64url(key) } : {}),
  };
}

/** One key, written padded or not. */
export function sameKey(a: string, b: string): boolean {
  return a.replace(/=+$/, '') === b.replace(/=+$/, '');
}

function base64url(key: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(key)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
