import { ApiError } from '../../core/api/api-error';
import { ENERGY_ERROR_TEXTS, describeEnergyError } from './energy-errors';

describe('the refusals of energy-service', () => {
  // the codes of EnergyError the dashboard words; a new one of the service is added here with its text
  it('has a text for every code of the service', () => {
    expect(Object.keys(ENERGY_ERROR_TEXTS).sort()).toEqual([
      'CHARGE_IN_PROGRESS',
      'DEVICE_FAILED',
      'INVALID_AUTOMATION',
      'INVALID_CHARGE',
      'INVALID_RANGE',
      'INVERTER_UNAVAILABLE',
      'NOT_FOUND_CHARGE',
      'NOT_FOUND_INVERTER',
      'NOT_FOUND_PLANNED_OUTAGE',
      'REGISTRY_UNAVAILABLE',
      'TARGET_REACHED',
      'UNKNOWN_METRIC',
      'WRITE_TOO_SOON',
    ]);
  });

  it('words a refusal by its code, never by the English words of the service', () => {
    const refused = new ApiError('client', 400, [
      { code: 'UNKNOWN_METRIC', message: 'Unknown metric' },
    ]);
    expect(describeEnergyError(refused)).toEqual({ key: 'energy.error.unknownMetric' });

    const down = new ApiError('server', 503, [{ code: 'REGISTRY_UNAVAILABLE', message: 'x' }]);
    expect(describeEnergyError(down)).toEqual({ key: 'energy.error.registryUnavailable' });
  });

  it('tells a failure without a code like any other', () => {
    const failed = new ApiError('server', 500, [{ message: 'boom' }]);
    expect(describeEnergyError(failed)).not.toEqual({ key: 'energy.error.unknownMetric' });
  });
});
