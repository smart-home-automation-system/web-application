import { RoomHistory } from '../app/data-access/heating/heating-api';
import { WaterHistory } from '../app/data-access/water/water-api';
import { isHistoryRefusal, roomHistory, waterHistory } from './history.fixtures';

// 18:30 in the house on 2026-10-10 (summer time, UTC+2)
const NOW = new Date('2026-10-10T16:30:00Z');

function water(from: string | null, to: string | null, fresh = false): WaterHistory {
  const answer = waterHistory(from, to, fresh, NOW);
  if (isHistoryRefusal(answer)) {
    throw new Error(`refused: ${answer.message}`);
  }
  return answer;
}

function room(from: string, to: string): RoomHistory {
  const answer = roomHistory('living room', from, to, false, NOW);
  if (isHistoryRefusal(answer)) {
    throw new Error(`refused: ${answer.message}`);
  }
  return answer;
}

describe('the histories of the mock house', () => {
  // the widths of water-service: 5 min up to 2 days, 30 min up to 8, 2 h up to 31
  it.each([
    ['2026-10-09T19:00:00', '2026-10-10T19:00:00', 300],
    ['2026-10-04T00:00:00', '2026-10-11T00:00:00', 1800],
    ['2026-09-11T00:00:00', '2026-10-11T00:00:00', 7200],
  ])('cuts the hot water from %s to %s into buckets of %i s', (from, to, bucketSeconds) => {
    expect(water(from, to).bucketSeconds).toBe(bucketSeconds);
  });

  // the widths of heating-service: 20 min, 1 h, 3 h
  it.each([
    ['2026-10-09T19:00:00', '2026-10-10T19:00:00', 1200],
    ['2026-10-04T00:00:00', '2026-10-11T00:00:00', 3600],
    ['2026-09-11T00:00:00', '2026-10-11T00:00:00', 10800],
  ])('cuts a room from %s to %s into buckets of %i s', (from, to, bucketSeconds) => {
    expect(room(from, to).bucketSeconds).toBe(bucketSeconds);
  });

  it('answers the range as it was asked for', () => {
    const answer = water('2026-10-09T19:00:00', '2026-10-10T19:00:00');

    expect(answer.from).toBe('2026-10-09T19:00:00');
    expect(answer.to).toBe('2026-10-10T19:00:00');
  });

  it('has both temperatures in every point, and no point after the moment of the call', () => {
    const points = water('2026-10-09T19:00:00', '2026-10-10T19:00:00').points ?? [];

    expect(points[0]).toEqual({
      at: '2026-10-09T19:00:00',
      water: expect.any(Number),
      circulation: expect.any(Number),
    });
    expect(points.at(-1)?.at).toBe('2026-10-10T18:30:00');
  });

  // what the page has to draw as a break: an hour of yesterday without a reading
  it('leaves the buckets of the hour the sensor was silent out', () => {
    const times = (water('2026-10-09T00:00:00', '2026-10-10T00:00:00').points ?? []).map(
      (point) => point.at,
    );

    expect(times).toContain('2026-10-09T02:55:00');
    expect(times).not.toContain('2026-10-09T03:00:00');
    expect(times).not.toContain('2026-10-09T03:55:00');
    expect(times).toContain('2026-10-09T04:00:00');
  });

  // aligned to the clock of the house, as the services bucket: a range that starts inside a
  // bucket gets a first point before it
  it('aligns the buckets to the clock, not to the start of the range', () => {
    const points = room('2026-10-09T19:10:00', '2026-10-10T19:10:00').points ?? [];

    expect(points[0].at).toBe('2026-10-09T19:00:00');
  });

  it('has no point for a service that has stored nothing yet', () => {
    expect(water('2026-10-09T19:00:00', '2026-10-10T19:00:00', true).points).toEqual([]);
  });

  it.each([
    [null, '2026-10-10T19:00:00'],
    ['2026-10-09T19:00:00', null],
    ['2026-10-09T19:00:00Z', '2026-10-10T19:00:00'],
    ['2026-10-10T19:00:00', '2026-10-09T19:00:00'],
    ['2026-09-01T00:00:00', '2026-10-11T00:00:00'],
  ])('refuses the range from %s to %s with a 400, as the services do', (from, to) => {
    const answer = waterHistory(from, to, false, NOW);

    expect(isHistoryRefusal(answer) && answer.status).toBe(400);
  });
});
