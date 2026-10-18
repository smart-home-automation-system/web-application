/**
 * The blinds of a room as the owner reads them (2026-10-18): the door first, then the windows -
 * by name, so "window main" comes before "window second". The window of a room and the blinds page.
 */
export function doorsFirst(
  left: { readonly name?: string },
  right: { readonly name?: string },
): number {
  const door = (device: { readonly name?: string }) =>
    /\bdoor\b/i.test(device.name ?? '') ? 0 : 1;
  return door(left) - door(right) || (left.name ?? '').localeCompare(right.name ?? '');
}

/**
 * The name of a device as the window of its room shows it (owner, 2026-10-18): without the room,
 * which the window names, and without the kind, which the section names - "Office door blinds" in
 * the office is "Door". A name that is nothing but those is shown whole.
 */
export function shortName(
  name: string | undefined,
  room: string,
  kind: string,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  const words = (text: string) =>
    text
      .toLowerCase()
      .split(/[\s_]+/)
      .filter(Boolean);
  const roomWords = words(room);
  let rest = name.trim().split(/\s+/);
  if (roomWords.every((word, i) => rest[i]?.toLowerCase() === word)) {
    rest = rest.slice(roomWords.length);
  }
  const kindWords = new Set([...words(kind), kind === 'blinds' ? 'blind' : '']);
  rest = rest.filter((word, i) => !(i === rest.length - 1 && kindWords.has(word.toLowerCase())));
  const short = rest.join(' ');
  return short === '' ? name : short.charAt(0).toUpperCase() + short.slice(1);
}
