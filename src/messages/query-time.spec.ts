import { queryTime } from './query-time';

test('renders the same instant with client offset, DST, and UTC fallback', () => {
  const date = new Date('2026-09-12T02:30:00.123Z');
  expect(queryTime(date, 'Asia/Shanghai')).toBe(
    '2026-09-12T10:30:00.123+08:00',
  );
  expect(queryTime(date, 'Asia/Kathmandu')).toBe(
    '2026-09-12T08:15:00.123+05:45',
  );
  expect(queryTime(date, 'America/New_York')).toBe(
    '2026-09-11T22:30:00.123-04:00',
  );
  expect(queryTime(new Date('2026-01-12T02:30:00Z'), 'America/New_York')).toBe(
    '2026-01-11T21:30:00.000-05:00',
  );
  for (const zone of [undefined, '', 'not-a-zone', 'UTC']) {
    expect(queryTime(date, zone)).toBe(date.toISOString());
  }
});
