import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HOUSEHOLD_ERROR_TEXTS, changeSummary, describeHouseholdError } from './household-errors';

/**
 * The codes of the household part of `database-service` (`CustomErrorDescription`). The names
 * are wire contract there, pinned by a test of the service; this is the other end of it.
 */
const CODES_OF_THE_REGISTRY = [
  'NOT_FOUND_HOUSEHOLD_MEMBER',
  'HOUSEHOLD_CONFLICT',
  'INVALID_HOUSEHOLD_MEMBER',
  'DEVICE_EXIST',
  'NOT_FOUND_MEMBER_DEVICE',
];

const refusal = (status: number, code?: string) =>
  new ApiError('client', status, [
    code ? { message: 'What the registry said', code } : { message: 'What the registry said' },
  ]);

describe('the refusals of the household registry', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
  });

  it('has a sentence for every code of the registry, and for no other', () => {
    expect(Object.keys(HOUSEHOLD_ERROR_TEXTS).sort()).toEqual([...CODES_OF_THE_REGISTRY].sort());
  });

  it.each(CODES_OF_THE_REGISTRY)('words %s in both languages, differently', async (code) => {
    const text = describeHouseholdError(refusal(409, code));
    const translate = TestBed.inject(TranslocoService);

    expect(text.key).toBeDefined();
    const english = translate.translate(text.key!);
    await useLanguage('pl');
    const polish = translate.translate(text.key!);

    expect(english).not.toBe(text.key);
    expect(polish).not.toBe(english);
  });

  // a 400 of Bean Validation has no code: what the service said is shown as it came
  it('shows a refusal without a code as the registry worded it', () => {
    expect(describeHouseholdError(refusal(400))).toEqual({ literal: 'What the registry said' });
  });

  it('tells any other failure like every failed call', () => {
    expect(describeHouseholdError(new ApiError('server', 502))).toEqual({
      key: 'apiError.server',
      params: { status: 502 },
    });
  });

  // a change that got no answer may have been carried out: that is not "was not carried out"
  it('does not call a change without an answer a change that was not carried out', () => {
    expect(changeSummary(new ApiError('network', 0))).toBe('household.change.noAnswer');
    expect(changeSummary(refusal(409, 'HOUSEHOLD_CONFLICT'))).toBe('household.change.failed');
    expect(changeSummary(new ApiError('server', 500))).toBe('household.change.failed');
  });
});
