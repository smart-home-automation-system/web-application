import { ApiError } from '../../core/api/api-error';
import { REQUEST_ERROR_TEXTS, describeRequestError, toRequestLists } from './my-requests-views';

describe('the requests of a member', () => {
  it('splits the open requests from those done, the last done first', () => {
    const lists = toRequestLists(
      [
        { id: 1, text: 'Bread', author: 'Ola', createdAt: '2026-11-05T20:00:00' },
        { id: 2, text: 'Milk', author: 'Borys', sentAt: '2026-11-06T08:00:00' },
        { id: 3, text: 'Parcel', author: 'Ola', doneAt: '2026-11-04T10:00:00', doneBy: 'ola' },
        { id: 4, text: 'Stamps', author: 'Ola', doneAt: '2026-11-05T10:00:00', doneBy: 'Borys' },
      ],
      'Ola',
    );

    expect(lists.open).toEqual([
      { id: 1, text: 'Bread', createdAt: '2026-11-05T20:00:00' },
      { id: 2, text: 'Milk', from: 'Borys', sentAt: '2026-11-06T08:00:00' },
    ]);
    // the member of the profile is named nowhere, whatever the case of the registry
    expect(lists.done).toEqual([
      { id: 4, text: 'Stamps', doneAt: '2026-11-05T10:00:00', doneBy: 'Borys' },
      { id: 3, text: 'Parcel', doneAt: '2026-11-04T10:00:00' },
    ]);
  });

  it('gives no line to a request without an id or a text, and none to an answer without a body', () => {
    expect(
      toRequestLists(
        [
          { id: 0, text: 'Bread' },
          { id: 2, text: '' },
        ] as never,
        'Ola',
      ),
    ).toEqual({ open: [], done: [] });
    expect(toRequestLists(null, 'Ola')).toEqual({ open: [], done: [] });
  });

  // the codes of database-service 0.22.0 the card meets; a new one fails this list
  it('words every refusal of the requests', () => {
    expect(Object.keys(REQUEST_ERROR_TEXTS)).toEqual([
      'NOT_FOUND_REQUEST',
      'INVALID_REQUEST',
      'MEMBER_SWITCHED_OFF',
      'NOT_FOUND_HOUSEHOLD_MEMBER',
    ]);
    const refused = new ApiError('client', 409, [{ message: 'x', code: 'MEMBER_SWITCHED_OFF' }]);
    expect(describeRequestError(refused)).toEqual({ key: 'requests.error.memberSwitchedOff' });
  });

  it('tells a 404 without a code - a database-service before 0.22.0 - as any failed call', () => {
    const older = new ApiError('client', 404, [
      { message: "No static resource for request '/x'." },
    ]);
    expect(describeRequestError(older)).not.toEqual({ key: 'requests.error.notFound' });
  });
});
