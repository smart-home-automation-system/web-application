import { isRecord } from '../../core/util/is-record';
import { Blind } from '../../data-access/blinds/blinds-api';

/** A blind a control can address: one with the id of the device registry. */
export type AddressedBlind = Blind & { readonly id: number };

/**
 * Every blind of an answer of `GET /blinds` (a list of rooms with their blinds) that can be
 * addressed, in its order. Nothing checks an answer at runtime: an entry that is not a blind with
 * an id is passed over - a control needs the id. `undefined` for an answer that is not a list.
 */
export function blindsOf(answer: unknown): readonly AddressedBlind[] | undefined {
  if (!Array.isArray(answer)) {
    return undefined;
  }
  return (answer as unknown[]).filter(isRecord).flatMap((group) => {
    const list = group['blinds'];
    const room = typeof group['room'] === 'string' ? group['room'] : undefined;
    return (Array.isArray(list) ? (list as unknown[]) : [])
      .filter(
        (blind): blind is AddressedBlind =>
          isRecord(blind) && typeof blind['id'] === 'number' && Number.isFinite(blind['id']),
      )
      .map((blind) =>
        blind.room === undefined && room !== undefined ? { ...blind, room } : blind,
      );
  });
}
