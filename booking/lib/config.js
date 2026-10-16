// Salon settings. Everything here is public information that the booking page may show.
// Secrets (calendar login, Turnstile secret) live only in environment variables.

export const config = {
  timezone: process.env.SALON_TIMEZONE || 'America/Los_Angeles',
  slotStepMin: 30, // how often a start time is offered
  bufferMin: 0, // minutes kept free before and after every appointment (0 = back-to-back allowed)
  leadTimeMin: 120, // earliest booking is this many minutes from now
  horizonDays: 30, // how far ahead clients can book
  daysShown: 14, // days listed on the booking page

  // ISO weekday (1 = Monday … 7 = Sunday) → [open, close] in salon local time, or null when closed.
  // TODO: replace with the salon's real hours.
  hours: {
    1: ['09:00', '18:00'],
    2: ['09:00', '18:00'],
    3: ['09:00', '18:00'],
    4: ['09:00', '19:00'],
    5: ['09:00', '19:00'],
    6: ['09:00', '17:00'],
    7: null,
  },

  // TODO: replace prices and check durations.
  services: [
    { id: 'cut', name: 'Cut & Style', minutes: 60, price: '[$]', desc: 'Consultation, wash, precision cut and a finished blowout.' },
    { id: 'color', name: 'Color', minutes: 90, price: '[$]', desc: 'Single-process, gloss or root touch-up, matched to your skin tone.' },
    { id: 'balayage', name: 'Balayage', minutes: 180, price: '[$]', desc: 'Hand-painted, lived-in lightness with a toner and style.' },
    { id: 'blowout', name: 'Blowout', minutes: 45, price: '[$]', desc: 'Wash and a smooth, lasting blowout for any occasion.' },
    { id: 'bridal', name: 'Bridal & Events consult', minutes: 30, price: '[$]', desc: 'Updos and styling for the day, with a trial beforehand.' },
    { id: 'treatment', name: 'Treatments', minutes: 30, price: '[$]', desc: 'Bond repair, deep conditioning and scalp care.' },
  ],

  // All stylists currently share one calendar; the choice is written into the appointment.
  stylists: ['First available', '[Stylist A]', '[Stylist B]', '[Stylist C]', '[Stylist D]'],
};

export function findService(id) {
  return config.services.find((s) => s.id === id) || null;
}
