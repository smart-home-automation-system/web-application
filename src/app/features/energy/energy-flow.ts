import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { LABELS, SCENE, batteryCharge } from './energy-flow-scene';
import { FlowDirection, FlowView } from './energy-views';
import { PowerValue } from './power-value';

/** A line of the drawing: its state, whether the light runs along it or back, its speed, and its words. */
interface Link {
  readonly state: FlowDirection;
  /** `along` from the thing to the house, `back` from the house to the thing; none while nothing flows. */
  readonly run?: 'along' | 'back';
  /** The time the light takes along the line: the more power, the faster. */
  readonly duration: string;
  readonly label: MessageKey;
}

function link(
  direction: FlowDirection,
  watts: number | undefined,
  words: Readonly<Record<FlowDirection, MessageKey>>,
): Link {
  const run = direction === 'in' ? 'along' : direction === 'out' ? 'back' : undefined;
  return { state: direction, run, duration: durationOf(watts), label: words[direction] };
}

/** 3 s for a trickle down to 0.9 s from about 5 kW on - the light runs faster with more power. */
export function durationOf(watts: number | undefined): string {
  const kilowatts = watts === undefined ? 0 : Math.abs(watts) / 1000;
  return `${Math.max(0.9, 3 - 0.42 * kilowatts).toFixed(2)}s`;
}

/**
 * Where the energy of the house goes now (HAS-341). Since HAS-438 (owner 2026-11-13, after the energy flow of
 * SolaxCloud - its idea, not its pictures) an isometric scene of our own drawing (`energy-flow-scene.ts`): the
 * house in the middle, the panels up on the left, the battery up on the right, the grid down on the left, each
 * on a tile, in the colours of the page. A light runs along a line the way the energy flows - towards the house
 * or away - faster with more power; a line within 20 W of nothing (the dead band of `GET /energy/flows`) stands
 * still, one whose power is not known is dashed. Every line carries its meaning in words (`role="img"`), so the
 * motion is never the only sign; with reduced motion the light stands in the middle of its line. The words and
 * the powers stand beside the drawing as text. The battery says how full it is (HAS-417) - the SOC of
 * `GET /energy/battery`, handed in by the page, which also fills its cabinet; "not known" while that call has
 * not told it, never 0.
 */
@Component({
  selector: 'app-energy-flow',
  imports: [TranslocoDirective, LocalNumberPipe, PowerValue],
  template: `
    <ng-container *transloco="let t">
      @let f = flow();
      @let l = links();
      <div class="flow" data-testid="energy-flow">
        <svg class="scene" [attr.viewBox]="S.viewBox" aria-hidden="true" focusable="false">
          <defs>
            <filter [attr.id]="glowId" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- the tiles under the four things -->
          @for (tile of tiles; track $index) {
            <path class="tile__left" [attr.d]="tile.left" />
            <path class="tile__right" [attr.d]="tile.right" />
            <path class="tile__top" [attr.d]="tile.top" />
          }

          <!-- the lines, under the things they join -->
          @for (one of lineList(); track one.key) {
            <path class="link__track" [attr.data-state]="one.link.state" [attr.d]="one.d" />
            @if (one.link.run; as run) {
              <path
                class="link__light"
                pathLength="100"
                [attr.data-run]="run"
                [style.--flow-duration]="one.link.duration"
                [attr.filter]="'url(#' + glowId + ')'"
                [attr.d]="one.d"
              />
            }
          }

          <!-- the panels: legs, the board tilted to the sun, its cells -->
          <path class="thing__line" [attr.d]="S.panels.legs" />
          <path class="panels__board" [attr.d]="S.panels.board" />
          <path class="panels__edge" [attr.d]="S.panels.edge" />
          <path class="panels__cells" [attr.d]="S.panels.cells" />

          <!-- the battery: a cabinet whose left wall fills with its charge -->
          <path class="thing__left" [attr.d]="S.battery.left" />
          <path class="thing__right" [attr.d]="S.battery.right" />
          <path class="thing__top" [attr.d]="S.battery.top" />
          @if (charge(); as d) {
            <path class="battery__charge" [attr.d]="d" />
          }

          <!-- the grid: two pylons -->
          @for (pylon of S.pylons; track $index) {
            <path class="pylon" [attr.d]="pylon.frame" />
            @for (dot of pylon.insulators; track $index) {
              <circle class="pylon__insulator" r="2" [attr.cx]="dot.x" [attr.cy]="dot.y" />
            }
          }

          <!-- the house: its walls, lit windows, a door and its roof -->
          <path class="thing__left" [attr.d]="S.house.left" />
          <path class="thing__right" [attr.d]="S.house.right" />
          @for (pane of S.house.windows; track $index) {
            <path class="house__window" [attr.d]="pane" />
          }
          <path class="house__door" [attr.d]="S.house.door" />
          <path class="roof__back" [attr.d]="S.house.roofBack" />
          <path class="roof__gable" [attr.d]="S.house.gable" />
          <path class="roof__front" [attr.d]="S.house.roofFront" />
        </svg>

        <!-- what the drawing shows, in words: a screen reader hears every line -->
        <ul class="visually-hidden">
          <li class="arrow--panels" role="img" [attr.aria-label]="t(l.panels.label)"></li>
          <li class="arrow--battery" role="img" [attr.aria-label]="t(l.battery.label)"></li>
          <li class="arrow--grid" role="img" [attr.aria-label]="t(l.grid.label)"></li>
        </ul>

        <div
          class="label"
          data-node="panels"
          [style.left.%]="L.panels.left"
          [style.top.%]="L.panels.top"
        >
          <span class="label__name">{{ t('energy.flow.panels') }}</span>
          <strong class="label__value"><app-power-value [watts]="f.production" /></strong>
          @if (f.solaxPv !== undefined || f.sofarPv !== undefined) {
            <span class="label__parts label__parts--wide">
              SOLAX <app-power-value [watts]="f.solaxPv" /><br />SOFAR
              <app-power-value [watts]="f.sofarPv" />
            </span>
          }
        </div>

        <div
          class="label label--end"
          data-node="battery"
          [style.right.%]="L.battery.right"
          [style.top.%]="L.battery.top"
        >
          <span class="label__name">{{ t('energy.flow.battery') }}</span>
          <strong class="label__value"><app-power-value [watts]="f.battery" /></strong>
          <span class="label__parts" data-testid="flow-soc">
            @if (soc() !== undefined) {
              {{ t('energy.flow.soc') }} {{ soc()! | localNumber: WHOLE }}&nbsp;%
            } @else {
              {{ t('energy.flow.socNotKnown') }}
            }
          </span>
        </div>

        <div
          class="label label--house"
          data-node="house"
          [style.left.%]="L.house.left"
          [style.top.%]="L.house.top"
        >
          <span class="label__name">{{ t('energy.flow.house') }}</span>
          <strong class="label__value"><app-power-value [watts]="f.house" /></strong>
        </div>

        <div class="label" data-node="grid" [style.left.%]="L.grid.left" [style.top.%]="L.grid.top">
          <span class="label__name">{{ t('energy.flow.grid') }}</span>
          <strong class="label__value"><app-power-value [watts]="f.grid" /></strong>
        </div>
      </div>
    </ng-container>
  `,
  styles: `
    // the scene keeps the proportions of its drawing; the words stand over it in per cent of its size, and
    // the room under it takes the words of the grid
    .flow {
      position: relative;
      max-width: 640px;
      margin: 0 auto;
      padding-bottom: 28px;

      // the colours of the drawing, from the page: objects of light glass, the accent of the domain
      --scene-tile-top: color-mix(in srgb, var(--mat-sys-on-surface) 7%, transparent);
      --scene-tile-left: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
      --scene-tile-right: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent);
      --scene-edge: color-mix(in srgb, var(--mat-sys-on-surface) 18%, transparent);
      --scene-top: color-mix(in srgb, var(--mat-sys-on-surface) 30%, var(--mat-sys-surface-container-high));
      --scene-left: color-mix(in srgb, var(--mat-sys-on-surface) 18%, var(--mat-sys-surface-container-high));
      --scene-right: color-mix(in srgb, var(--mat-sys-on-surface) 9%, var(--mat-sys-surface-container-high));
      --scene-accent: var(--app-domain, var(--mat-sys-primary));
    }

    .scene {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .tile__top {
      fill: var(--scene-tile-top);
      stroke: var(--scene-edge);
      stroke-width: 1;
    }

    .tile__left {
      fill: var(--scene-tile-left);
    }

    .tile__right {
      fill: var(--scene-tile-right);
    }

    .thing__top,
    .roof__front {
      fill: var(--scene-top);
    }

    .thing__left,
    .roof__back {
      fill: var(--scene-left);
    }

    .thing__right,
    .roof__gable {
      fill: var(--scene-right);
    }

    .thing__top,
    .thing__left,
    .thing__right,
    .roof__back,
    .roof__gable,
    .roof__front {
      stroke: var(--scene-edge);
      stroke-width: 0.8;
      stroke-linejoin: round;
    }

    // the windows lit warm, the door in the colour of the walls
    .house__window {
      fill: var(--app-domain-light);
      opacity: 0.85;
    }

    .house__door {
      fill: var(--scene-left);
      stroke: var(--scene-edge);
      stroke-width: 0.8;
    }

    .thing__line {
      fill: none;
      stroke: var(--mat-sys-on-surface-variant);
      stroke-width: 1.6;
      stroke-linecap: round;
    }

    .panels__board {
      fill: color-mix(in srgb, var(--scene-accent) 55%, var(--mat-sys-surface-container-high));
      stroke: color-mix(in srgb, var(--scene-accent) 80%, white);
      stroke-width: 1;
      stroke-linejoin: round;
    }

    .panels__edge {
      fill: color-mix(in srgb, var(--scene-accent) 35%, var(--mat-sys-surface-container-high));
    }

    .panels__cells {
      fill: none;
      stroke: color-mix(in srgb, var(--scene-accent) 40%, white);
      stroke-width: 0.8;
      opacity: 0.8;
    }

    .battery__charge {
      fill: var(--scene-accent);
      opacity: 0.85;
    }

    .pylon {
      fill: none;
      stroke: var(--mat-sys-on-surface-variant);
      stroke-width: 1.3;
      stroke-linecap: round;
    }

    .pylon__insulator {
      fill: var(--mat-sys-on-surface-variant);
    }

    // ---- the lines: a faint track, and a light running along it the way the energy flows ----

    .link__track {
      fill: none;
      stroke: color-mix(in srgb, var(--mat-sys-outline) 55%, transparent);
      stroke-width: 3;
      stroke-linecap: round;

      &[data-state='unknown'] {
        stroke-dasharray: 6 6;
      }
    }

    .link__light {
      fill: none;
      stroke: var(--scene-accent);
      stroke-width: 4;
      stroke-linecap: round;
      // one short light on a line of 100 - its path length - entering at one end, leaving at the other
      stroke-dasharray: 18 120;
      animation: flow var(--flow-duration, 2s) linear infinite;

      &[data-run='back'] {
        animation-direction: reverse;
      }
    }

    @keyframes flow {
      from {
        stroke-dashoffset: 18;
      }
      to {
        stroke-dashoffset: -100;
      }
    }

    // reduced motion: the light stands in the middle of its line
    @media (prefers-reduced-motion: reduce) {
      .link__light {
        animation: none;
        stroke-dashoffset: -41;
      }
    }

    // ---- the words: a name, the power, and a detail ----

    .label {
      position: absolute;
      display: grid;
      gap: 1px;
      min-width: 0;
      max-width: 34%;
      line-height: 1.25;
    }

    .label--end {
      justify-items: end;
      text-align: right;
    }

    .label__name {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }

    .label__value {
      font: var(--mat-sys-title-large);
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
    }

    .label__parts {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    // a phone: the drawing is smaller, the words too
    @media (max-width: 599.98px) {
      .label__value {
        font: var(--mat-sys-title-medium);
      }

      .label__name {
        font: var(--mat-sys-label-medium);
      }

      // the power of each inverter would run into the pylons: the cards of the inverters below tell it
      .label__parts--wide {
        display: none;
      }
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyFlow {
  /** Two of these drawings on a page must not share the id of their glow. */
  private static count = 0;
  protected readonly glowId = `energy-flow-glow-${EnergyFlow.count++}`;

  /** The SOC of the battery in %, from the battery call; `undefined` while not known. */
  readonly soc = input<number>();
  readonly flow = input.required<FlowView>();

  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly S = SCENE;
  protected readonly L = LABELS;
  protected readonly tiles = [SCENE.tiles.panels, SCENE.tiles.battery, SCENE.tiles.grid, SCENE.tiles.house];

  protected readonly charge = computed(() => batteryCharge(this.soc()));

  protected readonly links = computed(() => {
    const f = this.flow();
    return {
      panels: link(f.panels, f.production, {
        in: 'energy.flow.panelsIn',
        out: 'energy.flow.panelsIn',
        idle: 'energy.flow.panelsIdle',
        unknown: 'energy.flow.unknown',
      }),
      battery: link(f.batteryFlow, f.battery, {
        in: 'energy.flow.batteryIn',
        out: 'energy.flow.batteryOut',
        idle: 'energy.flow.batteryIdle',
        unknown: 'energy.flow.unknown',
      }),
      grid: link(f.gridFlow, f.grid, {
        in: 'energy.flow.gridIn',
        out: 'energy.flow.gridOut',
        idle: 'energy.flow.gridIdle',
        unknown: 'energy.flow.unknown',
      }),
    };
  });

  protected readonly lineList = computed(() => {
    const l = this.links();
    return [
      { key: 'panels', d: SCENE.links.panels, link: l.panels },
      { key: 'battery', d: SCENE.links.battery, link: l.battery },
      { key: 'grid', d: SCENE.links.grid, link: l.grid },
    ];
  });
}
