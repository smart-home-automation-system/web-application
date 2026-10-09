/**
 * The personal link of a member: the address that opens their profile, and the one the
 * application is added to the Home Screen from. `origin` is the address this application is
 * served at, read from the browser - it is private infrastructure and appears nowhere in this
 * repository.
 */
export function memberLink(origin: string, name: string): string {
  return `${origin}/u/${encodeURIComponent(name)}`;
}
