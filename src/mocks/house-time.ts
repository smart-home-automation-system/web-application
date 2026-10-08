/**
 * A `LocalDateTime` of the house, some seconds ago: the wall clock of Europe/Warsaw, without an
 * offset, as the backend prints it. A fixture with a time the page shows as an *age* is worked
 * out with it when the answer is asked for - a fixed time would read as a service that stopped
 * reporting.
 */
export function houseTime(now: Date, secondsAgo: number): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(now.getTime() - secondsAgo * 1_000));
  // "2026-10-08 11:02:41" -> "2026-10-08T11:02:41.596721"
  return `${parts.replace(' ', 'T')}.596721`;
}
