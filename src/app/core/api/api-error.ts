import { HttpErrorResponse } from '@angular/common/http';

/**
 * What went wrong, from the point of view of what the user can do about it:
 * - `network` - no answer at all (backend down, VPN off, connection lost),
 * - `invalid-response` - an answer that is not what the API sends (HTML instead of JSON),
 * - `client` - a 4xx: the request was refused,
 * - `server` - a 5xx: the backend failed,
 * - `unexpected` - a failure outside HTTP (a bug on our side).
 */
export type ApiErrorKind = 'network' | 'invalid-response' | 'client' | 'server' | 'unexpected';

/** One entry of the `errors` array every backend service answers with (`cholewa-commons`). */
export interface ApiErrorMessage {
  readonly message: string;
  /** Stable, machine-readable name of the cause; present only for named causes. */
  readonly code?: string;
}

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    /** HTTP status; 0 when there was no answer. */
    readonly status: number,
    readonly messages: readonly ApiErrorMessage[] = [],
    cause?: unknown,
  ) {
    super(messages[0]?.message ?? `API call failed (${kind}, status ${status})`, { cause });
    this.name = 'ApiError';
  }

  hasCode(code: string): boolean {
    return this.messages.some((entry) => entry.code === code);
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (!(error instanceof HttpErrorResponse)) {
    return new ApiError('unexpected', 0, [], error);
  }
  if (error.status === 0) {
    return new ApiError('network', 0, [], error);
  }
  // a 2xx that could not be parsed: something other than the API answered (a proxy page, the
  // SPA fallback of a wrongly routed path)
  if (error.status >= 200 && error.status < 300) {
    return new ApiError('invalid-response', error.status, [], error);
  }
  const kind: ApiErrorKind = error.status >= 500 ? 'server' : 'client';
  return new ApiError(kind, error.status, decodeMessages(error.error), error);
}

/**
 * Reads the `errors` array of the shared error contract. The status must survive any body, so
 * everything that is not the contract - no body, HTML, JSON of another shape, null entries -
 * decodes into an empty list instead of throwing. `details` (the raw exception text) is dropped
 * on purpose: it is for the logs, never for the screen.
 */
function decodeMessages(body: unknown): ApiErrorMessage[] {
  const parsed = typeof body === 'string' ? parseJson(body) : body;
  if (!isRecord(parsed) || !Array.isArray(parsed['errors'])) {
    return [];
  }
  return parsed['errors'].flatMap((entry: unknown): ApiErrorMessage[] => {
    if (!isRecord(entry) || typeof entry['message'] !== 'string' || entry['message'] === '') {
      return [];
    }
    const code = entry['code'];
    return [
      typeof code === 'string' && code !== ''
        ? { message: entry['message'], code }
        : { message: entry['message'] },
    ];
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
