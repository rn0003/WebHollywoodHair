// GET /api/booking-info: services, stylists and the days to show. Public data only.
import { config } from '../lib/config.js';
import { upcomingDays } from '../lib/slots.js';
import { send } from '../lib/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  send(res, 200, {
    services: config.services.map(({ id, name, minutes, price }) => ({ id, name, minutes, price })),
    stylists: config.stylists,
    days: upcomingDays(config),
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  });
}
