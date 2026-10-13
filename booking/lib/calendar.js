// Server-side access to the salon calendar over CalDAV. Only this module sees the login,
// and only busy start/end times ever leave it (never titles, names or notes).

import { createDAVClient } from 'tsdav';
import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { buildEvent } from './ics.js';

const CACHE_MS = 60_000;
const cache = new Map();
let clientPromise = null;
let calendarPromise = null;

function getClient() {
  if (!clientPromise) {
    const username = process.env.CALDAV_USERNAME;
    const password = process.env.CALDAV_PASSWORD;
    if (!username || !password) throw new Error('CALDAV_USERNAME / CALDAV_PASSWORD are not set');
    clientPromise = createDAVClient({
      serverUrl: process.env.CALDAV_URL || 'https://caldav.calendar.yahoo.com',
      credentials: { username, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    }).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

async function getCalendar() {
  if (!calendarPromise) {
    calendarPromise = (async () => {
      const client = await getClient();
      const calendars = await client.fetchCalendars();
      const wanted = process.env.CALENDAR_NAME;
      const withEvents = calendars.filter((c) => !c.components || c.components.includes('VEVENT'));
      const calendar = wanted
        ? calendars.find((c) => String(c.displayName || '').trim() === wanted.trim())
        : withEvents[0];
      if (!calendar) throw new Error(wanted ? `Calendar "${wanted}" not found` : 'No event calendar found');
      return { client, calendar };
    })().catch((err) => {
      calendarPromise = null;
      throw err;
    });
  }
  return calendarPromise;
}

// Dates with no time zone (all-day or "floating") are read in the salon's time zone.
function toDate(time, timezone) {
  const floating = time.isDate || !time.zone || time.zone === ICAL.Timezone.localTimezone;
  if (!floating) return time.toJSDate();
  return DateTime.fromObject(
    { year: time.year, month: time.month, day: time.day, hour: time.hour || 0, minute: time.minute || 0, second: time.second || 0 },
    { zone: timezone },
  ).toJSDate();
}

function blocksTime(component) {
  const status = String(component.getFirstPropertyValue('status') || '').toUpperCase();
  const transp = String(component.getFirstPropertyValue('transp') || '').toUpperCase();
  return status !== 'CANCELLED' && transp !== 'TRANSPARENT';
}

// Turns raw .ics documents into busy intervals overlapping [rangeStart, rangeEnd),
// expanding recurring events and honouring edited or cancelled occurrences.
export function parseBusy(icsDocuments, rangeStart, rangeEnd, timezone) {
  const busy = [];
  const add = (start, end) => {
    if (end > rangeStart && start < rangeEnd) busy.push({ start, end });
  };

  for (const data of icsDocuments) {
    let root;
    try {
      root = new ICAL.Component(ICAL.parse(data));
    } catch {
      continue; // skip anything the parser can't read rather than failing the whole day
    }
    for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

    const vevents = root.getAllSubcomponents('vevent');
    const overrides = vevents.filter((v) => v.hasProperty('recurrence-id'));
    for (const master of vevents.filter((v) => !v.hasProperty('recurrence-id'))) {
      const event = new ICAL.Event(master);
      for (const o of overrides) {
        if (o.getFirstPropertyValue('uid') === event.uid) event.relateException(o);
      }

      if (!event.isRecurring()) {
        if (blocksTime(master) && event.startDate) {
          const start = toDate(event.startDate, timezone);
          const end = event.endDate ? toDate(event.endDate, timezone) : start;
          add(start, end);
        }
        continue;
      }

      const it = event.iterator();
      for (let next = it.next(), guard = 0; next && guard < 5000; next = it.next(), guard++) {
        const details = event.getOccurrenceDetails(next);
        const start = toDate(details.startDate, timezone);
        if (start >= rangeEnd) break;
        if (blocksTime(details.item.component)) add(start, toDate(details.endDate, timezone));
      }
    }
  }
  return busy;
}

export async function getBusy(rangeStart, rangeEnd, timezone, { fresh = false } = {}) {
  const key = `${rangeStart.toISOString()}|${rangeEnd.toISOString()}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.busy;

  const { client, calendar } = await getCalendar();
  const objects = await client.fetchCalendarObjects({
    calendar,
    timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
  });
  const busy = parseBusy(objects.map((o) => o.data).filter(Boolean), rangeStart, rangeEnd, timezone);
  cache.set(key, { at: Date.now(), busy });
  return busy;
}

export async function createAppointment({ start, end, summary, description }) {
  const { client, calendar } = await getCalendar();
  const uid = `${randomUUID()}@hollywood-booking`;
  const res = await client.createCalendarObject({
    calendar,
    filename: `${uid.split('@')[0]}.ics`,
    iCalString: buildEvent({ uid, start, end, summary, description }),
  });
  if (!res.ok) throw new Error(`Calendar refused the appointment (HTTP ${res.status})`);
  cache.clear();
  return uid;
}
