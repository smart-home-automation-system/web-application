import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { describeApiError } from '../api-error/describe-api-error';
import { LIGHT_ERROR_TEXTS, describeLightError } from './light-errors';

/**
 * The codes of the lights in `light-service` (`LightError`). The names are wire contract there,
 * pinned by `LightErrorTest`; this is the other end of it. `INVALID_RULE` and `NOT_FOUND_RULE`
 * belong to the rules, which no page writes yet.
 */
const CODES_OF_THE_SERVICE = [
  'NOT_FOUND_LIGHT',
  'UNSUPPORTED_CAPABILITY',
  'DEVICE_FAILED',
  'REGISTRY_UNAVAILABLE',
];

const refusal = (status: number, code?: string) =>
  new ApiError(status >= 500 ? 'server' : 'client', status, [
    code ? { message: 'What the service said', code } : { message: 'What the service said' },
  ]);

describe('the refusals of the light service', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
  });

  it('has a sentence for every code of the service, and for no other', () => {
    expect(Object.keys(LIGHT_ERROR_TEXTS).sort()).toEqual([...CODES_OF_THE_SERVICE].sort());
  });

  it.each(CODES_OF_THE_SERVICE)('words %s in both languages, differently', async (code) => {
    const text = describeLightError(refusal(400, code));
    const translate = TestBed.inject(TranslocoService);

    expect(text.key).toBeDefined();
    const english = translate.translate(text.key!);
    await useLanguage('pl');
    const polish = translate.translate(text.key!);

    expect(english).not.toBe(text.key);
    expect(polish).not.toBe(english);
  });

  // a 502 of the service carries its code alone: that is what it has to say
  it('words a light that did not take the command, though it is a 502', () => {
    expect(describeLightError(refusal(502, 'DEVICE_FAILED'))).toEqual({
      key: 'lights.error.deviceFailed',
    });
  });

  it('tells a failure without a code as every other failed call is told', () => {
    const error = refusal(400);

    expect(describeLightError(error)).toEqual(describeApiError(error));
  });
});
