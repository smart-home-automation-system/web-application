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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';
import { EMPTY, Observable, catchError, tap, throwError } from 'rxjs';

import { toApiError } from '../../core/api/api-error';
import { DeviceCommands } from '../../core/api/device-commands';
import {
  AirconApi,
  AirconRule,
  AirconRuleBody,
  AirconUnit,
} from '../../data-access/aircon/aircon-api';
import {
  HYSTERESIS_DEFAULT,
  RuleProblem,
  ruleProblem,
} from '../../data-access/aircon/aircon-rule-rules';
import { AirconControl } from '../../shared/aircon/aircon-control';
import { RULE_PROBLEM_TEXTS, airconFailureOf } from '../../shared/aircon/aircon-labels';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { AirconRuns } from './aircon-runs';

/** What a card shows besides the unit: nothing open, the rule being edited, a question, the runs. */
type Panel = 'none' | 'rule' | 'removeRule' | 'cleaned' | 'runs';

/** The number a field of the rule form holds - a comma taken as a point; NaN for anything else. */
function numberOf(text: string | null): number {
  return text === null || text.trim() === '' ? Number.NaN : Number(text.replace(',', '.'));
}

/**
 * One air conditioner on the page of the units (HAS-395): the unit with its controls (`AirconControl`, the
 * card of My room), its filter - the hours since its cleaning and "Cleaned" after a question -, its rule in a
 * few words with the editor (keep the room below a threshold, the frost protection; a copy of `RuleRules`,
 * `PUT` / `DELETE /aircon/{id}/rules`, read back) and its changes of 24 hours. One thing open at a time; no
 * write is optimistic - the units or the rules are read again and only that answer moves the card.
 */
@Component({
  selector: 'app-aircon-unit',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    TranslocoDirective,
    AirconControl,
    AirconRuns,
    DisplayTextPipe,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  templateUrl: './aircon-unit.html',
  styleUrl: './aircon-unit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class AirconUnitCard {
  readonly unit = input.required<AirconUnit>();
  /** The rule of the unit; `undefined` while the rules are not known, `null` for a unit without one. */
  readonly rule = input<AirconRule | null | undefined>();
  readonly commands = input.required<DeviceCommands<number>>();
  readonly refresh = input.required<() => Promise<void>>();
  /** The writes of the rules and the filters, one per unit at a time. */
  readonly ruleCommands = input.required<DeviceCommands<number>>();
  readonly filterCommands = input.required<DeviceCommands<number>>();
  readonly refreshRules = input.required<() => Promise<void>>();

  private readonly api = inject(AirconApi);
  private readonly injector = inject(Injector);
  // the safe answer of the question on screen - only one is open at a time
  private readonly safeAnswer = viewChild<string, ElementRef<HTMLElement>>('safeAnswer', {
    read: ElementRef,
  });

  protected readonly panel = signal<Panel>('none');
  protected readonly problem = signal<RuleProblem | undefined>(undefined);
  protected readonly PROBLEM_TEXTS = RULE_PROBLEM_TEXTS;
  protected readonly airconFailureOf = airconFailureOf;
  protected readonly DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  protected readonly HOURS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  protected readonly DEGREES: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

  protected readonly form = new FormGroup({
    keepBelow: new FormControl(false, { nonNullable: true }),
    threshold: new FormControl('25', { nonNullable: true }),
    hysteresis: new FormControl(String(HYSTERESIS_DEFAULT), { nonNullable: true }),
    target: new FormControl('22', { nonNullable: true }),
    heatBySchedule: new FormControl(false, { nonNullable: true }),
  });

  protected readonly id = computed(() => this.unit().id ?? -1);
  protected readonly ruleState = computed(() => this.ruleCommands().stateOf(this.id()));
  protected readonly filterState = computed(() => this.filterCommands().stateOf(this.id()));
  protected readonly busy = computed(
    () => this.ruleState()?.sending === true || this.filterState()?.sending === true,
  );

  constructor() {
    // a question with nothing left to ask goes for good: a rule removed elsewhere takes its question
    effect(() => {
      if (this.panel() === 'removeRule' && this.rule() === null) {
        this.panel.set('none');
      }
    });
  }

  protected toggle(panel: Panel): void {
    this.problem.set(undefined);
    if (panel === 'rule') {
      this.fillForm();
    }
    this.panel.update((open) => (open === panel ? 'none' : panel));
    if (this.panel() === 'cleaned' || this.panel() === 'removeRule') {
      // the button that was pressed is gone with the question: "Cancel", the answer that changes nothing, takes the focus
      afterNextRender(() => this.safeAnswer()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  protected saveRule(): void {
    const value = this.form.getRawValue();
    const body: AirconRuleBody = {
      keepBelow: {
        enabled: value.keepBelow,
        threshold: numberOf(value.threshold),
        hysteresis: numberOf(value.hysteresis),
        target: numberOf(value.target),
      },
      heatBySchedule: { enabled: value.heatBySchedule },
    };
    const problem = ruleProblem(body);
    this.problem.set(problem);
    if (problem !== undefined) {
      return;
    }
    this.write(this.ruleCommands(), this.api.saveRule(this.id(), body), this.refreshRules());
  }

  protected removeRule(): void {
    // a rule already gone counts as removed
    const removal = this.api
      .deleteRule(this.id())
      .pipe(
        catchError((failure: unknown) =>
          toApiError(failure).hasCode('NOT_FOUND_RULE') ? EMPTY : throwError(() => failure),
        ),
      );
    this.write(this.ruleCommands(), removal, this.refreshRules());
  }

  protected cleaned(): void {
    this.write(this.filterCommands(), this.api.filterCleaned(this.id()), this.refresh());
  }

  /**
   * Sends a write, then reads back what it changed whatever it came to; the form or the question closes only
   * after a write that was taken - a refused one keeps what was typed, next to the reason.
   */
  private write(
    commands: DeviceCommands<number>,
    call: Observable<void>,
    readBack: () => Promise<void>,
  ): void {
    let taken = false;
    commands.send(this.id(), call.pipe(tap({ complete: () => (taken = true) })), async () => {
      await readBack();
      if (taken) {
        this.panel.set('none');
      }
    });
  }

  /** The form starts from the rule as stored, or from the defaults of a new one. */
  private fillForm(): void {
    const rule = this.rule();
    this.form.setValue({
      keepBelow: rule?.keepBelow?.enabled ?? false,
      threshold: String(rule?.keepBelow?.threshold ?? 25),
      hysteresis: String(rule?.keepBelow?.hysteresis ?? HYSTERESIS_DEFAULT),
      target: String(rule?.keepBelow?.target ?? 22),
      heatBySchedule: rule?.heatBySchedule?.enabled ?? false,
    });
  }
}
