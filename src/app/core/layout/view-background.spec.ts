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

const SHOWN = 'view-background__photo--shown';

describe('ViewBackground', () => {
  let harness: RouterTestingHarness;

  function layer(): HTMLElement {
    return harness.routeNativeElement?.querySelector('app-view-background') as HTMLElement;
  }

  function photos(): HTMLImageElement[] {
    return [...layer().querySelectorAll('img')];
  }

  function names(): string[] {
    return photos().map((img) => img.dataset['background'] ?? '');
  }

  /** The file of the photo has arrived in the browser. */
  function arrives(img: HTMLImageElement): void {
    img.dispatchEvent(new Event('load'));
    harness.detectChanges();
  }

  /** The fade of the photo has ended. */
  function fadeEnds(img: HTMLImageElement): void {
    img.dispatchEvent(new Event('transitionend'));
    harness.detectChanges();
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

  it('shows the photo the open view names once its file has arrived', async () => {
    await harness.navigateByUrl('/overview');

    expect(names()).toEqual(['home']);
    const [photo] = photos();
    expect(photo.getAttribute('srcset')).toBe(
      'backgrounds/home-1280.webp 1280w, backgrounds/home-2560.webp 2560w',
    );
    // transparent until the file is in: a fade that starts on insertion ends before a slow link
    // has delivered the picture
    expect(photo.classList.contains(SHOWN)).toBe(false);
    arrives(photo);
    expect(photo.classList.contains(SHOWN)).toBe(true);
    expect(layer().classList.contains('view-background--empty')).toBe(false);
  });

  it('shows nothing on a view without a photo, and nothing for a name it does not know', async () => {
    await harness.navigateByUrl('/about');
    expect(names()).toEqual([]);
    expect(layer().classList.contains('view-background--empty')).toBe(true);

    await harness.navigateByUrl('/odd');
    expect(names()).toEqual([]);
  });

  it('fades the photo out when a view without one opens, and drops it when the fade ends', async () => {
    await harness.navigateByUrl('/overview');
    arrives(photos()[0]);

    await harness.navigateByUrl('/about');
    const [photo] = photos();
    expect(photo.classList.contains(SHOWN)).toBe(false);
    fadeEnds(photo);

    expect(names()).toEqual([]);
  });

  it('keeps the old photo under the new one until the new one has arrived and faded in', async () => {
    await harness.navigateByUrl('/overview');
    const [first] = photos();
    arrives(first);
    // the photo is wanted again while the old one is on its way out: a new layer on top
    await harness.navigateByUrl('/about');
    await harness.navigateByUrl('/overview');
    expect(names()).toEqual(['home', 'home']);
    const second = photos()[1];

    arrives(second);
    expect(names()).toEqual(['home', 'home']);
    fadeEnds(second);

    expect(photos()).toEqual([second]);
    expect(second.classList.contains(SHOWN)).toBe(true);
  });

  it('follows the switch of the settings', async () => {
    await harness.navigateByUrl('/overview');
    arrives(photos()[0]);
    const store = TestBed.inject(BackgroundStore);

    store.showPhotos(false);
    harness.detectChanges();
    fadeEnds(photos()[0]);
    expect(names()).toEqual([]);

    store.showPhotos(true);
    harness.detectChanges();
    expect(names()).toEqual(['home']);
  });
});
