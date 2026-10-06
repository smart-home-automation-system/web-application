import { HttpErrorResponse } from '@angular/common/http';

import { ApiError, toApiError } from './api-error';

describe('toApiError', () => {
  it('decodes the shared error contract, keeping the code and dropping the details', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 404,
        error: {
          errors: [
            { message: 'No such member', code: 'NOT_FOUND_MEMBER', details: 'SELECT * FROM ...' },
          ],
        },
      }),
    );

    expect(error.kind).toBe('client');
    expect(error.status).toBe(404);
    expect(error.messages).toEqual([{ message: 'No such member', code: 'NOT_FOUND_MEMBER' }]);
    expect(error.message).toBe('No such member');
    expect(error.hasCode('NOT_FOUND_MEMBER')).toBe(true);
    expect(error.hasCode('SOMETHING_ELSE')).toBe(false);
  });

  it('reads a message without a code', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 400, error: { errors: [{ message: 'Bad phone number' }] } }),
    );

    expect(error.messages).toEqual([{ message: 'Bad phone number' }]);
  });

  it('classifies a 5xx as a server error', () => {
    const error = toApiError(new HttpErrorResponse({ status: 502, error: { errors: [] } }));

    expect(error.kind).toBe('server');
    expect(error.status).toBe(502);
  });

  it('classifies status 0 as a network error', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }),
    );

    expect(error.kind).toBe('network');
    expect(error.messages).toEqual([]);
  });

  it('classifies an unparsable 200 as an invalid response', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 200, error: { error: new SyntaxError(), text: '<html>' } }),
    );

    expect(error.kind).toBe('invalid-response');
  });

  // the status has to survive whatever the body is - a proxy answers with HTML, not the contract
  it.each([
    ['no body', null],
    ['an empty string', ''],
    ['an HTML page', '<html><body><h1>502 Bad Gateway</h1></body></html>'],
    ['JSON of another shape', { timestamp: '2026-10-06', path: '/home/x' }],
    ['errors that is not an array', { errors: 'broken' }],
    ['null entries', { errors: [null] }],
    ['entries without a message', { errors: [{ code: 'X' }, { message: '' }, { message: 42 }] }],
    ['a JSON string of another shape', '{"message":"nope"}'],
  ])('keeps the status when the body is %s', (_name, body) => {
    const error = toApiError(new HttpErrorResponse({ status: 503, error: body }));

    expect(error.kind).toBe('server');
    expect(error.status).toBe(503);
    expect(error.messages).toEqual([]);
    expect(error.message).toContain('503');
  });

  it('decodes the contract from a body that arrived as text', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 409, error: '{"errors":[{"message":"Already exists"}]}' }),
    );

    expect(error.messages).toEqual([{ message: 'Already exists' }]);
  });

  it('skips broken entries and keeps the valid ones', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 400, error: { errors: [null, { message: 'Valid' }] } }),
    );

    expect(error.messages).toEqual([{ message: 'Valid' }]);
  });

  it('wraps a failure outside HTTP', () => {
    const cause = new TypeError('boom');

    const error = toApiError(cause);

    expect(error.kind).toBe('unexpected');
    expect(error.cause).toBe(cause);
  });

  it('returns an ApiError unchanged', () => {
    const original = new ApiError('server', 500);

    expect(toApiError(original)).toBe(original);
  });
});
