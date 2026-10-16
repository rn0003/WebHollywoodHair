// Lists the calendar names on the CalDAV account in .env.local (names only, nothing else).
// Run from the booking folder:  node --env-file=.env.local scripts/list-calendars.mjs
import { createDAVClient } from 'tsdav';

const client = await createDAVClient({
  serverUrl: process.env.CALDAV_URL || 'https://caldav.calendar.yahoo.com',
  credentials: { username: process.env.CALDAV_USERNAME, password: process.env.CALDAV_PASSWORD },
  authMethod: 'Basic',
  defaultAccountType: 'caldav',
});
const calendars = await client.fetchCalendars();
for (const c of calendars) {
  const kinds = c.components ? ` (${c.components.join(', ')})` : '';
  console.log(`- ${JSON.stringify(c.displayName ?? '')}${kinds}`);
}
