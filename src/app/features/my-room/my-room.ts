import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { ProfileStore } from '../../core/profile/profile-store';
import { ROOM_CAPABILITIES } from './capabilities';

/**
 * The page of a household member - a resident's whole application, made for the phone. It shows
 * the rooms the registry gives the active profile, one at a time: a member with several chooses
 * among them, a member with none is told so.
 *
 * What a room shows is a list of capability cards (`ROOM_CAPABILITIES`), each created for the
 * room on screen; the page itself knows none of them. Everything about a room is read-only.
 *
 * The page holds what belongs to a room and nothing else (HAS-438, owner 2026-11-13): the appliances
 * and the chores, the requests, the notifications of this device and the switch of the heating of the
 * whole house are the household's, each on a page of its own in the navigation of a member.
 */
@Component({
  selector: 'app-my-room',
  imports: [
    NgComponentOutlet,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
  ],
  templateUrl: './my-room.html',
  styleUrl: './my-room.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRoom {
  private readonly profile = inject(ProfileStore).profile;
  protected readonly capabilities = ROOM_CAPABILITIES;

  /** The rooms of the profile, each once, in the order of the registry. */
  protected readonly rooms = computed(() => [...new Set(this.profile()?.rooms ?? [])]);

  private readonly chosen = signal<string | undefined>(undefined);

  /**
   * The room on screen: the one chosen, for as long as the profile has it - the registry may
   * take a room away under an open page - and otherwise the first. A choice that is gone is
   * forgotten (the effect below), not merely hidden: hidden, it would pull the page back to
   * that room by itself the day the registry gives it back.
   */
  protected readonly room = computed(() => {
    const rooms = this.rooms();
    const chosen = this.chosen();
    return chosen !== undefined && rooms.includes(chosen) ? chosen : rooms.at(0);
  });

  /** A list of the one room on screen: a card tracked by it is made anew when it changes. */
  protected readonly shown = computed(() => {
    const room = this.room();
    return room === undefined ? [] : [room];
  });

  constructor() {
    effect(() => {
      const chosen = this.chosen();
      if (chosen !== undefined && !this.rooms().includes(chosen)) {
        this.chosen.set(undefined);
      }
    });
  }

  protected choose(room: string): void {
    this.chosen.set(room);
  }
}
