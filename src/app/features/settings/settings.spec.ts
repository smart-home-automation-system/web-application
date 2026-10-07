import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ThemeStore } from '../../core/theme/theme-store';
import { Settings } from './settings';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  let theme: ThemeStore;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    localStorage.removeItem('smart-home.theme');
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    theme = TestBed.inject(ThemeStore);
    fixture = TestBed.createComponent(Settings);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('smart-home.theme');
    document.documentElement.removeAttribute('data-season');
    document.documentElement.removeAttribute('data-color-scheme');
  });

  const element = () => fixture.nativeElement as HTMLElement;

  function radio(label: string): HTMLInputElement {
    const button = [...element().querySelectorAll('mat-radio-button')].find((candidate) =>
      candidate.textContent?.includes(label),
    );
    return button!.querySelector('input')!;
  }

  function toggle(label: string): HTMLButtonElement {
    const button = [...element().querySelectorAll('mat-button-toggle')].find((candidate) =>
      candidate.textContent?.includes(label),
    );
    return button!.querySelector('button')!;
  }

  function resetButton(): HTMLButtonElement {
    return element().querySelector<HTMLButtonElement>('mat-card-actions button')!;
  }

  it('starts on automatic and says which season the calendar gives', async () => {
    await fixture.whenStable();

    expect(radio('Automatic').checked).toBe(true);
    expect(element().textContent).toContain('By the calendar, now: Autumn');
    expect(resetButton().disabled).toBe(true);
  });

  it('offers the four seasons in calendar order', async () => {
    await fixture.whenStable();

    const labels = [...element().querySelectorAll('mat-radio-button')].map((button) =>
      button.textContent?.trim(),
    );

    expect(labels).toEqual([
      'Automatic By the calendar, now: Autumn',
      'Spring',
      'Summer',
      'Autumn',
      'Winter',
    ]);
  });

  it('previews the season that is picked', async () => {
    await fixture.whenStable();

    radio('Winter').click();
    await fixture.whenStable();

    expect(theme.season()).toBe('winter');
    expect(document.documentElement.getAttribute('data-season')).toBe('winter');
    // the calendar is still named, so the way back is clear
    expect(element().textContent).toContain('By the calendar, now: Autumn');
  });

  it('switches the colour scheme', async () => {
    await fixture.whenStable();

    toggle('Dark').click();
    await fixture.whenStable();

    expect(theme.schemeChoice()).toBe('dark');
    expect(toggle('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it('goes back to automatic with the reset button', async () => {
    theme.chooseSeason('spring');
    theme.chooseScheme('dark');
    await fixture.whenStable();
    expect(resetButton().disabled).toBe(false);

    resetButton().click();
    await fixture.whenStable();

    expect(theme.overridden()).toBe(false);
    expect(radio('Automatic').checked).toBe(true);
    expect(resetButton().disabled).toBe(true);
  });

  it('names its two groups of controls for a screen reader', async () => {
    await fixture.whenStable();

    for (const group of ['mat-button-toggle-group', 'mat-radio-group']) {
      const label = element().querySelector(group)!.getAttribute('aria-labelledby')!;

      expect(element().querySelector(`#${label}`)?.textContent?.trim()).not.toBe('');
    }
  });

  it('speaks Polish, the season inside the sentence included', async () => {
    await useLanguage('pl');
    await fixture.whenStable();

    expect(element().textContent).toContain('Według kalendarza, teraz: Jesień');
    expect(element().textContent).toContain('Ciemny');
  });
});
