import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Appliance, ApplianceApi, AppliancesControl } from './appliance-api';

const FINISHED: Appliance = { id: 62, name: 'Dryer', state: 'finished' };
const IDLE: Appliance = { id: 62, name: 'Dryer', state: 'idle' };

describe('ApplianceApi', () => {
  let http: HttpTestingController;
  let appliances: AppliancesControl;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    appliances = TestBed.runInInjectionContext(() =>
      TestBed.inject(ApplianceApi).watchAppliances(),
    );
    answerTheListWith([FINISHED]);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** The read of the list that is due now - the first one, or the one after an acknowledgement. */
  function listCall() {
    vi.advanceTimersByTime(1);
    return http.expectOne({ method: 'GET', url: '/home/appliance' });
  }

  function answerTheListWith(list: readonly Appliance[]): void {
    listCall().flush(list);
  }

  const acknowledgement = (id: number) =>
    http.expectOne({ method: 'POST', url: `/home/appliance/${id}/acknowledge` });

  /** Lets the promise of the re-read settle. */
  const settled = () => Promise.resolve();

  it('reads every appliance', () => {
    expect(appliances.value()).toEqual([FINISHED]);
  });

  // no optimistic state: the list read after the write is what moves the screen
  it('acknowledges a finished appliance and reads the list again', async () => {
    appliances.acknowledge(62);
    expect(appliances.acknowledging()).toBe(62);
    acknowledgement(62).flush(null, { status: 204, statusText: 'No Content' });
    expect(appliances.value()).toEqual([FINISHED]);

    answerTheListWith([IDLE]);
    await settled();

    expect(appliances.value()).toEqual([IDLE]);
    expect(appliances.acknowledging()).toBeUndefined();
    expect(appliances.acknowledgeFailure()).toBeUndefined();
  });

  // HAS-347: the member of the profile in use goes with it, for the household messages to name
  it('sends the member who acknowledges it', async () => {
    appliances.acknowledge(62, 'Ola');
    http
      .expectOne({ method: 'POST', url: '/home/appliance/62/acknowledge?member=Ola' })
      .flush(null, { status: 204, statusText: 'No Content' });

    answerTheListWith([IDLE]);
    await settled();

    expect(appliances.value()).toEqual([IDLE]);
  });

  it('ignores a second acknowledgement while one is on its way', () => {
    appliances.acknowledge(62);
    appliances.acknowledge(61);

    acknowledgement(62).flush(null, { status: 204, statusText: 'No Content' });
    answerTheListWith([IDLE]);
    http.expectNone({ method: 'POST', url: '/home/appliance/61/acknowledge' });
  });

  // a refusal is told, and the list is read all the same - it says what the service has
  it('keeps a refused acknowledgement with its code and reads the list again', async () => {
    appliances.acknowledge(62);
    acknowledgement(62).flush(
      { errors: [{ message: 'Nothing to acknowledge', code: 'NOTHING_TO_ACKNOWLEDGE' }] },
      { status: 409, statusText: 'Conflict' },
    );
    answerTheListWith([IDLE]);
    await settled();

    const failure = appliances.acknowledgeFailure();
    expect(failure?.id).toBe(62);
    expect(failure?.error.hasCode('NOTHING_TO_ACKNOWLEDGE')).toBe(true);
    expect(appliances.acknowledging()).toBeUndefined();
  });

  it('asks for the cycles and the samples of a range of the house', () => {
    const api = TestBed.inject(ApplianceApi);
    const range = { from: '2026-10-25T00:00:00', to: '2026-10-26T00:00:00' };
    const runs = TestBed.runInInjectionContext(() => api.watchRuns(133, () => range));
    const samples = TestBed.runInInjectionContext(() => api.watchSamples(133, () => range));
    vi.advanceTimersByTime(1);

    http
      .expectOne({
        method: 'GET',
        url: '/home/appliance/133/runs?from=2026-10-25T00:00:00&to=2026-10-26T00:00:00',
      })
      .flush([{ id: 1, startedAt: '2026-10-25T13:06:31' }]);
    http
      .expectOne({
        method: 'GET',
        url: '/home/appliance/133/samples?from=2026-10-25T00:00:00&to=2026-10-26T00:00:00',
      })
      .flush([{ at: '2026-10-25T13:06:31', watts: 25.91 }]);

    expect(runs.value()).toEqual([{ id: 1, startedAt: '2026-10-25T13:06:31' }]);
    expect(samples.value()).toEqual([{ at: '2026-10-25T13:06:31', watts: 25.91 }]);
  });
});
