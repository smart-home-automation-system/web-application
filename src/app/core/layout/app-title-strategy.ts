import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../i18n/language-store';

/** The name of the product - the same in every language. */
export const APP_NAME = 'Smart Home';

/**
 * Browser tab title: "<page> · Smart Home". The `title` of a route is the key of its text, not
 * the text; the title is rebuilt when the page or the language changes.
 */
@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly pageKey = signal<string | undefined>(undefined);

  constructor() {
    super();
    const language = inject(LanguageStore).language;
    effect(() => {
      language();
      const key = this.pageKey();
      this.title.setTitle(key ? `${this.transloco.translate(key)} · ${APP_NAME}` : APP_NAME);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.pageKey.set(this.buildTitle(snapshot));
  }
}
