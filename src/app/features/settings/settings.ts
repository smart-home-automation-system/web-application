import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { BackgroundStore } from '../../core/background/background-store';
import { SEASONS, Season } from '../../core/theme/season';
import { SchemeChoice, SeasonChoice, ThemeStore } from '../../core/theme/theme-store';
import { MessageKey } from '../../i18n/messages';

interface SchemeOption {
  readonly value: SchemeChoice;
  readonly label: MessageKey;
  /** Name of a Material Symbols icon. */
  readonly icon: string;
}

const SCHEME_OPTIONS: readonly SchemeOption[] = [
  { value: 'system', label: 'settings.appearance.schemeSystem', icon: 'brightness_auto' },
  { value: 'light', label: 'settings.appearance.schemeLight', icon: 'light_mode' },
  { value: 'dark', label: 'settings.appearance.schemeDark', icon: 'dark_mode' },
];

const SEASON_LABELS: Readonly<Record<Season, MessageKey>> = {
  spring: 'season.spring',
  summer: 'season.summer',
  autumn: 'season.autumn',
  winter: 'season.winter',
};

/**
 * Settings of this browser. So far the appearance: the colours follow the season and the system
 * by themselves, and this page lets somebody look at the other variants; the photos behind the
 * views can be switched off here for a slow device.
 *
 * The administrator's page (its route says nothing about access, which means exactly that); it
 * changes only the browser it is opened in.
 */
@Component({
  selector: 'app-settings',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatRadioModule,
    MatSlideToggleModule,
    TranslocoDirective,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly theme = inject(ThemeStore);
  protected readonly background = inject(BackgroundStore);
  protected readonly schemeOptions = SCHEME_OPTIONS;
  protected readonly seasons = SEASONS;
  protected readonly seasonLabels = SEASON_LABELS;
  protected readonly chartSeries = [1, 2, 3, 4, 5];
  /** The domains of the house with a colour of their own, in the order of the palette card. */
  protected readonly domains: readonly { name: string; label: MessageKey }[] = [
    { name: 'heating', label: 'domain.heating' },
    { name: 'water', label: 'domain.water' },
    { name: 'boiler', label: 'domain.boiler' },
    { name: 'household', label: 'domain.household' },
  ];

  protected chooseScheme(choice: SchemeChoice): void {
    this.theme.chooseScheme(choice);
  }

  protected chooseSeason(choice: SeasonChoice): void {
    this.theme.chooseSeason(choice);
  }
}
