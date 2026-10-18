/** Convert an explicit IANA wall time, rejecting DST gaps and ambiguous times. */
export function wallTimeToInstant(local: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error('Choose a complete local date and time.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const wall = Date.parse(`${local}:00Z`);
  const matches = new Set<number>();
  // All currently used civil offsets are multiples of 15 minutes.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = wall - offset * 60000;
    const p = Object.fromEntries(
      parts.formatToParts(candidate).map((x) => [x.type, x.value]),
    );
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === local)
      matches.add(candidate);
  }
  if (matches.size !== 1)
    throw new Error(
      matches.size === 0
        ? 'That local time does not exist. Choose another time.'
        : 'That local time occurs twice. Choose a time outside the clock change.',
    );
  return new Date([...matches][0]!).toISOString();
}
export function instantToWall(
  instant: string | null,
  timezone: string,
): string {
  if (!instant) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((x) => [x.type, x.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
