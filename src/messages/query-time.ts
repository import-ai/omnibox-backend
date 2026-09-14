/** Render a backend timestamp in the sender's zone; old clients use UTC. */
export function queryTime(date: Date, timeZone?: string): string {
  if (!timeZone || timeZone === 'UTC') return date.toISOString();
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    });
  } catch {
    return date.toISOString();
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const offset = parts.timeZoneName.replace('GMT', '') || 'Z';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, '0')}${offset}`;
}
