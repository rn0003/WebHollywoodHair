# Hollywood Hair Salon: online booking

The booking page (`public/book.html`) shows open times read live from the salon's Yahoo
calendar and writes confirmed appointments back into it.

## How it stays secure

- **The calendar login never reaches the browser.** It is stored only as server environment
  variables and used by `lib/calendar.js`, through CalDAV.
- **Visitors only see free or busy times.** `/api/availability` returns start times marked available or not.
  Event titles, client names and notes are never sent to the page.
- **The booking is re-checked before it is written.** `/api/book` reads the calendar again (no cache) and
  writes only if the slot is still free. Otherwise the client gets "that time was just taken."
- **Client input is validated and cleaned.** Name, phone and notes are length-limited, stripped of control
  characters and escaped, so the text can't add or change fields in the calendar event.
- **Spam is limited.** Rate limits apply (60 availability checks a minute, 5 bookings per 10 minutes per IP), a hidden
  honeypot field catches bots, `ALLOWED_ORIGINS` rejects bookings sent from other websites, and
  Cloudflare Turnstile can be switched on as an optional "I'm human" check.
- **Strict browser security headers** are set in `vercel.json`: CSP, HSTS, no framing and nosniff.

## Setup

1. **Create a Yahoo app password** for the account that owns the calendar:
   Yahoo Account → Account Security → *Generate app password* (2-step verification must be on).
   Name it "Salon website". Use it only for this site; it can be revoked at any time without
   changing the main password.
2. **Set environment variables** in Vercel (Project → Settings → Environment Variables).
   Mark the password as *Sensitive*:
   - `CALDAV_USERNAME`: the calendar's Yahoo email address
   - `CALDAV_PASSWORD`: the app password from step 1
   - `CALENDAR_NAME`: optional, if the account has more than one calendar
   - `SALON_TIMEZONE`: e.g. `America/Los_Angeles`
   - `ALLOWED_ORIGINS`: e.g. `https://hollywoodhairsalon.com,https://www.hollywoodhairsalon.com`
   - Optional: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (free at dash.cloudflare.com → Turnstile)
3. **Edit `lib/config.js`** with the real opening hours, services, durations, prices and stylists.
4. **Deploy:** `npx vercel` from this folder (or connect the Git repo in Vercel).
5. **Production hardening:** in Vercel → Firewall, add a rate-limit rule for `/api/book`.
   The built-in limiter is per server instance, so it can't stop a determined attacker by itself.

Local testing: copy `.env.example` to `.env.local`, fill it in, then `npm run dev`
(needs the Vercel CLI). Unit tests: `npm test`.

## Notes and limits

- All stylists share one calendar for now. To give each stylist their own availability, add
  one calendar per stylist and map them in `lib/config.js` / `lib/calendar.js`.
- Two people confirming the same slot in the same second could still both get through. The
  re-check makes this very unlikely, but the salon should glance at new online bookings.
- The CalDAV address `https://caldav.calendar.yahoo.com` is Yahoo's documented server. If the first
  real test can't find the calendar, set `CALDAV_URL` to the calendar's full CalDAV URL (from Yahoo
  Calendar → calendar settings → *Sync with other apps*).
