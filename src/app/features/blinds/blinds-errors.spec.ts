import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { describeApiError } from '../../shared/api-error/describe-api-error';
import { BLINDS_ERROR_TEXTS, describeBlindsError, skippedReason } from './blinds-errors';

/**
 * The codes of `blinds-service` (`BlindsError`). The names are wire contract there, pinned by
 * `BlindsErrorTest`; this is the other end of it.
 */
const CODES_OF_THE_SERVICE = [
  'NOT_FOUND_BLINDS',
  'UNSUPPORTED_POSITION',
  'PROTECTION_ACTIVE',
  'DEVICE_FAILED',
  'REGISTRY_UNAVAILABLE',
  'INVALID_SCHEDULE',
  'NOT_FOUND_SCHEDULE',
];

const refusal = (status: number, code?: string) =>
  new ApiError(status >= 500 ? 'server' : 'client', status, [
    code ? { message: 'What the service said', code } : { message: 'What the service said' },
  ]);

describe('the refusals of the blinds service', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
  });

  it('has a sentence for every code of the service, and for no other', () => {
    expect(Object.keys(BLINDS_ERROR_TEXTS).sort()).toEqual([...CODES_OF_THE_SERVICE].sort());
  });

  it.each(CODES_OF_THE_SERVICE)('words %s in both languages, differently', async (code) => {
    const text = describeBlindsError(refusal(409, code));
    const translate = TestBed.inject(TranslocoService);

    expect(text.key).toBeDefined();
    const english = translate.translate(text.key!);
    await useLanguage('pl');
    const polish = translate.translate(text.key!);

    expect(english).not.toBe(text.key);
    expect(polish).not.toBe(english);
  });

  // a 502 of the service carries its code alone: that is what it has to say
  it('words a device that did not take the command, though it is a 502', () => {
    expect(describeBlindsError(refusal(502, 'DEVICE_FAILED'))).toEqual({
      key: 'blinds.error.deviceFailed',
    });
  });

  it('tells a failure without a code as every other failed call is told', () => {
    const error = refusal(400);

    expect(describeBlindsError(error)).toEqual(describeApiError(error));
  });

  it('words the reason a room command skipped a blind, an unknown code as it came', () => {
    expect(skippedReason('DEVICE_FAILED')).toEqual({ key: 'blinds.error.deviceFailed' });
    expect(skippedReason('NEW_CODE')).toEqual({ literal: 'NEW_CODE' });
    expect(skippedReason(undefined)).toBeUndefined();
  });
});
