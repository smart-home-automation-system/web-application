/** `navigator.standalone` exists in Safari on iOS and iPadOS only - nowhere else, in no state. */
type AppleNavigator = Navigator & { readonly standalone?: boolean };

/**
 * True when the application runs from a home screen, in a window of its own - as opposed to a
 * tab of a browser.
 */
export function runsInstalled(view: Window | null | undefined): boolean {
  if (!view) {
    return false;
  }
  return (
    (view.navigator as AppleNavigator).standalone === true ||
    // absent in the DOM used by unit tests
    view.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/**
 * True in a browser tab of an iPhone or iPad: the one place where the application can be added
 * to the home screen and where nothing offers it - there is no install prompt, only "Add to Home
 * Screen" behind the Share button. Told by the property only Apple's browser engine has - every
 * browser on an iPhone is built on it, Chrome included - on a device with a touch screen, which
 * leaves a Mac out should its Safari carry the property too. The household's phones are iPhones,
 * and a browser that prompts by itself needs no instructions.
 */
export function offersHomeScreen(view: Window | null | undefined): boolean {
  return (
    !!view &&
    'standalone' in view.navigator &&
    view.navigator.maxTouchPoints > 0 &&
    !runsInstalled(view)
  );
}
