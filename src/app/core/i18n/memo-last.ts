/**
 * Remembers the last call of a function and answers it again without computing. Made for the
 * formatting pipes: they are not pure, so Angular runs them on every refresh of a view, almost
 * always with the arguments of the time before.
 *
 * Arguments are compared by identity, which is what a template passes: the same value, and for
 * an options literal the same object for as long as nothing in it changes.
 */
export function memoLast<Args extends readonly unknown[], Result>(
  compute: (...args: Args) => Result,
): (...args: Args) => Result {
  let lastArgs: Args | undefined;
  let lastResult: Result;
  return (...args: Args): Result => {
    const same =
      lastArgs !== undefined &&
      lastArgs.length === args.length &&
      args.every((arg, index) => Object.is(arg, lastArgs?.[index]));
    if (!same) {
      lastResult = compute(...args);
      lastArgs = args;
    }
    return lastResult;
  };
}
