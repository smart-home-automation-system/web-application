import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';

/** What the question is opened with: the texts by their keys, and the icon of its title. */
export interface ConfirmData {
  readonly icon: string;
  readonly title: MessageKey;
  readonly question: MessageKey;
  readonly confirm: MessageKey;
  readonly cancel: MessageKey;
  /** A test id for the question, so that a page test finds the one it opened. */
  readonly testId?: string;
}

/** The size of the window: the same for every question. */
export const CONFIRM_DIALOG_SIZE = { width: 'min(440px, calc(100vw - 32px))' } as const;

/**
 * The question before a command that changes the house (HAS-402, owner 2026-11-09): a window over the page, not a
 * question inside the card - the card keeps its size. The cancel takes the focus (an Enter pressed out of habit changes
 * nothing); the window answers `true` only for the command - the cancel, Escape and a click outside are no. Open it with
 * `autoFocus: 'first-tabbable'` (the default), so that `cdkFocusInitial` is honoured.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title class="confirm__title">
        <mat-icon>{{ data.icon }}</mat-icon>
        {{ t(data.title) }}
      </h2>
      <mat-dialog-content class="confirm__content" [attr.data-testid]="data.testId ?? 'confirm-question'">
        <p>{{ t(data.question) }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="false" cdkFocusInitial data-testid="confirm-cancel">
          {{ t(data.cancel) }}
        </button>
        <button matButton="filled" type="button" [mat-dialog-close]="true" data-testid="confirm-yes">
          {{ t(data.confirm) }}
        </button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .confirm__title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* one or two lines of a question: room enough for them, never a scroll bar (owner, 2026-11-09 - the content of
       Material scrolled by a pixel of the tight line height); it still scrolls when a question does not fit at all */
    .confirm__content {
      padding-block: 8px 20px;
    }

    .confirm__content p {
      margin: 0;
      line-height: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
