import { Injectable, Signal, inject, signal } from '@angular/core';
import { Observable, concat, lastValueFrom } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { ApiError, toApiError } from '../../core/api/api-error';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/**
 * `GET /home/household/profiles` - a household member as the dashboard may know them
 * (`database-service`, `HouseholdProfile` of `smart-home-sdk`): the name, the role, the rooms
 * and the permissions, and nothing else of the registry. Only active members are in the answer.
 *
 * Nothing checks an answer at runtime, so the role is plain text here - whoever reads it
 * decides what an unknown value means.
 */
export interface HouseholdProfile {
  readonly name: string;
  /** `admin` or `resident`. */
  readonly role?: string;
  /** Identifiers of the member's rooms, in display order; left out when there are none. */
  readonly rooms?: readonly string[];
  /**
   * What the member may do beyond their role (`heating_switch`); left out when nothing was
   * granted, and by a registry older than `database-service` 0.11.0 always.
   */
  readonly permissions?: readonly string[];
}

/** A device of a member (`MemberPhoneDetails`): what the presence detection looks for. */
export interface MemberDevice {
  readonly name?: string;
  /** Lowercase, colon separated - the address of the device, and what it is addressed by. */
  readonly mac?: string;
}

/**
 * A member as the registry holds them (`GET /home/household`, `HouseholdMember` of
 * `smart-home-sdk`), switched off or not. Every field but the name is optional here: nothing
 * checks an answer, and the service leaves `rooms` and `permissions` out when they are empty.
 */
export interface HouseholdMember {
  readonly name: string;
  /** E.164: `+48500100200`. */
  readonly phone?: string;
  readonly active?: boolean;
  readonly role?: string;
  readonly rooms?: readonly string[];
  readonly permissions?: readonly string[];
  readonly devices?: readonly MemberDevice[];
}

/** What the administration sets of a member; the name is what the member is addressed by. */
export interface MemberDetails {
  readonly name: string;
  readonly phone: string;
  /** Left out, the registry keeps the role it has - or makes a new member a resident. */
  readonly role?: string;
  readonly rooms: readonly string[];
  readonly permissions: readonly string[];
}

export interface DeviceDetails {
  readonly name: string;
  readonly mac: string;
}

/** How a change of the registry ended. */
export interface ChangeOutcome {
  /** True when every call of the change was answered with a success. */
  readonly carriedOut: boolean;
  /**
   * Why it was not; absent for a change refused because another one was under way. A failure
   * of the `network` kind is a call that got no answer - it may have been carried out.
   */
  readonly failure?: ApiError;
}

const CARRIED_OUT: ChangeOutcome = { carriedOut: true };
const REFUSED: ChangeOutcome = { carriedOut: false };

/**
 * The household registry for its administration: the members, kept fresh by polling, and the
 * ways to change them. There is no optimistic state - `value` is only ever what the registry
 * answered, and after a change, carried out or not, it is asked again before the change counts
 * as over.
 *
 * Every change resolves with how it ended - never rejects. One change at a time: a second one
 * asked for while `changing` is refused without a call, because every write of the registry
 * stores the whole row, and two for one member can undo each other.
 */
export interface HouseholdRegistry extends PollingResource<readonly HouseholdMember[] | null> {
  /** True from the moment a change is sent until the registry has been read again. */
  readonly changing: Signal<boolean>;
  add(member: MemberDetails): Promise<ChangeOutcome>;
  /**
   * Changes a member, addressed by the name they have now. Up to three calls, one after the
   * other: the rooms, the permissions, then the name, phone and role - each only when `before`
   * shows that it changed, so saving a form nothing was changed in makes no call at all. A
   * failure stops the rest; what was carried out until then stays, and shows in the registry
   * read afterwards.
   */
  update(before: HouseholdMember, member: MemberDetails): Promise<ChangeOutcome>;
  /** Switches a member on or off: off, they have no profile and their presence is not watched. */
  setActive(name: string, active: boolean): Promise<ChangeOutcome>;
  /** Removes the member with their devices. */
  remove(name: string): Promise<ChangeOutcome>;
  addDevice(member: string, device: DeviceDetails): Promise<ChangeOutcome>;
  /** Changes the device the member has under `mac`. */
  updateDevice(member: string, mac: string, device: DeviceDetails): Promise<ChangeOutcome>;
  removeDevice(member: string, mac: string): Promise<ChangeOutcome>;
}

// the registry changes when somebody changes it, which is this page or a tool next to it
const POLL_REGISTRY_EVERY_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class HouseholdApi {
  private readonly api = inject(ApiClient);

  /**
   * The profiles of the active members. Deliberately not the registry itself
   * (`GET /home/household`), which carries the phone number and the devices of everybody: this
   * call is made by every browser in the house, at every start.
   */
  profiles(): Observable<HouseholdProfile[]> {
    return this.api.get<HouseholdProfile[]>('/household/profiles');
  }

  /**
   * The whole registry - phone numbers and devices included - with the ways to change it.
   * **For the administration page and nothing else**: every other view learns about the
   * household from `profiles()`.
   *
   * Call in an injection context: the polling lives as long as the caller. A change that is on
   * its way when the caller goes is not aborted with it - a write cut off halfway is carried
   * out or not, and nobody would know which. What does cut it off is the time limit of
   * `ApiClient`: such a change fails as `network`, which says "no answer", not "not carried
   * out".
   */
  watchRegistry(): HouseholdRegistry {
    const registry = pollingResource(
      () => this.api.get<readonly HouseholdMember[] | null>('/household'),
      { intervalMs: POLL_REGISTRY_EVERY_MS },
    );
    const changing = signal(false);

    // The answers of the calls are not used: what is on screen is what the registry gives when
    // asked, also after a change that failed or got no answer.
    const change = async (calls: readonly Observable<unknown>[]): Promise<ChangeOutcome> => {
      if (changing()) {
        return REFUSED;
      }
      changing.set(true);
      let failure: ApiError | undefined;
      try {
        // one after the other, and none after one that failed
        await lastValueFrom(concat(...calls), { defaultValue: undefined });
      } catch (error) {
        failure = toApiError(error);
      }
      await registry.refresh();
      changing.set(false);
      return failure === undefined ? CARRIED_OUT : { carriedOut: false, failure };
    };

    const member = (name: string) => `/household/member/${encodeURIComponent(name)}`;

    return {
      ...registry,
      changing: changing.asReadonly(),
      add: (details) =>
        change([
          this.api.post('/household/member', {
            name: details.name,
            phone: details.phone,
            ...(details.role === undefined ? {} : { role: details.role }),
            rooms: details.rooms,
            permissions: details.permissions,
          }),
        ]),
      update: (before, details) =>
        change([
          ...(sameList(before.rooms ?? [], details.rooms)
            ? []
            : [this.api.put(`${member(before.name)}/rooms`, details.rooms)]),
          ...(sameList(before.permissions ?? [], details.permissions)
            ? []
            : [this.api.put(`${member(before.name)}/permissions`, details.permissions)]),
          // The name last: until then the member answers to the name the caller knows, so a
          // change that stops halfway leaves them where the caller still finds them.
          ...(before.name === details.name &&
          before.phone === details.phone &&
          (details.role === undefined || before.role === details.role)
            ? []
            : [
                this.api.patch(member(before.name), {
                  name: details.name,
                  phone: details.phone,
                  ...(details.role === undefined ? {} : { role: details.role }),
                }),
              ]),
        ]),
      setActive: (name, active) =>
        change([this.api.post(`${member(name)}/${active ? 'activate' : 'deactivate'}`)]),
      remove: (name) => change([this.api.delete(member(name))]),
      addDevice: (name, device) => change([this.api.post(`${member(name)}/device`, device)]),
      updateDevice: (name, mac, device) =>
        change([this.api.patch(`${member(name)}/device`, device, { mac })]),
      removeDevice: (name, mac) => change([this.api.delete(`${member(name)}/device`, { mac })]),
    };
  }
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
