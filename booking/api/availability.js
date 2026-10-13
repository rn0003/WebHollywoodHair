// GET /api/availability?date=YYYY-MM-DD&service=cut
// Returns start times only, each marked available or not. No calendar details are exposed.
import { config, findService } from '../lib/config.js';
import { computeSlots, dayRange, isDateInRange } from '../lib/slots.js';
import { getBusy } from '../lib/calendar.js';
import { clientIp, rateLimit, send } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (!rateLimit(`avail:${clientIp(req)}`, 60, 60_000)) {
    return send(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
  }

  const date = String(req.query.date || '');
  const service = findService(String(req.query.service || ''));
  if (!service) return send(res, 400, { error: 'Unknown service.' });
  if (!isDateInRange(date, config)) return send(res, 400, { error: 'That date can’t be booked online.' });

  try {
    const { start, end } = dayRange(date, config);
    const busy = await getBusy(start, end, config.timezone);
    const slots = computeSlots({ date, minutes: service.minutes, busy, cfg: config });
    send(res, 200, { date, service: service.id, slots });
  } catch (err) {
    console.error('availability failed:', err.message);
    send(res, 503, { error: 'We couldn’t check availability right now. Please call the salon.' });
  }
}
