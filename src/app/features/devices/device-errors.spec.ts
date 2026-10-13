import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { describeApiError } from '../../shared/api-error/describe-api-error';
import { DEVICE_ERROR_TEXTS, changeSummary, describeDeviceError } from './device-errors';

/**
 * The codes of the device registry of `database-service` (`CustomErrorDescription`). The names
 * are wire contract there, pinned by a test of the service; this is the other end of it.
 */
const CODES_OF_THE_REGISTRY = ['NOT_FOUND_DEVICE', 'INVALID_DEVICE', 'DEVICE_CONFLICT'];

const refusal = (status: number, code?: string) =>
  new ApiError('client', status, [
    code ? { message: 'What the registry said', code } : { message: 'What the registry said' },
  ]);

describe('the refusals of the device registry', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
  });

  it('has a sentence for every code of the registry, and for no other', () => {
    expect(Object.keys(DEVICE_ERROR_TEXTS).sort()).toEqual([...CODES_OF_THE_REGISTRY].sort());
  });

  it.each(CODES_OF_THE_REGISTRY)('words %s in both languages, differently', async (code) => {
    const text = describeDeviceError(refusal(409, code));
    const translate = TestBed.inject(TranslocoService);

    expect(text.key).toBeDefined();
    const english = translate.translate(text.key!);
    await useLanguage('pl');
    const polish = translate.translate(text.key!);

    expect(english).not.toBe(text.key);
    expect(polish).not.toBe(english);
    // the registry's own words are not what is shown
    expect(english).not.toContain('What the registry said');
  });

  // a body the model refuses has no code: told like every other failed call
  it('tells a refusal without a code as every other failed call is told', () => {
    const error = refusal(400);

    expect(describeDeviceError(error)).toEqual(describeApiError(error));
  });

  // a code of another part of the service is not ours to word
  it('does not word a code it does not know', () => {
    const error = refusal(409, 'HOUSEHOLD_CONFLICT');

    expect(describeDeviceError(error)).toEqual(describeApiError(error));
  });

  // a change that got no answer may have been carried out: not "was not carried out"
  it('says "no answer" and not "not carried out" for a call that got none', () => {
    expect(changeSummary(new ApiError('network', 0))).toBe('devices.change.noAnswer');
    expect(changeSummary(refusal(409, 'DEVICE_CONFLICT'))).toBe('devices.change.failed');
  });
});
