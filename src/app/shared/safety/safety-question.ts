import { DestroyRef, Injector, Signal, effect, inject, signal } from '@angular/core';
import type { MatDialogRef } from '@angular/material/dialog';

import { SafetyCommand } from '../../data-access/safety/safety-api';
import { SafetyStore } from '../../data-access/safety/safety-store';
import type { ConfirmData, ConfirmDialog } from '../confirm-dialog/confirm-dialog';

/** The texts of the question before each command of a detector. */
const QUESTIONS: Readonly<Record<SafetyCommand, ConfirmData>> = {
  mute: {
    icon: 'notifications_off',
    title: 'safety.question.muteTitle',
    question: 'safety.question.mute',
    confirm: 'safety.mute',
    cancel: 'safety.question.keep',
    testId: 'safety-question',
  },
  selfTest: {
    icon: 'science',
    title: 'safety.question.selfTestTitle',
    question: 'safety.question.selfTest',
    confirm: 'safety.selfTest',
    cancel: 'safety.question.dontTest',
    testId: 'safety-question',
  },
};

/** The question of one place - the banner, a card -, and the way to ask it. */
export interface SafetyQuestion {
  /** The command asked about while its window is open: the control that opened it is disabled meanwhile. */
  readonly asked: Signal<{ readonly id: number; readonly command: SafetyCommand } | undefined>;
  /**
   * Asks in a window over the page, the safe answer focused, and sends the command for yes alone (through
   * `SafetyStore`, which reads the detectors back). `stillAsked` says whether the question still stands - a
   * detector gone from the answer, an alarm over: then the window closes with no answer, for good. Resolves once the
   * window is open (or was not opened).
   */
  ask(id: number, command: SafetyCommand, stillAsked: () => boolean): Promise<void>;
}

/**
 * The question before a mute or a self test (HAS-469: a control that changes the house asks first, in a window over
 * the page - `ConfirmDialog`). One question at a time per place; closed when its place is gone. Call in an injection
 * context.
 *
 * The dialog of Material is loaded when the first question is asked: the banner of the shell holds a question, and
 * the shell is in the first download of every page - the dialog there cost 40 kB of it.
 */
export function safetyQuestion(): SafetyQuestion {
  // the store is taken when a command is sent: the shell holds a question before any member has a profile, and the
  // store is made only for a member with one
  const injector = inject(Injector);
  const asked = signal<
    | { readonly id: number; readonly command: SafetyCommand; readonly stillAsked: () => boolean }
    | undefined
  >(undefined);
  let window: MatDialogRef<ConfirmDialog, boolean> | undefined;
  let destroyed = false;

  // a question with nothing left to ask goes, with no answer (the rule of the heating switch)
  effect(() => {
    const question = asked();
    if (question !== undefined && !question.stillAsked()) {
      window?.close(false);
      if (window === undefined) {
        // still loading the window: it is not opened at all
        asked.set(undefined);
      }
    }
  });
  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    window?.close(false);
  });

  return {
    asked,
    ask: async (id, command, stillAsked) => {
      if (asked() !== undefined) {
        return;
      }
      const mine = { id, command, stillAsked };
      asked.set(mine);
      // a question another one replaced is not cleared by this call: that one is its own
      const giveUp = () => {
        if (asked() === mine) {
          asked.set(undefined);
        }
      };
      let loaded;
      try {
        loaded = await Promise.all([
          import('@angular/material/dialog'),
          import('../confirm-dialog/confirm-dialog'),
        ]);
      } catch {
        // the window could not be loaded (a file of a version a deploy replaced): nothing is sent, and the next
        // press asks again - the controls must not stay disabled
        giveUp();
        return;
      }
      const [{ MatDialog }, { CONFIRM_DIALOG_SIZE, ConfirmDialog: dialogComponent }] = loaded;
      if (destroyed || asked() !== mine || !stillAsked()) {
        giveUp();
        return;
      }
      const opened = injector
        .get(MatDialog)
        .open<ConfirmDialog, ConfirmData, boolean>(dialogComponent, {
          ...CONFIRM_DIALOG_SIZE,
          data: QUESTIONS[command],
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        });
      window = opened;
      opened.afterClosed().subscribe((confirmed) => {
        window = undefined;
        asked.set(undefined);
        if (confirmed === true && !destroyed && stillAsked()) {
          injector.get(SafetyStore).send(id, command);
        }
      });
    },
  };
}
