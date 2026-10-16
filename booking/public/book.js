// Booking page. All text from the server is inserted with textContent, never as HTML.
(() => {
  const $ = (id) => document.getElementById(id);
  const PHONE_RE = /^[2-9]\d{2}-[2-9]\d{2}-\d{4}$/;

  // Formats typed or pasted digits as xxx-xxx-xxxx, keeping the caret after the same digit.
  function formatPhone(input) {
    const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    let digits = input.value.replace(/\D/g, '');
    if (digits.length > 10 && digits[0] === '1') digits = digits.slice(1); // drop +1 country code
    digits = digits.slice(0, 10);
    const out = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join('-');
    input.value = out;
    let pos = 0;
    for (let seen = 0; pos < out.length && seen < digitsBeforeCaret; pos++) if (/\d/.test(out[pos])) seen++;
    input.setSelectionRange(pos, pos);
    if (PHONE_RE.test(out) || out === '') input.removeAttribute('aria-invalid');
  }

  const state = { info: null, service: null, stylist: 0, date: null, start: null, label: null, request: 0 };

  function el(tag, className, children = []) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const c of children) node.append(c);
    return node;
  }

  function chip(kind, pressed, onClick, children) {
    const b = el('button', `chip ${kind}`, children);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  }

  function status(text) {
    $('times').replaceChildren(el('p', 'status', [text]));
  }

  function renderServices() {
    $('services').replaceChildren(...state.info.services.map((s) =>
      chip('service', s.id === state.service, () => { state.service = s.id; changed(true); }, [
        el('span', 'name', [s.name]),
        el('span', 'meta', [`${s.minutes} min · from ${s.price}`]),
      ])));
  }

  function renderStylists() {
    $('stylists').replaceChildren(...state.info.stylists.map((name, i) =>
      chip('pill', i === state.stylist, () => { state.stylist = i; changed(false); }, [name])));
  }

  function renderDays() {
    $('days').replaceChildren(...state.info.days.map((d) => {
      const b = chip('day', d.date === state.date, () => { state.date = d.date; changed(true); }, [
        el('span', 'dow', [d.dow]),
        el('span', 'num', [d.num]),
      ]);
      b.setAttribute('aria-label', `${d.dow} ${d.month} ${d.num}${d.open ? '' : ', closed'}`);
      b.disabled = !d.open;
      return b;
    }));
  }

  async function loadTimes() {
    state.start = null;
    state.label = null;
    if (!state.service || !state.date) return status('Choose a service and a day to see open times.');
    const ticket = ++state.request;
    status('Checking the calendar…');
    try {
      const qs = new URLSearchParams({ date: state.date, service: state.service });
      const r = await fetch(`/api/availability?${qs}`, { headers: { Accept: 'application/json' } });
      const data = await r.json();
      if (ticket !== state.request) return; // a newer request superseded this one
      if (!r.ok) return status(data.error || 'Couldn’t load times.');
      if (!data.slots.length) return status('No openings left this day for this service. Please try another day.');
      $('times').replaceChildren(...data.slots.map((s) => {
        const b = chip('pill', false, () => {
          state.start = s.start;
          state.label = s.label;
          for (const other of $('times').children) other.setAttribute('aria-pressed', String(other === b));
          renderSummary();
        }, [s.label]);
        return b;
      }));
    } catch {
      if (ticket === state.request) status('Couldn’t reach the salon calendar. Please try again or call us.');
    }
  }

  function renderSummary() {
    const svc = state.info.services.find((s) => s.id === state.service);
    const day = state.info.days.find((d) => d.date === state.date);
    $('sum-service').textContent = svc ? svc.name : '–';
    $('sum-stylist').textContent = state.info.stylists[state.stylist];
    $('sum-when').textContent = day
      ? `${day.dow} ${day.month} ${day.num} · ${state.label || 'pick a time'}`
      : 'Pick a day and time';
    $('sum-price').textContent = svc ? svc.price : '–';
    $('confirm').disabled = !(svc && state.start);
  }

  function changed(reloadTimes) {
    renderServices();
    renderStylists();
    renderDays();
    if (reloadTimes) loadTimes();
    renderSummary();
  }

  function loadTurnstile(siteKey) {
    const box = $('turnstile');
    box.className = 'cf-turnstile';
    box.dataset.sitekey = siteKey;
    box.dataset.theme = 'dark';
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    document.head.append(s);
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    $('form-error').textContent = '';
    if (String(fd.get('name') || '').trim().length < 2) return ($('form-error').textContent = 'Please enter your name.');
    if (!PHONE_RE.test(String(fd.get('phone') || ''))) {
      $('phone').setAttribute('aria-invalid', 'true');
      $('phone').focus();
      return ($('form-error').textContent = 'Please enter your phone number as xxx-xxx-xxxx, e.g. 312-555-0147.');
    }

    $('confirm').disabled = true;
    $('confirm').textContent = 'Booking…';
    try {
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          service: state.service,
          stylist: state.stylist,
          start: state.start,
          name: fd.get('name'),
          phone: fd.get('phone'),
          notes: fd.get('notes'),
          website: fd.get('website'),
          turnstileToken: fd.get('cf-turnstile-response'),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        $('form-error').textContent = data.error || 'Something went wrong. Please call the salon.';
        if (r.status === 409) loadTimes();
        if (window.turnstile) window.turnstile.reset();
        return;
      }
      const day = state.info.days.find((d) => d.date === state.date);
      $('done-text').textContent = `${data.service} with ${data.stylist}, ${day.dow} ${day.month} ${day.num} at ${data.label}. See you soon.`;
      form.hidden = true;
      $('done').hidden = false;
      $('again').focus();
    } catch {
      $('form-error').textContent = 'Couldn’t reach the salon. Please check your connection or call us.';
    } finally {
      $('confirm').textContent = 'Confirm booking';
      renderSummary();
    }
  }

  async function init() {
    status('Loading…');
    try {
      const r = await fetch('/api/booking-info', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error();
      state.info = await r.json();
    } catch {
      return status('Online booking is unavailable right now. Please call the salon.');
    }
    const wanted = new URLSearchParams(location.search).get('service');
    state.service = state.info.services.some((s) => s.id === wanted) ? wanted : (state.info.services[0]?.id ?? null);
    state.date = state.info.days.find((d) => d.open)?.date ?? null;
    if (state.info.turnstileSiteKey) loadTurnstile(state.info.turnstileSiteKey);
    $('book-form').addEventListener('submit', submit);
    $('phone').addEventListener('input', (e) => formatPhone(e.target));
    $('again').addEventListener('click', () => {
      $('book-form').reset();
      $('book-form').hidden = false;
      $('done').hidden = true;
      if (window.turnstile) window.turnstile.reset();
      changed(true);
    });
    changed(true);
  }

  init();
})();
