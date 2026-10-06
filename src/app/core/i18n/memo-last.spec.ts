import { memoLast } from './memo-last';

describe('memoLast', () => {
  it('computes once for the same arguments', () => {
    const compute = vi.fn((value: number, locale: string) => `${value} in ${locale}`);
    const format = memoLast(compute);

    expect(format(21.5, 'en-GB')).toBe('21.5 in en-GB');
    expect(format(21.5, 'en-GB')).toBe('21.5 in en-GB');

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('computes again when any argument changes', () => {
    const compute = vi.fn((value: number, locale: string) => `${value} in ${locale}`);
    const format = memoLast(compute);

    format(21.5, 'en-GB');

    expect(format(21.5, 'pl-PL')).toBe('21.5 in pl-PL');
    expect(format(22, 'pl-PL')).toBe('22 in pl-PL');
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('compares an options object by identity', () => {
    const compute = vi.fn((options: { digits: number }) => options.digits);
    const format = memoLast(compute);
    const options = { digits: 1 };

    format(options);
    format(options);
    format({ digits: 1 });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('remembers a result of undefined too', () => {
    const compute = vi.fn((value: string | undefined) => value);
    const format = memoLast(compute);

    format(undefined);
    format(undefined);

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('tells NaN from a number and knows NaN when it sees it again', () => {
    const compute = vi.fn((value: number) => String(value));
    const format = memoLast(compute);

    format(Number.NaN);
    format(Number.NaN);
    format(0);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
