import { ApiError } from '../../core/api/api-error';
import { TagRead } from '../../data-access/appliance/appliance-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../../shared/api-error/describe-api-error';

const PICC_DATA = /^[0-9a-fA-F]{32}$/;
const CMAC = /^[0-9a-fA-F]{16}$/;

/**
 * The read in the URL of a tag, `?picc_data=<32 hex>&cmac=<16 hex>` - the form NFC.cool Tools programs
 * (SUN encrypted, HAS-343) - or `undefined` for a link that carries none: such a link is no tag read, and
 * nothing is sent for it. The service checks the read itself; this only spares it what cannot be one.
 */
export function readTag(piccData: string | null, cmac: string | null): TagRead | undefined {
  return piccData !== null && cmac !== null && PICC_DATA.test(piccData) && CMAC.test(cmac)
    ? { piccData, cmac }
    : undefined;
}

/**
 * The refusals of `POST /home/appliance/claims` (`ApplianceError` of `appliance-service`, whose names are
 * wire contract there), each with a sentence of our own. A new or renamed code needs a text here - the
 * test of this file lists them. `UNKNOWN_MEMBER` is told on the list of the household, where the page
 * goes for it.
 */
export const CLAIM_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  INVALID_TAG: 'tagClaim.error.invalidTag',
  REPLAYED_TAG: 'tagClaim.error.replayed',
  NOTHING_TO_CLAIM: 'tagClaim.error.nothingToClaim',
  NOT_FOUND_APPLIANCE: 'tagClaim.error.notFound',
  UNKNOWN_MEMBER: 'tagClaim.error.unknownMember',
};

/**
 * A failed claim in words. One that got no answer may have been recorded all the same - and trying
 * again is safe: a read the service already took is refused as `REPLAYED_TAG`, never recorded twice.
 */
export function describeClaimError(error: ApiError): DisplayText {
  if (error.kind === 'network') {
    return { key: 'tagClaim.error.noAnswer' };
  }
  const named = Object.entries(CLAIM_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/** Whether another attempt of the same read can still change the outcome: no answer, or a failing service. */
export function worthRetrying(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'server';
}
