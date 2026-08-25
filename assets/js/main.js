/* Cafe Mehrban — small behaviours, no dependencies. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* current year in the footer */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* mobile drawer */
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
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      burger.querySelector('.sr').textContent = open ? 'Open menu' : 'Close menu';
      drawer.hidden = open;
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

  /* shadow under the nav once the hero starts scrolling away */
  var nav = document.getElementById('nav');
  if (nav && 'IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;';
    document.body.prepend(sentinel);
    new IntersectionObserver(function (entries) {
      nav.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* reveal sections as they arrive */
  var targets = document.querySelectorAll('.head, .dish, .card, .room, .counter__text, .visit__block');

  if (reduced || !('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  targets.forEach(function (el, i) {
    el.classList.add('reveal');
    /* stagger only within a row of cards, never across the page */
    var sibs = el.parentElement ? el.parentElement.children : [];
    var idx = Array.prototype.indexOf.call(sibs, el);
    el.style.transitionDelay = (Math.min(idx, 3) * 70) + 'ms';
    io.observe(el);
  });
})();
