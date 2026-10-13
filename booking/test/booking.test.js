import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, isDateInRange, localDateOf } from '../lib/slots.js';
import { parseBusy } from '../lib/calendar.js';
import { buildEvent, escapeText } from '../lib/ics.js';
import { cleanText, validPhone } from '../lib/http.js';

const cfg = {
  timezone: 'America/Los_Angeles',
  slotStepMin: 30,
  bufferMin: 10,
  leadTimeMin: 120,
  horizonDays: 30,
  hours: { 1: ['09:00', '12:00'], 2: ['09:00', '12:00'], 3: null, 4: null, 5: null, 6: null, 7: null },
};
const NOW = new Date('2026-10-11T12:00:00Z'); // Sunday morning in LA

test('slots respect hours, duration and busy time with buffer', () => {
  // Monday 2026-10-12, busy 10:00–10:30 LA = 17:00–17:30Z
  const busy = [{ start: new Date('2026-10-12T17:00:00Z'), end: new Date('2026-10-12T17:30:00Z') }];
  const slots = computeSlots({ date: '2026-10-12', minutes: 60, busy, cfg, now: NOW });
  assert.deepEqual(slots.map((s) => s.label), ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM']);
  assert.deepEqual(slots.map((s) => s.available), [false, false, false, false, true]);
  assert.equal(slots[0].start, '2026-10-12T16:00:00Z');
});

test('closed days and lead time', () => {
  assert.equal(computeSlots({ date: '2026-10-14', minutes: 30, busy: [], cfg, now: NOW }).length, 0);
  const soon = new Date('2026-10-12T16:30:00Z'); // 9:30 LA, earliest bookable 11:30
  const slots = computeSlots({ date: '2026-10-12', minutes: 30, busy: [], cfg, now: soon });
  assert.deepEqual(slots.filter((s) => s.available).map((s) => s.label), ['11:30 AM']);
});

test('date range and local date', () => {
  assert.ok(isDateInRange('2026-10-12', cfg, NOW));
  assert.ok(!isDateInRange('2026-10-10', cfg, NOW));
  assert.ok(!isDateInRange('2027-01-01', cfg, NOW));
  assert.ok(!isDateInRange('12/10/2026', cfg, NOW));
  assert.equal(localDateOf('2026-10-13T02:00:00Z', cfg), '2026-10-12');
  assert.equal(localDateOf('nonsense', cfg), null);
});

test('parseBusy expands recurrence, skips cancelled/free, handles all-day', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:a', 'DTSTART:20261012T170000Z', 'DTEND:20261012T173000Z', 'SUMMARY:Secret client', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART:20261005T180000Z', 'DTEND:20261005T190000Z', 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261012T160000Z', 'DTEND:20261012T163000Z', 'STATUS:CANCELLED', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'DTSTART:20261012T190000Z', 'DTEND:20261012T200000Z', 'TRANSP:TRANSPARENT', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const allDay = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:e', 'DTSTART;VALUE=DATE:20261013', 'DTEND;VALUE=DATE:20261014', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

  const start = new Date('2026-10-12T07:00:00Z');
  const end = new Date('2026-10-13T07:00:00Z');
  const busy = parseBusy([ics, allDay, 'garbage'], start, end, cfg.timezone);
  const iso = busy.map((b) => b.start.toISOString()).sort();
  assert.deepEqual(iso, ['2026-10-12T17:00:00.000Z', '2026-10-12T18:00:00.000Z']);
  assert.ok(busy.every((b) => Object.keys(b).join() === 'start,end'), 'only times leave the parser');

  const nextDay = parseBusy([allDay], end, new Date('2026-10-14T07:00:00Z'), cfg.timezone);
  assert.equal(nextDay[0].start.toISOString(), '2026-10-13T07:00:00.000Z'); // LA midnight
});

test('client text cannot inject calendar properties', () => {
  assert.equal(escapeText('a;b,c\nATTENDEE:x'), 'a\\;b\\,c\\nATTENDEE:x');
  const ics = buildEvent({
    uid: 'u1', start: new Date('2026-10-12T16:00:00Z'), end: new Date('2026-10-12T17:00:00Z'),
    summary: 'Cut – Eve\r\nATTENDEE:mailto:evil@example.com', description: 'x'.repeat(200),
  });
  assert.ok(!/\r\nATTENDEE/.test(ics));
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
});

test('input cleaning', () => {
  assert.equal(cleanText('  Ann\u0000\n  Lee ', 80), 'Ann Lee');
  assert.ok(validPhone('(555) 123-4567'));
  assert.ok(!validPhone('call me'));
  assert.ok(!validPhone('123'));
});
