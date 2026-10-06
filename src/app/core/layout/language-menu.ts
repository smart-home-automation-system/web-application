import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../i18n/language-store';
import { LanguageCode } from '../i18n/languages';

/**
 * The language switch of the toolbar: a button showing the active language and a menu of the
 * available ones, each named in its own words so it can be found by somebody who cannot read
 * the current one.
 *
 * The button is named by its content - the code on screen plus a hidden "change language" - and
 * not by an `aria-label`, which would replace the visible code: a screen reader then announces
 * which language is active, and voice control finds the button by what is written on it.
 */
@Component({
  selector: 'app-language-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <button matButton type="button" class="language-menu__trigger" [matMenuTriggerFor]="menu">
        <mat-icon>language</mat-icon>
        <span>{{ store.language().toUpperCase() }}</span>
        <!-- &ngsp; keeps a space in front: the name must read "EN Change language", not "ENChange" -->
        <span class="visually-hidden">&ngsp;{{ t('language.change') }}</span>
      </button>
      <mat-menu #menu="matMenu">
        @for (option of store.options; track option.code) {
          <button
            mat-menu-item
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="option.code === store.language()"
            [attr.lang]="option.code"
            (click)="select(option.code)"
          >
            <mat-icon>{{
              option.code === store.language() ? 'radio_button_checked' : 'radio_button_unchecked'
            }}</mat-icon>
            <span>{{ option.name }}</span>
          </button>
        }
      </mat-menu>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageMenu {
  protected readonly store = inject(LanguageStore);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  protected async select(language: LanguageCode): Promise<void> {
    if (language === this.store.language()) {
      return;
    }
    if (!(await this.store.select(language))) {
      // said in the language still on screen - the other one is exactly what failed to load
      this.snackBar.open(this.transloco.translate('language.loadFailed'), undefined, {
        duration: 8_000,
      });
    }
  }
}
