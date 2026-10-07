import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Where a call to the backend will say who makes it. **Today it adds nothing**: a profile is a
 * name anybody can type, so sending it would prove nothing, and the gateway checks nothing.
 *
 * It exists as the one place phase 2 changes: when a personal link carries a token and the
 * gateway validates it, the token is attached here (and a refused one ends the profile) - no
 * feature and no data-access class has to know.
 */
export const profileInterceptor: HttpInterceptorFn = (request, next) => next(request);
