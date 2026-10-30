import { ApiError } from '../../core/api/api-error';
import { CLAIM_ERROR_TEXTS, describeClaimError, readTag, worthRetrying } from './tag-read';

const PICC_DATA = 'EF963FF7828658A599F3041510671E88';
const CMAC = '94EED9EE65337086';

function refusal(status: number, code: string): ApiError {
  return new ApiError('client', status, [{ message: 'Refused', code }]);
}

describe('readTag', () => {
  it('takes the read of a tag, in either case', () => {
    expect(readTag(PICC_DATA, CMAC)).toEqual({ piccData: PICC_DATA, cmac: CMAC });
    expect(readTag(PICC_DATA.toLowerCase(), CMAC.toLowerCase())).toEqual({
      piccData: PICC_DATA.toLowerCase(),
      cmac: CMAC.toLowerCase(),
    });
  });

  it.each([
    [null, CMAC],
    [PICC_DATA, null],
    [PICC_DATA.slice(2), CMAC],
    [PICC_DATA, CMAC.slice(2)],
    [`${PICC_DATA.slice(1)}Z`, CMAC],
    [PICC_DATA, `${CMAC} `],
  ])('finds no read in picc_data=%s cmac=%s', (piccData, cmac) => {
    expect(readTag(piccData, cmac)).toBeUndefined();
  });
});

describe('describeClaimError', () => {
  // the codes of ApplianceError a claim can be refused with (appliance-service 0.7.0): a new one
  // fails here until it has a text
  it('has a text for every refusal of a claim', () => {
    expect(Object.keys(CLAIM_ERROR_TEXTS).sort()).toEqual([
      'INVALID_TAG',
      'NOTHING_TO_CLAIM',
      'NOT_FOUND_APPLIANCE',
      'REPLAYED_TAG',
      'UNKNOWN_MEMBER',
    ]);
  });

  it('words a refusal by its code', () => {
    expect(describeClaimError(refusal(409, 'REPLAYED_TAG'))).toEqual({
      key: 'tagClaim.error.replayed',
    });
    expect(describeClaimError(refusal(409, 'NOTHING_TO_CLAIM'))).toEqual({
      key: 'tagClaim.error.nothingToClaim',
    });
  });

  it('tells a claim without an answer as one that may have been recorded', () => {
    expect(describeClaimError(new ApiError('network', 0))).toEqual({
      key: 'tagClaim.error.noAnswer',
    });
  });

  it('offers another attempt only where one can change the outcome', () => {
    expect(worthRetrying(new ApiError('network', 0))).toBe(true);
    expect(worthRetrying(new ApiError('server', 503))).toBe(true);
    expect(worthRetrying(refusal(409, 'REPLAYED_TAG'))).toBe(false);
  });
});
