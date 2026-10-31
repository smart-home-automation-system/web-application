import { ApiError } from '../../core/api/api-error';
import { HEATING_ERROR_TEXTS, describeHeatingError } from './heating-errors';

describe('the refusals of heating-service', () => {
  // the codes of HeatingErrorId the dashboard words; a new one of the service is added here with its text
  it('has a text for every code a write of a schedule can be refused with', () => {
    expect(Object.keys(HEATING_ERROR_TEXTS).sort()).toEqual([
      'INVALID_SCHEDULE',
      'NOT_FOUND_HEATER',
      'NOT_FOUND_ROOM',
      'NOT_FOUND_SCHEDULE',
    ]);
  });

  it('words a refusal by its code, never by the English details of the service', () => {
    const refused = new ApiError('client', 400, [
      {
        code: 'INVALID_SCHEDULE',
        message: 'Invalid schedule',
      },
    ]);

    expect(describeHeatingError(refused)).toEqual({ key: 'heating.error.invalidSchedule' });
  });

  it('tells a failure without a code like any other', () => {
    const failed = new ApiError('server', 500, [{ message: 'boom' }]);

    expect(describeHeatingError(failed)).not.toEqual({ key: 'heating.error.invalidSchedule' });
  });
});
