import { ApiError } from '../../core/api/api-error';
import { describeApiError } from './describe-api-error';

describe('describeApiError', () => {
  it('points at the connection when there was no answer', () => {
    expect(describeApiError(new ApiError('network', 0))).toEqual({ key: 'apiError.network' });
  });

  it('shows what the backend said about a refused request, as it came', () => {
    const error = new ApiError('client', 400, [
      { message: 'Name is too short.' },
      { message: 'Phone is not valid.' },
    ]);

    expect(describeApiError(error)).toEqual({
      literal: 'Name is too short. Phone is not valid.',
    });
  });

  // words from outside are never a translation, nor a parameter of one: they would be searched
  // for placeholders
  it('never passes the words of the backend through the translations', () => {
    const error = new ApiError('client', 400, [{ message: 'Unknown room {{ message }}' }]);

    const text = describeApiError(error);

    expect(text.key).toBeUndefined();
    expect(text.params).toBeUndefined();
    expect(text.literal).toBe('Unknown room {{ message }}');
  });

  it('falls back to the status when a refused request carries no message', () => {
    expect(describeApiError(new ApiError('client', 404))).toEqual({
      key: 'apiError.refused',
      params: { status: 404 },
    });
  });

  it('never shows what a failing service said about itself', () => {
    const error = new ApiError('server', 500, [{ message: 'relation "member" does not exist' }]);

    const text = describeApiError(error);

    expect(text).toEqual({ key: 'apiError.server', params: { status: 500 } });
    expect(JSON.stringify(text)).not.toContain('relation');
  });

  it.each([
    ['invalid-response', 'apiError.invalidResponse'],
    ['unexpected', 'apiError.unexpected'],
  ] as const)('has a sentence for %s', (kind, key) => {
    expect(describeApiError(new ApiError(kind, 0))).toEqual({ key });
  });
});
