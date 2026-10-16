// Home page: fills services, prices and opening hours from the same settings the booking
// page uses (lib/config.js via /api/booking-info). Text is inserted with textContent only.
(() => {
  const el = (tag, className, children = []) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const c of children) node.append(c);
    return node;
  };

  function renderServices(services) {
    const list = document.getElementById('service-list');
    list.replaceChildren(...services.map((s) => {
      const link = el('a', 'card-link', ['Book this']);
      link.href = `/book?service=${encodeURIComponent(s.id)}`;
      return el('article', 'card', [
        el('div', 'card-head', [el('h3', '', [s.name]), el('span', 'price', [`from ${s.price}`])]),
        el('p', 'muted', [s.desc || '']),
        el('span', 'time', [`${s.minutes} min`]),
        link,
      ]);
    }));
  }

  function renderHours(hours) {
    document.getElementById('hours-list').replaceChildren(...hours.map((h) =>
      el('div', h.today ? 'is-today' : '', [el('dt', '', [h.day]), el('dd', '', [h.time])])));
    const today = hours.find((h) => h.today);
    if (today) {
      document.getElementById('today-hours').textContent =
        today.time === 'Closed' ? 'Closed today · book online any time' : `Open today · ${today.time}`;
    }
  }

  fetch('/api/booking-info', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((info) => {
      renderServices(info.services);
      renderHours(info.hours);
    })
    .catch(() => {
      const list = document.getElementById('service-list');
      const p = el('p', 'muted', ['See all services and prices on the ']);
      const a = el('a', '', ['booking page']);
      a.href = '/book';
      p.append(a, '.');
      list.replaceChildren(p);
    });
})();
