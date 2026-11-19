import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { GateApi } from '../../data-access/gate/gate-api';
import { MessageKey } from '../../i18n/messages';
import { gateReadBack } from '../../shared/gate/gate-read-back';
import { Source, SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { GateAlerts } from './gate-alerts';
import { GateDriveway } from './gate-driveway';
import { GateGarages } from './gate-garages';
import { GateTimeline } from './gate-timeline';

/**
 * The gate page (HAS-454, every member - owner 2026-11-19: a page in the menu of everyone rather than a card on My
 * room, whose cards belong to the room; the target of the push of a ring): the driveway gate with "Open the gate",
 * the garage gates with their one button each, their open alarms, and the rings and openings of 7 or 30 days.
 * Three calls, each told once in the strip of sources at the top; the timeline has its own and tells it on its
 * card. No press is optimistic: a gate is read again at once and a few seconds later, and only what `gate-service`
 * answers moves anything on the page.
 */
@Component({
  selector: 'app-gate-page',
  imports: [TranslocoDirective, GateAlerts, GateDriveway, GateGarages, GateTimeline, SourcesStrip],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('gate.page.title') }}</h1>
      </header>
      <div class="page">
        <app-sources-strip [sources]="sources" domain="gate" loadingLabel="gate.page.loading" />
        <div class="card-row" data-testid="gate-row">
          <app-gate-driveway [read]="gate.value()" [commands]="commands" [refresh]="refreshGate" />
          <app-gate-garages
            [garages]="garages.value()"
            [commands]="commands"
            [refresh]="refreshGarages"
          />
          <app-gate-alerts [alerts]="alerts.value()" [garages]="garages.value()" />
        </div>
        <app-gate-timeline class="timeline" [garages]="garages.value()" />
      </div>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
    }
    .page {
      display: grid;
      justify-items: center;
      gap: 16px;
    }
    .card-row {
      width: 100%;
    }
    .timeline {
      max-width: 1000px;
      width: 100%;
      justify-self: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GatePage {
  private readonly api = inject(GateApi);
  protected readonly gate = this.api.watchGate();
  protected readonly garages = this.api.watchGarages();
  protected readonly alerts = this.api.watchAlerts();

  protected readonly sources: readonly Source[] = [
    { id: 'gate', label: 'gate.page.sources.gate' as MessageKey, resource: this.gate },
    { id: 'garages', label: 'gate.page.sources.garages' as MessageKey, resource: this.garages },
    { id: 'alerts', label: 'gate.page.sources.alerts' as MessageKey, resource: this.alerts },
  ];

  /** One press per gate at a time: the driveway gate by its name, a garage gate by its id. */
  protected readonly commands = new DeviceCommands<string | number>();
  protected readonly refreshGate = gateReadBack(() => this.gate.refresh());
  // a pulse moves the gate and, with the opening, its alarms
  protected readonly refreshGarages = gateReadBack(async () => {
    await Promise.all([this.garages.refresh(), this.alerts.refresh()]);
  });
}
