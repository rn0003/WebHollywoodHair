import { DateTime } from 'luxon';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// True when `date` (YYYY-MM-DD, salon local) is today or within the booking horizon.
export function isDateInRange(date, cfg, now = new Date()) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false;
  const day = DateTime.fromISO(date, { zone: cfg.timezone });
  if (!day.isValid) return false;
  const today = DateTime.fromJSDate(now, { zone: cfg.timezone }).startOf('day');
  return day >= today && day <= today.plus({ days: cfg.horizonDays });
}

// Start/end of a salon-local day as JS Dates, for querying the calendar.
export function dayRange(date, cfg) {
  const day = DateTime.fromISO(date, { zone: cfg.timezone }).startOf('day');
  return { start: day.toJSDate(), end: day.plus({ days: 1 }).toJSDate() };
}

function openingHours(day, cfg) {
  const hrs = cfg.hours[day.weekday];
  if (!hrs) return null;
  const at = (hhmm) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return day.set({ hour, minute, second: 0, millisecond: 0 });
  };
  return { open: at(hrs[0]), close: at(hrs[1]) };
}

// Every start time on `date` for a service of `minutes`, each marked available or not.
// `busy` is a list of { start: Date, end: Date } taken from the calendar.
export function computeSlots({ date, minutes, busy, cfg, now = new Date() }) {
  const day = DateTime.fromISO(date, { zone: cfg.timezone });
  if (!day.isValid) return [];
  const hours = openingHours(day, cfg);
  if (!hours) return [];

  const earliest = now.getTime() + cfg.leadTimeMin * 60_000;
  const buffer = cfg.bufferMin * 60_000;
  const slots = [];
  for (let t = hours.open; t.plus({ minutes }) <= hours.close; t = t.plus({ minutes: cfg.slotStepMin })) {
    const s = t.toMillis();
    const e = s + minutes * 60_000;
    const clash = busy.some((b) => s < b.end.getTime() + buffer && e + buffer > b.start.getTime());
    slots.push({
      start: t.toUTC().toISO({ suppressMilliseconds: true }),
      label: t.toFormat('h:mm a'),
      available: s >= earliest && !clash,
    });
  }
  return slots;
}

// The salon-local date (YYYY-MM-DD) that an ISO start time falls on, or null if unparseable.
export function localDateOf(startIso, cfg) {
  const t = DateTime.fromISO(startIso, { zone: 'utc' });
  return t.isValid ? t.setZone(cfg.timezone).toISODate() : null;
}

// Days to list on the booking page.
export function upcomingDays(cfg, now = new Date()) {
  const today = DateTime.fromJSDate(now, { zone: cfg.timezone }).startOf('day');
  return Array.from({ length: cfg.daysShown }, (_, i) => {
    const d = today.plus({ days: i });
    return { date: d.toISODate(), dow: d.toFormat('ccc'), num: d.toFormat('d'), month: d.toFormat('LLL'), open: !!cfg.hours[d.weekday] };
  });
}

// Opening hours for display, Monday first, with today's row flagged.
export function weeklyHours(cfg, now = new Date()) {
  const today = DateTime.fromJSDate(now, { zone: cfg.timezone }).weekday;
  const fmt = (hhmm) => DateTime.fromFormat(hhmm, 'HH:mm').toFormat('h:mm a');
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return names.map((day, i) => {
    const hrs = cfg.hours[i + 1];
    return { day, time: hrs ? `${fmt(hrs[0])} – ${fmt(hrs[1])}` : 'Closed', today: today === i + 1 };
  });
}
