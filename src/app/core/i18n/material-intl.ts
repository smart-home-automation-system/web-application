import { Injectable, Provider, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { followLanguage } from './follow-language';
import { LanguageStore } from './language-store';

/** The texts of Angular Material's paginator, following the language. */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    followLanguage(
      inject(LanguageStore).language,
      () => {
        this.itemsPerPageLabel = this.text('material.paginator.itemsPerPage');
        this.nextPageLabel = this.text('material.paginator.nextPage');
        this.previousPageLabel = this.text('material.paginator.previousPage');
        this.firstPageLabel = this.text('material.paginator.firstPage');
        this.lastPageLabel = this.text('material.paginator.lastPage');
      },
      () => this.changes.next(),
    );
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return this.text('material.paginator.emptyRange', { total: length });
    }
    const start = page * pageSize;
    // a page index beyond the data still shows a sensible range
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize;
    return this.text('material.paginator.range', { start: start + 1, end, total: length });
  };

  private text(key: MessageKey, params?: Record<string, number>): string {
    return this.transloco.translate(key, params);
  }
}

/**
 * What a component with a paginator needs: `providers: [providePaginator()]` in its own
 * decorator - not in the configuration of the application. Naming the paginator there makes the
 * first page download everything the paginator is built from (the form field, the select, the
 * forms) the moment any view uses one of those, a paginator or not.
 */
export function providePaginator(): Provider[] {
  return [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }];
}
