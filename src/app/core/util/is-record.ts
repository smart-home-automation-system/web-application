/**
 * True for anything with properties to look at - where a checked read of something that came
 * from outside (an answer of the backend, a value kept in the browser) starts.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
