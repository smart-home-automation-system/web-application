import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { SafetyStatusStore, SafetyStore } from '../../data-access/safety/safety-store';
import { MessageKey } from '../../i18n/messages';
import { describeSafetyError } from '../../shared/safety/safety-labels';
import { Source, SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { SafetyAlarms } from './safety-alarms';
import { SafetyAutomation } from './safety-automation';
import { SafetyBase } from './safety-base';
import { SafetyDetectors } from './safety-detectors';
import { SafetyRuns } from './safety-runs';

/**
 * The safety page (HAS-469, the administrator's; route `/safety` after the air conditioning): the fire detectors of
 * `safety-service` by floor and room with their mute and self test, the base station, the alarms of 7 or 30 days and
 * the switches of the reactions to an alarm with what they sent. The detectors are the resource of the whole
 * application (`SafetyStore`, shared with the banner, the tile and My room) and the technical monitor that of the
 * administrator (`SafetyStatusStore`, shared with the banner) - both told once in the strip of sources; the switches,
 * the alarms and the reactions have a call each, told on their card.
 */
@Component({
  selector: 'app-safety-page',
  imports: [
    TranslocoDirective,
    SafetyAlarms,
    SafetyAutomation,
    SafetyBase,
    SafetyDetectors,
    SafetyRuns,
    SourcesStrip,
  ],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('safety.page.title') }}</h1>
      </header>
      <div class="page">
        <app-sources-strip
          [sources]="sources"
          domain="safety"
          loadingLabel="safety.page.loading"
          [describeWith]="describeError"
        />
        <!-- the first row (owner, the preview of HAS-469): the base, the switches of the reactions, the alarms and the
             reactions sent - the cards that matter most, of different widths, the alarms the widest -->
        <div class="top" data-testid="safety-row">
          <app-safety-base class="top__base" [status]="status.value()" [read]="safety.value()" />
          <app-safety-automation class="top__automation" />
          <app-safety-alarms class="top__alarms" data-testid="safety-history" />
          <app-safety-runs class="top__runs" />
        </div>
        <app-safety-detectors class="detectors" [read]="safety.value()" />
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
    .top,
    .detectors {
      width: 100%;
    }
    .detectors {
      max-width: 1400px;
      display: grid;
      gap: 16px;
    }
    /* one column on a phone, two by two in a window, the four side by side on a wide screen - the alarms the widest */
    .page {
      container-type: inline-size;
    }
    .top {
      max-width: 1800px;
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
    }
    .top > * {
      min-width: 0;
    }
    @container (min-width: 760px) {
      .top {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    @container (min-width: 1500px) {
      .top {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1.3fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyPage {
  protected readonly safety = inject(SafetyStore).safety;
  protected readonly status = inject(SafetyStatusStore).status;
  protected readonly describeError = describeSafetyError;

  protected readonly sources: readonly Source[] = [
    {
      id: 'detectors',
      label: 'safety.page.sources.detectors' as MessageKey,
      resource: this.safety,
    },
    { id: 'status', label: 'safety.page.sources.status' as MessageKey, resource: this.status },
  ];
}
