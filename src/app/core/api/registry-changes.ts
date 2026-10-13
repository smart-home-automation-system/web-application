import { Signal, signal } from '@angular/core';
import { Observable, concat, lastValueFrom } from 'rxjs';

import { ApiError, toApiError } from './api-error';
import { PollingResource } from './polling-resource';

/** How a change of a registry ended. */
export interface ChangeOutcome {
  /** True when every call of the change was answered with a success. */
  readonly carriedOut: boolean;
  /**
   * Why it was not; absent for a change refused because another one was under way. A failure
   * of the `network` kind is a call that got no answer - it may have been carried out.
   */
  readonly failure?: ApiError;
}

const CARRIED_OUT: ChangeOutcome = { carriedOut: true };
const REFUSED: ChangeOutcome = { carriedOut: false };

/** The way the changes of one registry are made: one at a time, the registry read after each. */
export interface RegistryChanges {
  /** True from the moment a change is sent until the registry has been read again. */
  readonly changing: Signal<boolean>;
  /**
   * Makes the calls one after the other, none after one that failed, then reads the registry
   * again - and only then resolves, with how the change ended. Never rejects.
   */
  change(calls: readonly Observable<unknown>[]): Promise<ChangeOutcome>;
}

/**
 * The changes of a registry that is shown from a polled resource (the household, the devices).
 * There is no optimistic state: the answers of the calls are not used, and what is on screen
 * is what the registry gives when asked - also after a change that failed or got no answer,
 * which may have been carried out all the same.
 *
 * One change at a time: a second one asked for while `changing` is refused without a call,
 * because a write of these registries stores a whole row, and two for one row can undo each
 * other.
 *
 * `afterChange` is called when a change is over - carried out or not, the registry read
 * again; a change refused because another one was under way made no call and is followed by
 * nothing.
 */
export function registryChanges(
  registry: Pick<PollingResource<unknown>, 'refresh'>,
  afterChange?: () => void,
): RegistryChanges {
  const changing = signal(false);

  const change = async (calls: readonly Observable<unknown>[]): Promise<ChangeOutcome> => {
    if (changing()) {
      return REFUSED;
    }
    changing.set(true);
    let failure: ApiError | undefined;
    try {
      // one after the other, and none after one that failed
      await lastValueFrom(concat(...calls), { defaultValue: undefined });
    } catch (error) {
      failure = toApiError(error);
    }
    await registry.refresh();
    changing.set(false);
    // also after a change that failed: one that got no answer may have been carried out
    afterChange?.();
    return failure === undefined ? CARRIED_OUT : { carriedOut: false, failure };
  };

  return { changing: changing.asReadonly(), change };
}
