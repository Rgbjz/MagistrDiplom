import { buildIcal, icalDate, icalEscape, icalFold } from './ical';
import { parseCalendarToken, signCalendarToken } from './calendar-token';

describe('iCal writer', () => {
  it('formats UTC dates', () => {
    expect(icalDate(new Date('2026-11-15T09:30:05.123Z'))).toBe(
      '20261115T093005Z',
    );
  });

  it('escapes TEXT values', () => {
    expect(icalEscape('a;b,c\\d\nе')).toBe('a\\;b\\,c\\\\d\\nе');
  });

  it('folds long lines at 75 octets without splitting multi-byte chars', () => {
    const line = 'SUMMARY:' + 'Дедлайн '.repeat(20);
    const folded = icalFold(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, p] of parts.entries()) {
      expect(Buffer.byteLength(p, 'utf8')).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(' ')).toBe(true);
    }
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });

  it('builds a calendar with stable UIDs and CRLF line endings', () => {
    const body = buildIcal(
      'LMS',
      [
        {
          uid: 'assignment-7@lms',
          summary: 'Дедлайн: Звіт, частина 1',
          start: new Date('2026-12-01T10:00:00Z'),
          url: 'http://x/courses/1',
          categories: 'Дедлайн',
        },
        {
          uid: 'event-3@lms',
          summary: 'Лекція',
          start: new Date('2026-12-02T10:00:00Z'),
          end: new Date('2026-12-02T11:30:00Z'),
        },
      ],
      new Date('2026-11-01T00:00:00Z'),
    );
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(body).toContain('UID:assignment-7@lms');
    expect(body).toContain('SUMMARY:Дедлайн: Звіт\\, частина 1');
    expect(body).toContain('DTEND:20261202T113000Z');
    expect(body).toContain('DTSTAMP:20261101T000000Z');
    expect(body.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(
      2,
    );
    expect(body).not.toMatch(/[^\r]\n/);
  });
});

describe('calendar feed token', () => {
  it('round-trips and rejects forgeries / other versions', () => {
    const token = signCalendarToken('s', 42, 3);
    expect(parseCalendarToken('s', token)).toEqual({ userId: 42, version: 3 });
    expect(parseCalendarToken('other', token)).toBeNull();
    expect(parseCalendarToken('s', token.replace('42.', '43.'))).toBeNull();
    expect(parseCalendarToken('s', 'garbage')).toBeNull();
    expect(parseCalendarToken('s', undefined)).toBeNull();
  });
});
