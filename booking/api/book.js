// POST /api/book  { service, stylist, start, name, phone, notes, website, turnstileToken }
// Re-checks the slot against the live calendar, then writes the appointment.
import { config, findService } from '../lib/config.js';
import { computeSlots, dayRange, isDateInRange, localDateOf } from '../lib/slots.js';
import { createAppointment, getBusy } from '../lib/calendar.js';
import { cleanText, clientIp, originAllowed, rateLimit, send, validPhone, verifyTurnstile } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return send(res, 415, { error: 'Expected JSON.' });
  }
  if (!originAllowed(req)) return send(res, 403, { error: 'Bookings must come from the salon website.' });

  const ip = clientIp(req);
  if (!rateLimit(`book:${ip}`, 5, 10 * 60_000)) {
    return send(res, 429, { error: 'Too many booking attempts. Please call the salon.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: real visitors never see or fill this field. Pretend success for bots.
  if (cleanText(body.website, 200)) return send(res, 200, { ok: true });

  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return send(res, 400, { error: 'Please complete the “I’m human” check and try again.' });
  }

  const service = findService(String(body.service || ''));
  const stylistIndex = Number.isInteger(body.stylist) ? body.stylist : 0;
  const stylist = config.stylists[stylistIndex];
  const name = cleanText(body.name, 80);
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const notes = cleanText(body.notes, 300);
  const startIso = String(body.start || '');
  const date = localDateOf(startIso, config);

  if (!service) return send(res, 400, { error: 'Please choose a service.' });
  if (!stylist) return send(res, 400, { error: 'Please choose a stylist.' });
  if (name.length < 2) return send(res, 400, { error: 'Please enter your name.' });
  if (!validPhone(phone)) return send(res, 400, { error: 'Please enter your phone number as xxx-xxx-xxxx, e.g. 312-555-0147.' });
  if (!date || !isDateInRange(date, config)) return send(res, 400, { error: 'That time can’t be booked online.' });

  try {
    // Re-read the calendar: the slot must still be free right now.
    const { start: dayStart, end: dayEnd } = dayRange(date, config);
    const busy = await getBusy(dayStart, dayEnd, config.timezone);
    const slot = computeSlots({ date, minutes: service.minutes, busy, cfg: config })
      .find((s) => s.start === new Date(startIso).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    if (!slot) return send(res, 400, { error: 'That time isn’t offered. Please pick another.' });
    if (!slot.available) return send(res, 409, { error: 'Sorry, that time was just taken. Please pick another.' });

    const start = new Date(slot.start);
    const end = new Date(start.getTime() + service.minutes * 60_000);
    await createAppointment({
      start,
      end,
      summary: `${service.name} – ${name}`,
      description: [
        `Client: ${name}`,
        `Phone: ${phone}`,
        `Stylist: ${stylist}`,
        notes ? `Notes: ${notes}` : null,
        'Booked online',
      ].filter(Boolean).join('\n'),
    });
    send(res, 201, { ok: true, start: slot.start, label: slot.label, date, service: service.name, stylist });
  } catch (err) {
    console.error('booking failed:', err.message);
    send(res, 503, { error: 'We couldn’t save your booking. Please call the salon.' });
  }
}
