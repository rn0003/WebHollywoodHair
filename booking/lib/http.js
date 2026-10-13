// Small helpers shared by the API routes: responses, client IP, rate limiting,
// origin checks, input validation and optional Cloudflare Turnstile bot checks.

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

export function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real);
  const fwd = String(req.headers['x-forwarded-for'] || '');
  return fwd.split(',')[0].trim() || 'unknown';
}

// Per-instance sliding window. Serverless instances don't share memory, so also turn on
// the host's firewall rate limiting for production (see README).
const hits = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

// Rejects cross-site form posts when ALLOWED_ORIGINS is set (comma-separated).
export function originAllowed(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(String(req.headers.origin || ''));
}

const CONTROL = /[\u0000-\u001F\u007F]/g;

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validPhone(phone) {
  return /^[+()\-.\s\d]{7,24}$/.test(phone) && phone.replace(/\D/g, '').length >= 7;
}

export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not enabled
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}
