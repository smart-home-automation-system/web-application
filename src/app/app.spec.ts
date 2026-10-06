import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideI18nTesting, useLanguage } from '../testing/i18n';
import { routes } from './app.routes';
import { AppTitleStrategy } from './core/layout/app-title-strategy';

describe('application routing', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  function page(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  function navigationLabels(): { side: (string | undefined)[]; bottom: (string | undefined)[] } {
    return {
      side: [...page().querySelectorAll('.shell__side-nav a')].map((a) =>
        a.querySelector('.mat-mdc-list-item-title')?.textContent?.trim(),
      ),
      bottom: [...page().querySelectorAll('.shell__bottom-nav a')].map((a) =>
        a.querySelector('.shell__bottom-label')?.textContent?.trim(),
      ),
    };
  }

  /** Language changes reach the screen and the title through effects: let them run. */
  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    TestBed.tick();
  }

  it('opens the overview at the root address, inside the shell', async () => {
    await harness.navigateByUrl('/');
    // the overview starts polling a moment after it is created
    const http = TestBed.inject(HttpTestingController);
    (await vi.waitFor(() => http.expectOne('/home/heating'))).flush({ isHeatingEnabled: false });

    expect(page().querySelector('.shell__toolbar')?.textContent).toContain('Smart Home');
    expect(page().querySelector('h1')?.textContent).toContain('Overview');
  });

  it('lists every destination in both navigations', async () => {
    await harness.navigateByUrl('/about');

    expect(navigationLabels()).toEqual({
      side: ['Overview', 'About'],
      bottom: ['Overview', 'About'],
    });
  });

  it('marks the current destination', async () => {
    await harness.navigateByUrl('/about');
    harness.detectChanges();

    const current = [...page().querySelectorAll('[aria-current="page"]')].map((a) =>
      a.getAttribute('href'),
    );

    expect(current).toEqual(['/about', '/about']);
  });

  it('moves the focus to the content from the skip link, without leaving the page', async () => {
    await harness.navigateByUrl('/about');
    const link = page().querySelector<HTMLAnchorElement>('.shell__skip-link')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    link.dispatchEvent(click);

    // not prevented, the browser would resolve "#main-content" against <base href="/">
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(page().querySelector('main'));
  });

  it('shows the not-found page for an unknown address', async () => {
    await harness.navigateByUrl('/no/such/page');

    expect(page().querySelector('h1')?.textContent).toContain('Page not found');
  });

  it('shows the running version on the about page', async () => {
    await harness.navigateByUrl('/about');

    expect(page().querySelector('[data-testid="app-version"]')?.textContent).toBe('0.0.0-dev');
  });

  it('names the page in the browser tab', async () => {
    await harness.navigateByUrl('/about');
    await settle();

    expect(TestBed.inject(Title).getTitle()).toBe('About · Smart Home');
  });

  describe('in Polish', () => {
    it('switches the open page without loading it again', async () => {
      await harness.navigateByUrl('/about');
      const shell = page();
      const content = page().querySelector('app-about');

      await useLanguage('pl');
      await settle();

      // the same elements, new words: nothing was navigated or re-created
      expect(page()).toBe(shell);
      expect(page().querySelector('app-about')).toBe(content);
      expect(page().querySelector('h1')?.textContent).toContain('O aplikacji');
      expect(navigationLabels()).toEqual({
        side: ['Przegląd', 'O aplikacji'],
        bottom: ['Przegląd', 'O aplikacji'],
      });
      expect(page().querySelector('[data-testid="app-built"]')?.textContent).toContain(
        'build lokalny',
      );
    });

    it('renames the browser tab', async () => {
      await harness.navigateByUrl('/about');

      await useLanguage('pl');
      await settle();

      expect(TestBed.inject(Title).getTitle()).toBe('O aplikacji · Smart Home');
    });

    it('translates the labels a screen reader announces', async () => {
      await harness.navigateByUrl('/about');

      await useLanguage('pl');
      await settle();

      expect(page().querySelector('.shell__side-nav')?.getAttribute('aria-label')).toBe(
        'Nawigacja główna',
      );
      expect(page().querySelector('.shell__skip-link')?.textContent?.trim()).toBe(
        'Przejdź do treści',
      );
      expect(page().querySelector('.language-menu__trigger')?.textContent).toContain('Zmień język');
    });

    it('shows the not-found page in Polish', async () => {
      await useLanguage('pl');

      await harness.navigateByUrl('/no/such/page');

      expect(page().querySelector('h1')?.textContent).toContain('Nie znaleziono strony');
      expect(page().querySelector('a[matButton]')?.textContent).toContain('Przejdź do przeglądu');
    });
  });

  describe('language menu', () => {
    it('shows the active language on its button and keeps the product name untranslated', async () => {
      await harness.navigateByUrl('/about');

      expect(page().querySelector('.language-menu__trigger')?.textContent).toContain('EN');

      await useLanguage('pl');
      await settle();

      expect(page().querySelector('.language-menu__trigger')?.textContent).toContain('PL');
      expect(page().querySelector('.shell__brand')?.textContent).toContain('Smart Home');
    });
  });
});
