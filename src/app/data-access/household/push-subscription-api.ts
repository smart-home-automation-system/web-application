import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { BrowserSubscription } from '../../core/push/push-platform';

/** `GET /home/household/push-config`: the public VAPID key, absent where the deployment has none. */
export interface PushConfig {
  readonly publicKey?: string;
}

/**
 * The Web Push subscriptions of the browsers of the household in `database-service` >= 0.18.0
 * (HAS-272), written by the installed application (HAS-284). Endpoints of their own, never a field
 * of a member: the read with the keys is notification-service's and is not routed - this
 * application only writes.
 */
@Injectable({ providedIn: 'root' })
export class PushSubscriptionApi {
  private readonly api = inject(ApiClient);

  config(): Observable<PushConfig | null> {
    return this.api.get<PushConfig | null>('/household/push-config');
  }

  /**
   * Stores the subscription of this browser for the member - an upsert by the endpoint, so the same
   * browser on another personal link moves to that member. `MEMBER_SWITCHED_OFF` (409) for a member
   * switched off. The answer is not used.
   */
  store(member: string, subscription: BrowserSubscription): Observable<void> {
    return this.api
      .put<unknown>(`/household/member/${encodeURIComponent(member)}/push-subscriptions`, {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        // the registry takes 500 characters; it is for telling the browsers of a member apart
        userAgent: navigator.userAgent.slice(0, 500),
      })
      .pipe(map(() => undefined));
  }

  /** Removes it; 204 also when the member had none of that endpoint. */
  remove(member: string, endpoint: string): Observable<void> {
    return this.api
      .delete<unknown>(`/household/member/${encodeURIComponent(member)}/push-subscriptions`, {
        endpoint,
      })
      .pipe(map(() => undefined));
  }
}
