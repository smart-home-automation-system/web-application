import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { COUNTER_PRESETS, Counter, CounterPreset, energyParts } from './appliance-history';

const PRESET_LABELS: Readonly<Record<CounterPreset, MessageKey>> = {
  day: 'history.preset.day',
  week: 'history.preset.week',
  month: 'history.preset.month',
};

/**
 * The cycles and the energy of 24 hours, 7 and 30 days side by side (HAS-283) - of one appliance, or of the
 * whole house. A cycle whose energy is not known is named, never added as 0 Wh; one that still runs is
 * counted and adds no energy yet.
 */
@Component({
  selector: 'app-counter-row',
  imports: [TranslocoDirective, LocalNumberPipe],
  template: `
    <ng-container *transloco="let t">
      <dl class="counters" data-testid="counters">
        @for (preset of presets; track preset) {
          @let counter = counters()[preset];
          @let energy = energyParts(counter.energyWh);
          <div class="counter" [attr.data-period]="preset">
            <dt>{{ t(labels[preset]) }}</dt>
            <dd class="counter__cycles">{{ t('appliances.page.cycles', { count: counter.cycles }) }}</dd>
            <dd class="counter__energy">
              <!-- no finished cycle with a known energy: nothing to add up, never 0 Wh -->
              @if (counter.cycles - counter.running - counter.energyUnknown > 0) {
                {{ energy.value | localNumber: (energy.unit === 'Wh' ? WHOLE : KWH) }} {{ energy.unit }}
              } @else {
                –
              }
            </dd>
            @if (counter.energyUnknown > 0) {
              <dd class="counter__note">
                {{ t('appliances.page.energyUnknown', { count: counter.energyUnknown }) }}
              </dd>
            }
            @if (counter.running > 0) {
              <dd class="counter__note">{{ t('appliances.page.stillRunning', { count: counter.running }) }}</dd>
            }
          </div>
        }
      </dl>
    </ng-container>
  `,
  styles: `
    .counters {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 0;
    }

    .counter {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
    }

    .counter__cycles {
      font: var(--mat-sys-title-small);
    }

    .counter__energy {
      font: var(--mat-sys-body-medium);
    }

    .counter__note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  // a number and its unit side by side
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CounterRow {
  readonly counters = input.required<Readonly<Record<CounterPreset, Counter>>>();

  protected readonly presets = COUNTER_PRESETS;
  protected readonly labels = PRESET_LABELS;
  protected readonly energyParts = energyParts;
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly KWH: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
}
