import { signal } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiError, toApiError } from './api-error';

/** How the last command to one device went. */
export interface CommandState<A = void> {
  readonly sending: boolean;
  readonly error?: ApiError;
  /** The command went out and was taken - nothing more: the state of the device is read, not assumed. */
  readonly sent?: boolean;
  /** What the answer said of the command itself (a room: the blinds it skipped); never a state. */
  readonly answer?: A;
  /**
   * When the command was sent, in the order of every command of the application: what to tell
   * when two devices have something to say - the newest outcome, not a failure a later command
   * has since made old (HAS-252, found in review).
   */
  readonly order?: number;
}

// shared by every tracker, so that a room command and a command to one of its blinds compare
let sentSoFar = 0;

/**
 * The commands of a page to the devices of the house (HAS-232, HAS-252), by device: one at a time
 * per device, no optimistic state. A command is sent, then - where something reads the device
 * back - the state is read again, and only then is the device free for the next one and the
 * outcome told: a command that got no answer may have been carried out all the same. A write on
 * its way is not aborted with its component.
 */
export class DeviceCommands<K, A = void> {
  private readonly states = signal<ReadonlyMap<K, CommandState<A>>>(new Map());

  stateOf(key: K): CommandState<A> | undefined {
    return this.states().get(key);
  }

  /**
   * Sends `call` unless a command to the same device is still on its way. `readBack` reads the
   * device again and resolves when that call has answered; without it the command is told as
   * sent and nothing more (a light, whose state no service keeps).
   */
  send(key: K, call: Observable<A>, readBack?: () => Promise<void>): void {
    if (this.stateOf(key)?.sending) {
      return;
    }
    const order = ++sentSoFar;
    this.set(key, { sending: true, order });
    let answer: A | undefined;
    const done = (state: CommandState<A>) => {
      if (readBack === undefined) {
        this.set(key, state);
        return;
      }
      void readBack().then(() => this.set(key, state));
    };
    call.subscribe({
      next: (value) => (answer = value),
      error: (failure: unknown) => done({ sending: false, error: toApiError(failure), order }),
      complete: () =>
        done({ sending: false, sent: true, order, ...(answer === undefined ? {} : { answer }) }),
    });
  }

  private set(key: K, state: CommandState<A>): void {
    this.states.update((all) => new Map(all).set(key, state));
  }
}
