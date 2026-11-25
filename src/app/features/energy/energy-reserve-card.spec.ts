import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { FakeResource, answer, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { BatteryReserve, EnergyApi } from '../../data-access/energy/energy-api';
import { EnergyReserveCard } from './energy-reserve-card';

// 2026-11-24 23:09 of the house (CET)
const NOW = new Date('2026-11-24T22:09:30Z');

// the battery reserve card (HAS-496): the state the service says, switching on and raising the level asked first,
// the rest sent at once, the form checked against a copy of ReserveRules, the reserve read back after every write
describe('EnergyReserveCard', () => {
  let reserve: FakeResource<BatteryReserve | null>;
  let saveReserve: ReturnType<typeof vi.fn>;
  let refreshed: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let fixture: ComponentFixture<EnergyReserveCard>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    reserve = fakeResource();
    refreshed = vi.fn<() => Promise<void>>(() => Promise.resolve());
    reserve = { ...reserve, refresh: refreshed };
    saveReserve = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: EnergyApi, useValue: { saveReserve } },
      ],
    });
    fixture = TestBed.createComponent(EnergyReserveCard);
    fixture.componentRef.setInput('reserve', reserve);
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.useRealTimers();
  });

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const byId = (id: string) => page().querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const inWindow = async (id: string) => {
    await fixture.whenStable();
    return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  };

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function setLevel(value: number): void {
    const thumb = byId('reserve-level') as HTMLInputElement;
    thumb.value = String(value);
    thumb.dispatchEvent(new Event('input'));
    thumb.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  async function switchOn(): Promise<void> {
    (byId('reserve-switch').querySelector('button') as HTMLButtonElement).click();
    await settle();
  }

  it('tells a reserve that holds, until when and what became of its write', async () => {
    answer(reserve, {
      enabled: true,
      level: 80,
      until: '2026-11-25T18:00:00',
      writeState: 'sent',
      writeAttemptedAt: '2026-11-24T23:09:19',
    });
    await settle();

    expect(words(byId('reserve-state'))).toBe('Held at 80 % until 25 Nov 2026, 18:00');
    expect(words(byId('reserve-write'))).toBe('sent to the inverter · 24 Nov 2026, 23:09');
    // the SolaX cloud never takes the floor: set by hand (2026-11-24)
    expect(words(byId('reserve-floor-note'))).toContain('set Min SoC to 80 %');
  });

  it('tells a reserve switched off and never written, and a state it does not know as it came', async () => {
    answer(reserve, { enabled: false, level: 80, writeState: 'lost' });
    await settle();

    expect(words(byId('reserve-state'))).toBe('Switched off');
    expect(words(byId('reserve-write'))).toBe('lost');
    expect(byId('reserve-floor-note')).toBeNull();
  });

  it('switches the reserve on only once the question is answered yes', async () => {
    answer(reserve, { enabled: false, level: 80, writeState: 'none' });
    await settle();

    await switchOn();
    byId('reserve-end-tomorrow').click();
    await settle();
    byId('reserve-send').click();
    await settle();

    expect(saveReserve).not.toHaveBeenCalled();
    expect(words(await inWindow('reserve-question'))).toContain('Hold 80 % of the battery?');
    expect((await inWindow('confirm-cancel'))!.hasAttribute('cdkfocusinitial')).toBe(true);

    (await inWindow('confirm-yes'))!.click();
    await settle();
    expect(saveReserve).toHaveBeenCalledWith({
      enabled: true,
      level: 80,
      until: '2026-11-25T18:00:00',
    });
    expect(refreshed).toHaveBeenCalled();
  });

  it('sends nothing when the question is answered no', async () => {
    answer(reserve, { enabled: false, level: 80, writeState: 'none' });
    await settle();

    await switchOn();
    byId('reserve-send').click();
    await settle();
    (await inWindow('confirm-cancel'))!.click();
    await settle();

    expect(saveReserve).not.toHaveBeenCalled();
  });

  // the rule of the question: it goes for good once the state it was asked in is gone
  it('closes the question once the reserve holds already at the level asked', async () => {
    answer(reserve, { enabled: false, level: 80, writeState: 'none' });
    await settle();
    await switchOn();
    byId('reserve-send').click();
    await settle();
    expect(await inWindow('reserve-question')).not.toBeNull();

    answer(reserve, { enabled: true, level: 80, writeState: 'sent' });
    await settle();

    expect(await inWindow('reserve-question')).toBeNull();
    expect(saveReserve).not.toHaveBeenCalled();
  });

  it('sends a lower level and the switch off at once', async () => {
    answer(reserve, { enabled: true, level: 80, writeState: 'taken' });
    await settle();

    setLevel(60);
    byId('reserve-send').click();
    await settle();
    expect(await inWindow('reserve-question')).toBeNull();
    expect(saveReserve).toHaveBeenCalledWith({ enabled: true, level: 60 });

    answer(reserve, { enabled: true, level: 60, writeState: 'sent' });
    await settle();
    await switchOn();
    byId('reserve-send').click();
    await settle();
    expect(saveReserve).toHaveBeenLastCalledWith({ enabled: false, level: 60 });
  });

  it('refuses an end more than seven days ahead before anything is sent', async () => {
    answer(reserve, { enabled: true, level: 80, writeState: 'taken' });
    await settle();

    byId('reserve-end-date').click();
    await settle();
    const date = byId('reserve-date') as HTMLInputElement;
    date.value = '2026-12-05T18:00';
    date.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byId('reserve-send').click();
    await settle();

    expect(words(byId('reserve-problem'))).toBe('The reserve can be set at most 7 days ahead.');
    expect(saveReserve).not.toHaveBeenCalled();
  });

  it('tells a write the service refused, in its own words, and keeps the form', async () => {
    saveReserve.mockReturnValue(
      throwError(() => new ApiError('client', 400, [{ code: 'INVALID_RESERVE', message: 'bad' }])),
    );
    answer(reserve, { enabled: true, level: 80, writeState: 'taken' });
    await settle();

    setLevel(60);
    byId('reserve-send').click();
    await settle();

    expect(words(page())).toContain('The reserve could not be written.');
    expect(words(page())).toContain(
      'The energy service refused the level or the end of the reserve.',
    );
    expect(words(byId('reserve-level-value'))).toBe('60 %');
  });
});
