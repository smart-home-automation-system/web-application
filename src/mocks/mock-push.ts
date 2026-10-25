import { EMPTY } from 'rxjs';

import { BrowserSubscription, PushPermission, PushPlatform } from '../app/core/push/push-platform';
import { readText as read, writeText as write } from '../app/core/storage/browser-storage';

/**
 * Web Push of the mock build (HAS-284): the dev server and the mock build register no service
 * worker, so `SwPush` takes nothing there. This one keeps the permission and the subscription in the
 * memory of the page and in `localStorage`, like a browser would across a reload.
 *
 * `localStorage['mock-push']` chooses the browser: `unsupported` (no Push API), `iphone-tab` (a tab of
 * Safari on an iPhone), `denied` (the member blocked them); anything else is an installed application
 * that asks for the permission and is granted it.
 */
const PERMISSION_KEY = 'mock-push-permission';
const SUBSCRIPTION_KEY = 'mock-push-subscription';

export function mockPushPlatform(): PushPlatform {
  const browser = read('mock-push');

  return {
    supported: browser !== 'unsupported' && browser !== 'iphone-tab',
    offersHomeScreen: browser === 'iphone-tab',
    permission: () =>
      browser === 'denied' ? 'denied' : ((read(PERMISSION_KEY) as PushPermission) ?? 'default'),
    requestPermission: async () => {
      const permission: PushPermission = browser === 'denied' ? 'denied' : 'granted';
      write(PERMISSION_KEY, permission);
      return permission;
    },
    current: async () => {
      const stored = read(SUBSCRIPTION_KEY);
      return stored ? (JSON.parse(stored) as BrowserSubscription) : null;
    },
    subscribe: async () => {
      const subscription: BrowserSubscription = {
        endpoint: 'https://web.push.apple.com/mock-' + Math.random().toString(36).slice(2),
        keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) },
      };
      write(SUBSCRIPTION_KEY, JSON.stringify(subscription));
      return subscription;
    },
    unsubscribe: async () => write(SUBSCRIPTION_KEY, undefined),
    messages: EMPTY,
  };
}
