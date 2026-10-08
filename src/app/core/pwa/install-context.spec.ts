import { offersHomeScreen, runsInstalled } from './install-context';

/** A window as the two functions see it: the navigator and the display mode. */
function view(options: { standalone?: boolean; displayMode?: 'standalone' | 'browser' }): Window {
  const navigator = options.standalone === undefined ? {} : { standalone: options.standalone };
  return {
    navigator,
    matchMedia: (query: string) => ({
      matches: query === `(display-mode: ${options.displayMode ?? 'browser'})`,
    }),
  } as unknown as Window;
}

describe('where the application runs', () => {
  it.each([
    ['a tab of Safari on an iPhone', view({ standalone: false }), false, true],
    ['the home screen of an iPhone', view({ standalone: true }), true, false],
    // iOS reports the display mode too; either sign is enough
    [
      'the home screen of an iPhone, by the display mode',
      view({ standalone: false, displayMode: 'standalone' }),
      true,
      false,
    ],
    ['a tab of another browser', view({}), false, false],
    ['a window of its own in another browser', view({ displayMode: 'standalone' }), true, false],
    ['a place without a window', null, false, false],
  ])('%s', (_, where, installed, offered) => {
    expect(runsInstalled(where)).toBe(installed);
    expect(offersHomeScreen(where)).toBe(offered);
  });

  it('copes with a window that cannot be asked for its display mode', () => {
    const bare = { navigator: { standalone: false } } as unknown as Window;

    expect(runsInstalled(bare)).toBe(false);
    expect(offersHomeScreen(bare)).toBe(true);
  });
});
