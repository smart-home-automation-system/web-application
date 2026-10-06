import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';

describe('application routing', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    harness = await RouterTestingHarness.create();
  });

  function page(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
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

    const side = [...page().querySelectorAll('.shell__side-nav a')].map((a) =>
      a.querySelector('.mat-mdc-list-item-title')?.textContent?.trim(),
    );
    const bottom = [...page().querySelectorAll('.shell__bottom-nav a')].map((a) =>
      a.querySelector('.shell__bottom-label')?.textContent?.trim(),
    );

    expect(side).toEqual(['Overview', 'About']);
    expect(bottom).toEqual(['Overview', 'About']);
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
});
