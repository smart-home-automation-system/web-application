import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HeatingApi, HeatingSwitchControl } from './heating-api';

const SWITCHED_ON = { isHeatingEnabled: true, updatedAt: '2026-10-08T15:00:00.123456' };
const SWITCHED_OFF = { isHeatingEnabled: false, updatedAt: '2026-04-22T16:31:17.840868' };

describe('HeatingApi', () => {
  let http: HttpTestingController;
  let heating: HeatingSwitchControl;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    heating = TestBed.runInInjectionContext(() => TestBed.inject(HeatingApi).watchSwitch());
    answerTheStatusWith(SWITCHED_OFF);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /**
   * The read of the status that is due now - the first one, or the one after a change. (A
   * millisecond, not none: a timer set while the clock is being moved fires a tick later.)
   */
  function statusCall() {
    vi.advanceTimersByTime(1);
    return http.expectOne({ method: 'GET', url: '/home/heating' });
  }

  function answerTheStatusWith(status: object): void {
    statusCall().flush(status);
  }

  const change = (turn: 'on' | 'off') =>
    http.expectOne({ method: 'POST', url: `/home/heating?turn=${turn}` });

  /** Lets the promise of the re-read settle. */
  const settled = () => Promise.resolve();

  describe('the switch', () => {
    it('asks the service to switch on', () => {
      heating.turn(true);
      change('on').flush(SWITCHED_ON);
      answerTheStatusWith(SWITCHED_ON);

      expect(heating.value()).toEqual(SWITCHED_ON);
    });

    it('sends "off" for off', async () => {
      heating.turn(false);
      change('off').flush(SWITCHED_OFF);
      answerTheStatusWith(SWITCHED_OFF);
      await settled();

      expect(heating.switching()).toBe(false);
    });

    // no optimistic state: neither the click nor the answer of the change moves what is shown
    it('shows the new state only once the service was asked again', async () => {
      heating.turn(true);

      expect(heating.switching()).toBe(true);
      expect(heating.value()).toEqual(SWITCHED_OFF);

      change('on').flush(SWITCHED_ON);
      const read = statusCall();
      await settled();

      expect(heating.switching()).toBe(true);
      expect(heating.value()).toEqual(SWITCHED_OFF);

      read.flush(SWITCHED_ON);
      await settled();

      expect(heating.switching()).toBe(false);
      expect(heating.value()).toEqual(SWITCHED_ON);
      expect(heating.switchFailure()).toBeUndefined();
    });

    it('reports a change the service did not carry out, and reads the state again', async () => {
      heating.turn(true);
      change('on').flush(
        { errors: [{ message: 'Failed to update heating status: connection refused' }] },
        { status: 500, statusText: 'Internal Server Error' },
      );

      expect(heating.switchFailure()?.on).toBe(true);
      expect(heating.switchFailure()?.error.kind).toBe('server');
      expect(heating.switching()).toBe(true);

      answerTheStatusWith(SWITCHED_OFF);
      await settled();

      expect(heating.switching()).toBe(false);
      expect(heating.value()).toEqual(SWITCHED_OFF);
      // the failure of the change is not that of the status, which was read just fine
      expect(heating.error()).toBeUndefined();
    });

    // a change that got no answer may have been carried out all the same: the re-read tells
    it('shows what the service says after a change that got no answer', async () => {
      heating.turn(true);
      change('on');
      vi.advanceTimersByTime(10_000);

      expect(heating.switchFailure()?.error.kind).toBe('network');

      answerTheStatusWith(SWITCHED_ON);
      await settled();

      expect(heating.value()).toEqual(SWITCHED_ON);
      expect(heating.switching()).toBe(false);
    });

    it('can be used again when the re-read fails too', async () => {
      heating.turn(true);
      change('on').flush(null, { status: 502, statusText: 'Bad Gateway' });
      statusCall().flush(null, { status: 502, statusText: 'Bad Gateway' });
      await settled();

      expect(heating.switching()).toBe(false);
      expect(heating.error()?.status).toBe(502);
      expect(heating.value()).toEqual(SWITCHED_OFF);
    });

    it('ignores a second change while one is on its way', () => {
      heating.turn(true);
      heating.turn(false);

      http.expectNone({ method: 'POST', url: '/home/heating?turn=off' });
      change('on').flush(SWITCHED_ON);
      answerTheStatusWith(SWITCHED_ON);
    });

    it('forgets a failed change with the next one', async () => {
      heating.turn(true);
      change('on').flush(null, { status: 500, statusText: 'Internal Server Error' });
      answerTheStatusWith(SWITCHED_OFF);
      await settled();

      heating.turn(true);

      expect(heating.switchFailure()).toBeUndefined();

      change('on').flush(SWITCHED_ON);
      answerTheStatusWith(SWITCHED_ON);
    });
  });

  it('reads whether any room is being heated, and the sensors', () => {
    const { activity, sensors } = TestBed.runInInjectionContext(() => {
      const api = TestBed.inject(HeatingApi);
      return { activity: api.watchActivity(), sensors: api.watchSensors() };
    });
    vi.advanceTimersByTime(0);

    http.expectOne('/home/heating/status/active').flush({ active: true });
    http
      .expectOne('/home/heating/temperature/sensors')
      .flush([{ room: 'office', lastReadingAt: '2026-10-08T14:24:14', stale: false }]);

    expect(activity.value()).toEqual({ active: true });
    expect(sensors.value()).toHaveLength(1);
  });

  describe('one room', () => {
    function watch(name: () => string) {
      const room = TestBed.runInInjectionContext(() => TestBed.inject(HeatingApi).watchRoom(name));
      vi.advanceTimersByTime(0);
      return room;
    }

    it('asks for the room by its name, as a path segment', () => {
      const room = watch(() => 'living room');

      http.expectOne('/home/heating/rooms/living%20room').flush({ name: 'living room' });

      expect(room.value()).toEqual({ name: 'living room' });
    });

    // a name is text from outside: it must not be able to change the path
    it('encodes a name that would otherwise lead elsewhere', () => {
      watch(() => '../floor-pump?x=1#y');

      http.expectOne('/home/heating/rooms/..%2Ffloor-pump%3Fx%3D1%23y').flush(null);
    });

    it.each(['.', '..', '...'])('does not ask for %s, which is no path segment', (name) => {
      const room = watch(() => name);

      http.expectNone(() => true);
      expect(room.error()?.kind).toBe('unexpected');
      expect(room.loading()).toBe(false);
    });

    it('reads the name anew for every call', () => {
      let name = 'office';
      const room = watch(() => name);
      http.expectOne('/home/heating/rooms/office').flush({ name: 'office' });

      name = 'loft';
      void room.refresh();
      vi.advanceTimersByTime(0);

      http.expectOne('/home/heating/rooms/loft').flush({ name: 'loft' });
    });

    it('hands on the code of a room the service does not know', () => {
      const room = watch(() => 'attic');

      http.expectOne('/home/heating/rooms/attic').flush(
        {
          errors: [
            {
              code: 'NOT_FOUND_ROOM',
              details: 'Room name: attic',
              message: 'Room with provided name is not a part of home',
            },
          ],
        },
        { status: 404, statusText: 'Not Found' },
      );

      expect(room.error()?.hasCode('NOT_FOUND_ROOM')).toBe(true);
    });
  });

  it('reads the rooms and the pump of the floor heating', () => {
    const { rooms, pump } = TestBed.runInInjectionContext(() => {
      const api = TestBed.inject(HeatingApi);
      return { rooms: api.watchRooms(), pump: api.watchFloorPump() };
    });
    vi.advanceTimersByTime(0);

    http.expectOne('/home/heating/rooms').flush([{ name: 'office', heaters: [] }]);
    // what the service answers until the relay of the pump has answered
    http.expectOne('/home/heating/floor-pump').flush({});

    expect(rooms.value()).toEqual([{ name: 'office', heaters: [] }]);
    expect(pump.value()).toEqual({});
  });
});
