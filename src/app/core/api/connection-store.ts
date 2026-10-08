import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

import { readJson, writeJson } from '../storage/browser-storage';
import { ApiError } from './api-error';

/** Where the time of the last answer of the backend is kept, for a start without a connection. */
const STORAGE_KEY = 'smart-home.last-contact';

/** A view polls every few seconds; the browser's storage is written at most this often. */
const REMEMBER_EVERY_MS = 60_000;

/** Calls in a row that have to go unanswered before the house counts as out of reach. */
const UNANSWERED_FOR_OFFLINE = 2;

/**
 * Whether the house can be reached. The application is served on the home network only: outside
 * it, without the VPN, it still starts - the service worker keeps it in the browser - and every
 * call then goes unanswered. This store turns those single failures into one fact the shell
 * shows as a banner, with the time the backend last answered.
 *
 * `ApiClient`, the only way to the backend, reports how every call ended:
 * - **any answer**, a refusal or a failing service included, means the house is within reach -
 *   what failed then is told by the view that asked;
 * - a call that got **no answer** (`network`) is only a doubt. One service behind the gateway
 *   that accepts a call and never answers looks exactly like that while the house is fine, so a
 *   single call decides nothing: the house is out of reach once two calls in a row went
 *   unanswered and nothing answered since the first of them was sent. Whoever shows the banner
 *   asks once more at the first doubt ({@link doubted}), so the second call follows at once;
 * - an answer that is not the API's (`invalid-response` - a captive page of a foreign network)
 *   proves nothing either way.
 *
 * The device going offline needs no call to be believed. Coming back online proves nothing about
 * the house, so the banner stays until a call is answered.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionStore {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly unreachable = signal(this.view?.navigator.onLine === false);
  private readonly inDoubt = signal(false);
  private readonly contact = signal<number | undefined>(readStored());
  private unanswered = 0;
  private answeredAt = 0;
  private rememberedAt = 0;

  /** True while the last thing known about the backend is that it does not answer. */
  readonly offline: Signal<boolean> = this.unreachable.asReadonly();
  /**
   * True from the first call that went unanswered until something answers: the moment to ask
   * once more, which settles it one way or the other.
   */
  readonly doubted: Signal<boolean> = this.inDoubt.asReadonly();
  /**
   * Epoch milliseconds of the last successful call - remembered by the browser, so a start
   * without a connection can still say when there last was one. `undefined` when there never was.
   */
  readonly lastContact: Signal<number | undefined> = this.contact.asReadonly();

  constructor() {
    const onOffline = () => {
      this.inDoubt.set(true);
      this.unreachable.set(true);
    };
    this.view?.addEventListener('offline', onOffline);
    inject(DestroyRef).onDestroy(() => this.view?.removeEventListener('offline', onOffline));
  }

  /** A call was answered with what was asked for. */
  succeeded(): void {
    const now = Date.now();
    this.contact.set(now);
    this.answered(now);
    if (now - this.rememberedAt >= REMEMBER_EVERY_MS) {
      this.rememberedAt = now;
      writeJson(STORAGE_KEY, now);
    }
  }

  /** A call failed; `sentAt` is when it was sent, in epoch milliseconds. */
  failed(error: ApiError, sentAt: number): void {
    if (error.kind === 'server' || error.kind === 'client') {
      this.answered(Date.now());
      return;
    }
    // something else answered while this call was waiting: the house is there, the call was not
    if (error.kind !== 'network' || this.answeredAt >= sentAt) {
      return;
    }
    this.unanswered += 1;
    this.inDoubt.set(true);
    if (this.unanswered >= UNANSWERED_FOR_OFFLINE) {
      this.unreachable.set(true);
    }
  }

  private answered(now: number): void {
    this.answeredAt = now;
    this.unanswered = 0;
    this.inDoubt.set(false);
    this.unreachable.set(false);
  }
}

/** Unreadable storage, or a value that is not a time of the past: as if there never was one. */
function readStored(): number | undefined {
  const value = readJson(STORAGE_KEY);
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= Date.now()
    ? value
    : undefined;
}
