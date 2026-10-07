import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { BackgroundStore } from '../background/background-store';
import { ViewBackground } from './view-background';

@Component({ template: '' })
class Blank {}

/** The shell, reduced to what matters here: the layer and an outlet for the views. */
@Component({
  imports: [ViewBackground, RouterOutlet],
  template: '<app-view-background /><router-outlet />',
})
class Host {}

describe('ViewBackground', () => {
  let harness: RouterTestingHarness;

  function layer(): HTMLElement {
    return harness.routeNativeElement?.querySelector('app-view-background') as HTMLElement;
  }

  function photos(): string[] {
    return [...layer().querySelectorAll('img')].map((img) => img.dataset['background'] ?? '');
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: Host,
            children: [
              { path: 'overview', component: Blank, data: { background: 'home' } },
              { path: 'about', component: Blank },
              { path: 'odd', component: Blank, data: { background: 'no-such-photo' } },
            ],
          },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('smart-home.background');
  });

  it('shows the photo the open view names, in both sizes for the browser to pick from', async () => {
    await harness.navigateByUrl('/overview');

    expect(photos()).toEqual(['home']);
    expect(layer().querySelector('img')?.getAttribute('srcset')).toBe(
      'backgrounds/home-1280.webp 1280w, backgrounds/home-2560.webp 2560w',
    );
    expect(layer().classList.contains('view-background--empty')).toBe(false);
  });

  it('shows nothing on a view without a photo, and nothing for a name it does not know', async () => {
    await harness.navigateByUrl('/about');
    expect(photos()).toEqual([]);
    expect(layer().classList.contains('view-background--empty')).toBe(true);

    await harness.navigateByUrl('/odd');
    expect(photos()).toEqual([]);
  });

  it('takes the photo away when a view without one opens, and brings it back', async () => {
    await harness.navigateByUrl('/overview');
    await harness.navigateByUrl('/about');
    expect(photos()).toEqual([]);

    await harness.navigateByUrl('/overview');
    expect(photos()).toEqual(['home']);
  });

  it('follows the switch of the settings', async () => {
    await harness.navigateByUrl('/overview');
    const store = TestBed.inject(BackgroundStore);

    store.showPhotos(false);
    harness.detectChanges();
    expect(photos()).toEqual([]);

    store.showPhotos(true);
    harness.detectChanges();
    expect(photos()).toEqual(['home']);
  });
});
