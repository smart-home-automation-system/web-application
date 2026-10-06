import { formatAge } from './format-age';

describe('formatAge', () => {
  it.each([
    [0, 'just now'],
    [9_999, 'just now'],
    [10_000, '10 sec. ago'],
    [59_999, '59 sec. ago'],
    [60_000, '1 min. ago'],
    [59 * 60_000, '59 min. ago'],
    [60 * 60_000, '1 hr. ago'],
    [47 * 3_600_000, '47 hr. ago'],
    [48 * 3_600_000, '2 days ago'],
  ])('formats %i ms as "%s"', (ageMs, expected) => {
    expect(formatAge(ageMs, 'en-US')).toBe(expected);
  });
});
