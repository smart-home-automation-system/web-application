import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';

import { accessOf, redirectFor } from './access';
import { ProfileStore } from './profile-store';

/**
 * Lets a page open only for somebody who may see it, by the `data.access` of its route: without
 * a profile everything leads to the picker, and a resident who follows - or types - the address
 * of an administrator's page lands on their own.
 *
 * It judges by the profile remembered in the browser and never waits for the registry: the
 * application has to start while the backend is away. A role that changed there reaches the open
 * page through the shell, which asks the same rule again whenever the profile changes.
 *
 * Together with `profileInterceptor` this is the extension point of phase 2: once the link
 * carries a token, the guard is where an expired one is turned away.
 */
export const profileGuard: CanActivateChildFn = (route) => {
  const target = redirectFor(accessOf(route), inject(ProfileStore).profile());
  return target === undefined ? true : inject(Router).parseUrl(target);
};
