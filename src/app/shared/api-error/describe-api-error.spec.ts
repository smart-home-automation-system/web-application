import { ApiError } from '../../core/api/api-error';
import { describeApiError } from './describe-api-error';

describe('describeApiError', () => {
  it('points at the connection when there was no answer', () => {
    expect(describeApiError(new ApiError('network', 0))).toContain('VPN');
  });

  it('shows what the backend said about a refused request', () => {
    const error = new ApiError('client', 400, [
      { message: 'Name is too short.' },
      { message: 'Phone is not valid.' },
    ]);

    expect(describeApiError(error)).toBe('Name is too short. Phone is not valid.');
  });

  it('falls back to the status when a refused request carries no message', () => {
    expect(describeApiError(new ApiError('client', 404))).toContain('404');
  });

  it('never shows what a failing service said about itself', () => {
    const error = new ApiError('server', 500, [{ message: 'relation "member" does not exist' }]);

    const text = describeApiError(error);

    expect(text).not.toContain('relation');
    expect(text).toContain('500');
  });

  it.each(['invalid-response', 'unexpected'] as const)('has a sentence for %s', (kind) => {
    expect(describeApiError(new ApiError(kind, 0)).length).toBeGreaterThan(10);
  });
});
