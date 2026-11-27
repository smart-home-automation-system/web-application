import { ApiError } from '../../core/api/api-error';
import { AMPLIFIER_ERROR_TEXTS, describeUnlockError } from './amplifier-labels';

describe('amplifier labels', () => {
  // the names of AmplifierError of media-service (HAS-515), wire contract there: a new code needs a text here
  it('words every named refusal of media-service', () => {
    expect(Object.keys(AMPLIFIER_ERROR_TEXTS)).toEqual([
      'AMPLIFIER_REFUSED',
      'AMPLIFIER_UNAVAILABLE',
      'AMPLIFIER_TIMEOUT',
      'UNLOCK_IN_PROGRESS',
      'UNKNOWN_MEMBER',
      'REGISTRY_UNAVAILABLE',
    ]);
    expect(
      describeUnlockError(
        new ApiError('server', 503, [
          { message: 'The amplifier cannot be reached', code: 'AMPLIFIER_UNAVAILABLE' },
        ]),
      ),
    ).toEqual({ key: 'amplifier.error.unavailable' });
    expect(
      describeUnlockError(
        new ApiError('client', 400, [
          { message: 'Unknown household member', code: 'UNKNOWN_MEMBER' },
        ]),
      ),
    ).toEqual({ key: 'amplifier.error.unknownMember' });
  });

  // an unlock that got no answer may have been carried out all the same
  it('tells an unlock without an answer as one that may have been carried out', () => {
    expect(describeUnlockError(new ApiError('network', 0))).toEqual({ key: 'amplifier.noAnswer' });
  });

  it('tells a failure without a code as every failure is told', () => {
    expect(describeUnlockError(new ApiError('server', 502))).toEqual({
      key: 'apiError.server',
      params: { status: 502 },
    });
    expect(
      describeUnlockError(new ApiError('client', 400, [{ message: 'source must be dashboard' }])),
    ).toEqual({ literal: 'source must be dashboard' });
  });
});
