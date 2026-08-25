/* Cafe Mehrban — small behaviours, no dependencies. */
(function () {
  'use strict';

  /* The cafe's real trading hours: 11:00–22:00, every day of the week.
     Everything below — the open/closed badge, the bookable time slots —
     is derived from these two numbers rather than written out twice. */
  var OPEN_MIN = 11 * 60;
  var CLOSE_MIN = 22 * 60;
  var LAST_TABLE_MIN = CLOSE_MIN - 30;   /* last seating, half an hour before close */
  var TZ = 'Asia/Kolkata';
  var WHATSAPP = '918709193390';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Clock time in Ranchi, whatever timezone the visitor is in. */
  function ranchiNow() {
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).formatToParts(new Date());
    } catch (e) {
      return null;                        /* no Intl/tz data — skip the badge */
    }
    var v = {};
    parts.forEach(function (p) { v[p.type] = p.value; });
    var hour = parseInt(v.hour, 10) % 24; /* some engines render midnight as 24 */
    return {
      minutes: hour * 60 + parseInt(v.minute, 10),
      ymd: v.year + '-' + v.month + '-' + v.day
    };
  }

  function label12(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var suffix = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12 || 12;
    return h12 + (m ? ':' + pad(m) : '') + suffix;
  }

  /* ── open / closed badge ───────────────────────────────── */
  var badge = document.getElementById('openNow');
  var now = ranchiNow();

  if (badge && now) {
    var open = now.minutes >= OPEN_MIN && now.minutes < CLOSE_MIN;
    badge.hidden = false;
    badge.classList.add(open ? 'is-open' : 'is-shut');
    badge.textContent = open
      ? 'Open now · closes ' + label12(CLOSE_MIN)
      : 'Closed · opens ' + label12(OPEN_MIN);
  }

  /* ── current year ──────────────────────────────────────── */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* ── mobile drawer ─────────────────────────────────────── */
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');

  function closeDrawer() {
    if (!burger || !drawer) return;
    burger.setAttribute('aria-expanded', 'false');
    burger.querySelector('.sr').textContent = 'Open menu';
    drawer.hidden = true;
  }

  if (burger && drawer) {
    burger.addEventListener('click', function () {
      var isOpen = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!isOpen));
      burger.querySelector('.sr').textContent = isOpen ? 'Open menu' : 'Close menu';
      drawer.hidden = isOpen;
    });

    drawer.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeDrawer();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        closeDrawer();
        burger.focus();
      }
    });
  }

  /* ── sticky-nav shadow ─────────────────────────────────── */
  var nav = document.getElementById('nav');
  if (nav && 'IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;';
    document.body.prepend(sentinel);
    new IntersectionObserver(function (entries) {
      nav.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ── booking ───────────────────────────────────────────── */
  var form = document.getElementById('bookForm');

  if (form) {
    var elDate = document.getElementById('bkDate');
    var elTime = document.getElementById('bkTime');
    var elGuests = document.getElementById('bkGuests');
    var status = document.getElementById('bkStatus');

    /* party sizes */
    for (var g = 1; g <= 12; g++) {
      var og = document.createElement('option');
      og.value = String(g);
      og.textContent = g === 1 ? '1 person' : g + ' people';
      if (g === 2) og.selected = true;
      elGuests.appendChild(og);
    }
    var big = document.createElement('option');
    big.value = 'More than 12';
    big.textContent = 'More than 12 — we’ll call you';
    elGuests.appendChild(big);

    /* dates: today through two months out, in Ranchi's today */
    var today = now ? now.ymd : new Date().toISOString().slice(0, 10);
    elDate.min = today;
    var max = new Date(today + 'T00:00:00');
    max.setDate(max.getDate() + 60);
    elDate.max = max.toISOString().slice(0, 10);
    if (!elDate.value) elDate.value = today;

    /* half-hour slots between opening and the last table */
    function fillTimes() {
      var chosen = elTime.value;
      elTime.length = 1;
      var isToday = elDate.value === today;
      var earliest = OPEN_MIN;

      /* don't offer a slot that has already passed today */
      if (isToday && now) {
        var soonest = now.minutes + 45;                 /* a little notice */
        earliest = Math.max(OPEN_MIN, Math.ceil(soonest / 30) * 30);
      }

      var any = false;
      for (var t = earliest; t <= LAST_TABLE_MIN; t += 30) {
        var o = document.createElement('option');
        o.value = label12(t);
        o.textContent = label12(t);
        if (o.value === chosen) o.selected = true;
        elTime.appendChild(o);
        any = true;
      }

      if (!any) {
        elTime.options[0].textContent = 'No tables left today — try tomorrow';
        elTime.disabled = true;
      } else {
        elTime.options[0].textContent = 'Pick a time';
        elTime.disabled = false;
      }
    }

    elDate.addEventListener('change', fillTimes);
    fillTimes();

    /* validation — messages sit next to the field they belong to */
    function setError(id, msg) {
      var field = document.getElementById(id);
      var err = document.getElementById('err' + id.slice(2));
      if (!err) return;
      if (msg) {
        err.textContent = msg;
        err.hidden = false;
        field.setAttribute('aria-invalid', 'true');
        field.classList.add('is-bad');
      } else {
        err.hidden = true;
        field.removeAttribute('aria-invalid');
        field.classList.remove('is-bad');
      }
    }

    ['bkName', 'bkPhone', 'bkDate', 'bkTime'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener('input', function () { setError(id, ''); });
      el.addEventListener('change', function () { setError(id, ''); });
    });

    function digits(s) { return (s || '').replace(/\D/g, ''); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      status.className = 'book__status';

      var name = document.getElementById('bkName').value.trim();
      var rawPhone = document.getElementById('bkPhone').value;
      var phone = digits(rawPhone);
      var date = elDate.value;
      var time = elTime.value;
      var bad = null;

      if (!name) {
        setError('bkName', 'Tell us who the table is for');
        bad = 'bkName';
      } else { setError('bkName', ''); }

      /* accept 10-digit mobiles, or the same with a 0 / 91 / +91 in front */
      if (phone.length === 12 && phone.indexOf('91') === 0) phone = phone.slice(2);
      if (phone.length === 11 && phone.charAt(0) === '0') phone = phone.slice(1);
      if (!/^[6-9]\d{9}$/.test(phone)) {
        setError('bkPhone', 'We need a 10-digit mobile number so we can confirm');
        bad = bad || 'bkPhone';
      } else {
        setError('bkPhone', '');
      }

      if (!date || date < today) {
        setError('bkDate', 'Pick today or a day after it');
        bad = bad || 'bkDate';
      } else { setError('bkDate', ''); }

      if (!time) {
        setError('bkTime', 'Pick a time between 11am and 9:30pm');
        bad = bad || 'bkTime';
      } else { setError('bkTime', ''); }

      if (bad) {
        var first = document.getElementById(bad);
        first.focus();
        status.textContent = 'Check the highlighted fields and send again.';
        status.classList.add('is-bad');
        return;
      }

      var pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long'
      });

      var lines = [
        'Table request — Cafe Mehrban',
        '',
        'Name: ' + name,
        'Phone: ' + phone,
        'Date: ' + pretty,
        'Time: ' + time,
        'Guests: ' + elGuests.value,
        'Seating: ' + document.getElementById('bkSeat').value
      ];
      var note = document.getElementById('bkNote').value.trim();
      if (note) lines.push('Note: ' + note);

      window.open(
        'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(lines.join('\n')),
        '_blank', 'noopener'
      );

      status.textContent = 'WhatsApp is open with your request for ' + pretty +
                           ' at ' + time + '. Send it there and we’ll reply to confirm.';
      status.classList.add('is-good');
    });
  }

  /* ── reveal sections as they arrive ────────────────────── */
  if (reduced || !('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  document.querySelectorAll('.head, .dish, .card, .room, .counter__text, .visit__block, .book')
    .forEach(function (el) {
      el.classList.add('reveal');
      var sibs = el.parentElement ? el.parentElement.children : [];
      var idx = Array.prototype.indexOf.call(sibs, el);
      el.style.transitionDelay = (Math.min(idx, 3) * 70) + 'ms';
      io.observe(el);
    });
})();
