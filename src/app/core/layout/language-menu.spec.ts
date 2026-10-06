import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';

import { provideI18nTesting } from '../../../testing/i18n';
import { en } from '../../i18n/en';
import { LanguageStore } from '../i18n/language-store';
import { LanguageCode, MESSAGES_LOADER } from '../i18n/languages';
import { LanguageMenu } from './language-menu';

describe('LanguageMenu', () => {
  let fixture: ComponentFixture<LanguageMenu>;
  const snackBar = { open: vi.fn() };

  function create(providers: Provider[] = []): void {
    snackBar.open.mockReset();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: MatSnackBar, useValue: snackBar }, ...providers],
    });
    fixture = TestBed.createComponent(LanguageMenu);
  }

  function trigger(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!;
  }

  /** What a screen reader announces for the button: it has no aria-label, so its content. */
  function accessibleName(): string {
    const button = trigger();
    expect(button.getAttribute('aria-label')).toBeNull();
    const content = button.cloneNode(true) as HTMLElement;
    // icons are hidden from assistive technology
    content.querySelectorAll('mat-icon').forEach((icon) => icon.remove());
    return (content.textContent ?? '').replace(/s+/g, ' ').trim();
  }

  /** Opens the menu and clicks the entry; the menu renders outside the component, in an overlay. */
  async function choose(name: string): Promise<void> {
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();
    const items = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    items.find((item) => item.textContent?.includes(name))!.click();
    await fixture.whenStable();
  }

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((overlay) => overlay.remove());
    localStorage.removeItem('smart-home.language');
    document.documentElement.lang = 'en';
  });

  it('offers every language in its own words and marks the active one', async () => {
    create();
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();

    const items = [...document.querySelectorAll('[role="menuitemradio"]')].map((item) => ({
      name: item.querySelector('span')?.textContent?.trim(),
      lang: item.getAttribute('lang'),
      checked: item.getAttribute('aria-checked'),
    }));

    expect(items).toEqual([
      { name: 'English', lang: 'en', checked: 'true' },
      { name: 'Polski', lang: 'pl', checked: 'false' },
    ]);
  });

  // the visible "EN" has to be part of the name, or voice control cannot find the button and a
  // screen reader never says which language is active
  it('is named by the language on it, followed by what it does', async () => {
    create();
    await fixture.whenStable();

    expect(accessibleName()).toBe('EN Change language');
  });

  it('switches the language when another one is chosen', async () => {
    create();

    await choose('Polski');
    await vi.waitFor(() => expect(TestBed.inject(LanguageStore).language()).toBe('pl'));
    await fixture.whenStable();

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(accessibleName()).toBe('PL Zmień język');
  });

  it('does nothing when the active language is chosen again', async () => {
    create();
    const select = vi.spyOn(TestBed.inject(LanguageStore), 'select');

    await choose('English');

    expect(select).not.toHaveBeenCalled();
  });

  it('says so, in the language still on screen, when the other one cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    create([
      {
        provide: MESSAGES_LOADER,
        useValue: (language: LanguageCode) =>
          language === 'en' ? of(en) : throwError(() => new Error('the chunk is gone')),
      },
    ]);

    await choose('Polski');
    await vi.waitFor(() => expect(snackBar.open).toHaveBeenCalled());

    expect(snackBar.open.mock.calls[0][0]).toBe(en.language.loadFailed);
    expect(TestBed.inject(LanguageStore).language()).toBe('en');
    vi.restoreAllMocks();
  });
});
