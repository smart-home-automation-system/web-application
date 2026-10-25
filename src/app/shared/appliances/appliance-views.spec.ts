import { ApiError } from '../../core/api/api-error';
import { describeApiError } from '../api-error/describe-api-error';
import {
  APPLIANCE_ERROR_TEXTS,
  acknowledgeFailureOf,
  awaiting,
  cycleTimeFormat,
  describeApplianceError,
  summariseAppliances,
  toApplianceViews,
} from './appliance-views';

describe('appliance views', () => {
  it('reads what the answer says and leaves the rest unknown', () => {
    expect(
      toApplianceViews([
        {
          id: 62,
          name: 'Dryer',
          state: 'finished',
          finishedAt: '2026-10-25T14:34:56',
          awaitingSince: '2026-10-25T14:45:06',
        },
        { id: 61, name: 'Washing machine', state: 'running', runningSince: '2026-10-25T13:06:31' },
        { id: 63, state: 'drying' },
      ]),
    ).toEqual([
      {
        id: 62,
        name: 'Dryer',
        state: 'finished',
        runningSince: undefined,
        finishedAt: '2026-10-25T14:34:56',
        awaitingSince: '2026-10-25T14:45:06',
      },
      {
        id: 61,
        name: 'Washing machine',
        state: 'running',
        runningSince: '2026-10-25T13:06:31',
        finishedAt: undefined,
        awaitingSince: undefined,
      },
      // a state this version does not know is no state, never idle; a missing name is its id
      {
        id: 63,
        name: '#63',
        state: undefined,
        runningSince: undefined,
        finishedAt: undefined,
        awaitingSince: undefined,
      },
    ]);
  });

  // nothing could be acknowledged for an appliance without an id
  it('leaves out an appliance without an id, and an answer that is no list', () => {
    expect(toApplianceViews([{ name: 'Dryer', state: 'finished' }, { id: 0 }])).toEqual([]);
    expect(toApplianceViews(null)).toEqual([]);
    expect(toApplianceViews(undefined)).toEqual([]);
  });

  it('finds the finished ones and sums the house up', () => {
    const views = toApplianceViews([
      { id: 61, name: 'Washing machine', state: 'finishing' },
      { id: 62, name: 'Dryer', state: 'finished' },
      { id: 63, name: 'Dishwasher', state: 'idle' },
      { id: 64, name: 'Fridge' },
    ]);

    expect(awaiting(views).map((view) => view.id)).toEqual([62]);
    // a pause of a cycle is still the cycle
    expect(summariseAppliances(views)).toEqual({
      running: ['Washing machine'],
      waiting: ['Dryer'],
      unknown: 1,
    });
  });

  // a cycle that finished last night and still waits is not "since 23:40" of today
  it('shows the time alone today, and the date with it on another day', () => {
    expect(cycleTimeFormat('2026-10-08T11:40:00', '2026-10-08')).toEqual({ timeStyle: 'short' });
    expect(cycleTimeFormat('2026-10-07T23:40:00', '2026-10-08')).toEqual({
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  });

  // wire contract of ApplianceError in appliance-service: a renamed code needs a text here
  it('has a text for every code appliance-service names', () => {
    expect(Object.keys(APPLIANCE_ERROR_TEXTS)).toEqual([
      'NOT_FOUND_APPLIANCE',
      'NOTHING_TO_ACKNOWLEDGE',
    ]);
    const nothing = new ApiError('client', 409, [
      { message: 'Nothing to acknowledge', code: 'NOTHING_TO_ACKNOWLEDGE' },
    ]);
    expect(describeApplianceError(nothing)).toEqual({
      key: 'appliances.error.nothingToAcknowledge',
    });
    const other = new ApiError('server', 502);
    expect(describeApplianceError(other)).toEqual(describeApiError(other));
  });

  // an acknowledgement that got no answer may have been carried out all the same
  it('words an unanswered acknowledgement apart from a refused one', () => {
    expect(acknowledgeFailureOf({ id: 62, error: new ApiError('network', 0) })).toEqual({
      key: 'appliances.acknowledgeNoAnswer',
    });
    expect(
      acknowledgeFailureOf({
        id: 62,
        error: new ApiError('client', 404, [
          { message: 'Appliance not found', code: 'NOT_FOUND_APPLIANCE' },
        ]),
      }),
    ).toEqual({ key: 'appliances.error.notFound' });
  });
});
