/**
 * Minimal RFC 5545 (iCalendar) writer for the personal calendar feed.
 * Times are written in UTC ("…Z"), so no VTIMEZONE block is needed.
 */

export interface IcalEvent {
  /** Stable across feed refreshes so calendar apps update instead of duplicating. */
  uid: string;
  summary: string;
  description?: string | null;
  url?: string | null;
  start: Date;
  /** Omitted → a point in time (deadline). */
  end?: Date | null;
  categories?: string;
}

/** 20261115T093000Z */
export function icalDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Escapes TEXT values: backslash, semicolon, comma, newlines. */
export function icalEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a content line at 75 octets (UTF-8), continuation lines start with a
 * space; never splits a multi-byte character.
 */
export function icalFold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildIcal(
  calendarName: string,
  events: IcalEvent[],
  now = new Date(),
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LMS//Calendar//UK',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalEscape(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Kyiv',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = icalDate(now);
  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icalDate(e.start)}`);
    if (e.end) lines.push(`DTEND:${icalDate(e.end)}`);
    lines.push(`SUMMARY:${icalEscape(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icalEscape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.categories) lines.push(`CATEGORIES:${icalEscape(e.categories)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icalFold).join('\r\n') + '\r\n';
}
