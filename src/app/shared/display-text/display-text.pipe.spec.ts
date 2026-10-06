import { TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { DisplayTextPipe } from './display-text.pipe';

describe('displayText', () => {
  let pipe: DisplayTextPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    pipe = TestBed.runInInjectionContext(() => new DisplayTextPipe());
  });

  it('translates a text of ours into the active language', async () => {
    const text = { key: 'apiError.server', params: { status: 502 } } as const;

    expect(pipe.transform(text)).toBe('The service is not available right now (error 502).');

    await useLanguage('pl');

    expect(pipe.transform(text)).toBe('Usługa jest teraz niedostępna (błąd 502).');
  });

  // what the translation library does with a parameter: it searches the result for more
  // placeholders. Words from outside must never get there.
  it.each([
    'Unknown room {{ message }}',
    'Value {{ foo }} is not allowed',
    '{{ apiError.network }}',
    '{{ constructor.constructor }}',
    '<img src=x onerror=alert(1)>',
  ])('shows words from outside untouched: %s', async (literal) => {
    expect(pipe.transform({ literal })).toBe(literal);

    await useLanguage('pl');

    expect(pipe.transform({ literal })).toBe(literal);
  });

  it.each([null, undefined])('shows nothing for %s', (text) => {
    expect(pipe.transform(text)).toBe('');
  });
});
