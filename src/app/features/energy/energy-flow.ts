import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { FlowDirection, FlowView } from './energy-views';
import { PowerValue } from './power-value';

/** An arrow of the diagram: its icon and the words for whoever cannot see it. */
interface Arrow {
  readonly icon: string;
  readonly state: FlowDirection;
  readonly label: MessageKey;
}

/** The icon of a line by the way it runs on screen: `toHouse` is the icon pointing at the house. */
function arrow(
  direction: FlowDirection,
  toHouse: string,
  fromHouse: string,
  words: Readonly<Record<FlowDirection, MessageKey>>,
): Arrow {
  const icons: Readonly<Record<FlowDirection, string>> = {
    in: toHouse,
    out: fromHouse,
    idle: 'remove',
    unknown: 'question_mark',
  };
  return { icon: icons[direction], state: direction, label: words[direction] };
}

/**
 * Where the energy of the house goes now (HAS-341): the panels above the house, the battery on its
 * left, the grid on its right, an arrow along each line by the sign of its power in
 * `GET /energy/flows` - none within 20 W of nothing, a question mark where the power is not known.
 * The arrows carry their meaning in words too; the colour is never the only sign. The battery also
 * says how full it is (HAS-417, owner 2026-11-11) - the SOC of `GET /energy/battery`, the call of the
 * battery card, handed in by the page; "not known" while that call has not told it, never 0.
 */
@Component({
  selector: 'app-energy-flow',
  imports: [MatIconModule, TranslocoDirective, LocalNumberPipe, PowerValue],
  template: `
    <ng-container *transloco="let t">
      @let f = flow();
      <div class="flow" data-testid="energy-flow">
        <div class="node node--panels" data-node="panels">
          <mat-icon class="node__icon" aria-hidden="true">solar_power</mat-icon>
          <span class="node__name">{{ t('energy.flow.panels') }}</span>
          <strong class="node__value"><app-power-value [watts]="f.production" /></strong>
          @if (f.solaxPv !== undefined || f.sofarPv !== undefined) {
            <span class="node__parts">
              SOLAX <app-power-value [watts]="f.solaxPv" /> · SOFAR
              <app-power-value [watts]="f.sofarPv" />
            </span>
          }
        </div>

        <div
          class="arrow arrow--panels"
          role="img"
          [attr.data-state]="arrows().panels.state"
          [attr.aria-label]="t(arrows().panels.label)"
        >
          <mat-icon aria-hidden="true">{{ arrows().panels.icon }}</mat-icon>
        </div>

        <div class="node node--battery" data-node="battery">
          <mat-icon class="node__icon" aria-hidden="true">battery_charging_full</mat-icon>
          <span class="node__name">{{ t('energy.flow.battery') }}</span>
          <strong class="node__value"><app-power-value [watts]="f.battery" /></strong>
          <span class="node__parts" data-testid="flow-soc">
            @if (soc() !== undefined) {
              {{ t('energy.flow.soc') }} {{ soc()! | localNumber: WHOLE }}&nbsp;%
            } @else {
              {{ t('energy.flow.socNotKnown') }}
            }
          </span>
        </div>

        <div
          class="arrow arrow--battery"
          role="img"
          [attr.data-state]="arrows().battery.state"
          [attr.aria-label]="t(arrows().battery.label)"
        >
          <mat-icon aria-hidden="true">{{ arrows().battery.icon }}</mat-icon>
        </div>

        <div class="node node--house" data-node="house">
          <mat-icon class="node__icon" aria-hidden="true">home</mat-icon>
          <span class="node__name">{{ t('energy.flow.house') }}</span>
          <strong class="node__value"><app-power-value [watts]="f.house" /></strong>
        </div>

        <div
          class="arrow arrow--grid"
          role="img"
          [attr.data-state]="arrows().grid.state"
          [attr.aria-label]="t(arrows().grid.label)"
        >
          <mat-icon aria-hidden="true">{{ arrows().grid.icon }}</mat-icon>
        </div>

        <div class="node node--grid" data-node="grid">
          <mat-icon class="node__icon" aria-hidden="true">electrical_services</mat-icon>
          <span class="node__name">{{ t('energy.flow.grid') }}</span>
          <strong class="node__value"><app-power-value [watts]="f.grid" /></strong>
        </div>
      </div>
    </ng-container>
  `,
  styles: `
    .flow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
      grid-template-areas:
        '. . panels . .'
        '. . arrow-panels . .'
        'battery arrow-battery house arrow-grid grid';
      align-items: center;
      justify-items: center;
      gap: 4px 8px;
      padding: 4px 0;
    }

    .node {
      display: grid;
      justify-items: center;
      gap: 2px;
      min-width: 0;
      padding: 10px 8px;
      border: 1px solid var(--app-glass-edge);
      border-radius: var(--mat-sys-corner-medium);
      text-align: center;
      width: 100%;
      box-sizing: border-box;
    }

    .node--panels {
      grid-area: panels;
      max-width: 260px;
    }

    .node--battery {
      grid-area: battery;
    }

    .node--house {
      grid-area: house;
      border-width: 2px;
      border-color: var(--app-domain, var(--mat-sys-outline));
    }

    .node--grid {
      grid-area: grid;
    }

    .node__icon {
      color: var(--app-domain, var(--mat-sys-on-surface-variant));
    }

    .node__name {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }

    .node__value {
      font: var(--mat-sys-title-large);
      color: var(--mat-sys-on-surface);
    }

    .node__parts {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .arrow--panels {
      grid-area: arrow-panels;
    }

    .arrow--battery {
      grid-area: arrow-battery;
    }

    .arrow--grid {
      grid-area: arrow-grid;
    }

    .arrow mat-icon {
      color: var(--mat-sys-on-surface);
    }

    .arrow[data-state='idle'] mat-icon,
    .arrow[data-state='unknown'] mat-icon {
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.6;
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyFlow {
  /** The SOC of the battery in %, from the battery call; `undefined` while not known. */
  readonly soc = input<number>();
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  readonly flow = input.required<FlowView>();

  protected readonly arrows = computed(() => {
    const f = this.flow();
    return {
      panels: arrow(f.panels, 'south', 'north', {
        in: 'energy.flow.panelsIn',
        out: 'energy.flow.panelsIn',
        idle: 'energy.flow.panelsIdle',
        unknown: 'energy.flow.unknown',
      }),
      battery: arrow(f.batteryFlow, 'east', 'west', {
        in: 'energy.flow.batteryIn',
        out: 'energy.flow.batteryOut',
        idle: 'energy.flow.batteryIdle',
        unknown: 'energy.flow.unknown',
      }),
      grid: arrow(f.gridFlow, 'west', 'east', {
        in: 'energy.flow.gridIn',
        out: 'energy.flow.gridOut',
        idle: 'energy.flow.gridIdle',
        unknown: 'energy.flow.unknown',
      }),
    };
  });
}
