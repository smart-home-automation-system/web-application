import { ApiError } from '../../core/api/api-error';
import { MemberRequest } from '../../data-access/household/member-requests-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

/**
 * The refusals of the household requests of `database-service` 0.22.0 (`CustomErrorDescription`, whose
 * constant names are wire contract), each with a sentence of our own. The English reason of
 * `INVALID_REQUEST` never reaches the screen: the form checks the text before it sends.
 */
export const REQUEST_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_REQUEST: 'requests.error.notFound',
  INVALID_REQUEST: 'requests.error.invalid',
  MEMBER_SWITCHED_OFF: 'requests.error.memberSwitchedOff',
  NOT_FOUND_HOUSEHOLD_MEMBER: 'requests.error.memberNotFound',
};

export function describeRequestError(error: ApiError): DisplayText {
  const named = Object.entries(REQUEST_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** One line of the card: what the answer says of a request, nothing made up. */
export interface RequestView {
  readonly id: number;
  readonly text: string;
  /** The author when it is somebody else than the member of the profile; `undefined` otherwise. */
  readonly from?: string;
  readonly createdAt?: string;
  readonly sentAt?: string;
  readonly doneAt?: string;
  /** Who ticked it off when it is somebody else than the member of the profile. */
  readonly doneBy?: string;
}

export interface RequestLists {
  /** Open, oldest first - the order of the answer. */
  readonly open: readonly RequestView[];
  /** Done in the last 30 days, the last ticked off first. */
  readonly done: readonly RequestView[];
}

/**
 * The open and the done requests of the answer of `?done=true`. A request without an id or a text gets no
 * line - nothing could be done with it - and the names are compared whatever their case, as the registry
 * does.
 */
export function toRequestLists(
  answer: readonly MemberRequest[] | null | undefined,
  me: string | undefined,
): RequestLists {
  const views = (answer ?? [])
    .filter(
      (request) => isId(request.id) && typeof request.text === 'string' && request.text !== '',
    )
    .map((request) => toView(request, me));
  return {
    open: views.filter((view) => view.doneAt === undefined),
    done: views
      .filter((view) => view.doneAt !== undefined)
      // the wall-clock texts of the house sort as times
      .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
  };
}

/** A request the member of the profile wrote for somebody else. */
export interface WrittenView extends RequestView {
  /** Whose list it is on. */
  readonly recipient: string;
}

export interface WrittenLists {
  /** Open, the last written first - the one just added on top. */
  readonly open: readonly WrittenView[];
  /** Done in the last 30 days, the last ticked off first. */
  readonly done: readonly WrittenView[];
}

/**
 * What `me` wrote for the others, out of their lists read together: the author is `me` and the recipient
 * somebody else (what one writes for oneself is on one's own list). Names compared whatever their case.
 */
export function toWrittenLists(
  answer: readonly MemberRequest[] | null | undefined,
  me: string | undefined,
): WrittenLists {
  const mine = (name: unknown) =>
    me !== undefined && typeof name === 'string' && name.toLowerCase() === me.toLowerCase();
  const views = (answer ?? [])
    .filter(
      (request) =>
        isId(request.id) &&
        typeof request.text === 'string' &&
        request.text !== '' &&
        mine(request.author) &&
        textOf(request.member) !== undefined &&
        !mine(request.member),
    )
    .map((request) => ({ ...toView(request, me), recipient: request.member as string }));
  const latestFirst = (a?: string, b?: string) => (b ?? '').localeCompare(a ?? '');
  return {
    open: views
      .filter((view) => view.doneAt === undefined)
      .sort((a, b) => latestFirst(a.createdAt, b.createdAt)),
    done: views
      .filter((view) => view.doneAt !== undefined)
      .sort((a, b) => latestFirst(a.doneAt, b.doneAt)),
  };
}

function toView(request: MemberRequest, me: string | undefined): RequestView {
  return {
    id: request.id,
    text: request.text,
    from: other(request.author, me),
    createdAt: textOf(request.createdAt),
    sentAt: textOf(request.sentAt),
    doneAt: textOf(request.doneAt),
    doneBy: other(request.doneBy, me),
  };
}

function other(name: unknown, me: string | undefined): string | undefined {
  const named = textOf(name);
  return named !== undefined && named.toLowerCase() !== me?.toLowerCase() ? named : undefined;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function isId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}
