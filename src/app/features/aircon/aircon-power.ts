import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { ProfileStore } from '../../core/profile/profile-store';
import { AirconApi, AirconPlug, PowerCycleState } from '../../data-access/aircon/aircon-api';
import { DisplayText } from '../../i18n/messages';
import { airconFailureOf, cycleResultText } from '../../shared/aircon/aircon-labels';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';

/** The plugs in the order of the house: the four indoor units first, then the sanctum. */
const PLUG_ORDER = ['indoor', 'sanctum'];

/**
 * The two plugs that feed the air conditioners (HAS-395, `GET /aircon/power` of aircon-service >= 0.10.0): what
 * each draws now, whether its compressor runs, the energy of today, 7 and 30 days - and the power cycle of the
 * indoor plug (`GET` / `POST /aircon/power-cycle`): offered only while the service allows it, after a question
 * in place ("Cancel" focused), the reason of a refusal printed as the service words it. Both calls belong to the
 * page, which tells their freshness and failure once at the top.
 */
@Component({
  selector: 'app-aircon-power',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  templateUrl: './aircon-power.html',
  styleUrl: './aircon-power.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class AirconPower {
  /** `undefined` while the plugs are not known (no answer yet, or a failure before any). */
  readonly plugs = input<readonly AirconPlug[] | null | undefined>();
  readonly cycle = input<PowerCycleState | null | undefined>();
  readonly refreshCycle = input.required<() => Promise<void>>();

  private readonly api = inject(AirconApi);
  private readonly profiles = inject(ProfileStore);
  private readonly injector = inject(Injector);
  private readonly safeAnswer = viewChild<string, ElementRef<HTMLElement>>('safeAnswer', {
    read: ElementRef,
  });

  protected readonly commands = new DeviceCommands<'cycle'>();
  protected readonly asking = signal(false);
  protected readonly state = computed(() => this.commands.stateOf('cycle'));
  protected readonly airconFailureOf = airconFailureOf;
  protected readonly cycleResultText = cycleResultText;
  protected readonly literal = (text: string): DisplayText => ({ literal: text });
  protected readonly WATTS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly KWH: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  protected readonly WHEN: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };

  protected readonly shown = computed(() => {
    const plugs = this.plugs();
    if (!Array.isArray(plugs)) {
      return undefined;
    }
    const rank = (plug: AirconPlug): number => {
      const at = PLUG_ORDER.indexOf(plug.plug ?? '');
      return at < 0 ? PLUG_ORDER.length : at;
    };
    return [...plugs].sort((a, b) => rank(a) - rank(b));
  });

  constructor() {
    // a question with nothing left to ask goes for good: the service no longer allows the cycle
    effect(() => {
      if (this.asking() && this.cycle()?.allowed !== true) {
        this.asking.set(false);
      }
    });
  }

  protected ask(): void {
    this.asking.set(true);
    // the button that was pressed is gone with the question: "Cancel" takes the focus
    afterNextRender(() => this.safeAnswer()?.nativeElement.focus(), { injector: this.injector });
  }

  protected start(): void {
    this.commands.send(
      'cycle',
      this.api.startPowerCycle(this.profiles.profile()?.name),
      async () => {
        this.asking.set(false);
        await this.refreshCycle()();
      },
    );
  }
}
