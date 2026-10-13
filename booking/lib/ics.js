// Builds the iCalendar text for a new appointment. Client input is escaped so it can never
// add or change calendar properties (no newline / semicolon / comma injection).

export function escapeText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Folds lines longer than 75 octets, as RFC 5545 requires.
export function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildEvent({ uid, start, end, summary, description, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hollywood Hair Salon//Online Booking//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
