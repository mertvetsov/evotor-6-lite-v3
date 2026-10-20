import '@fontsource-variable/onest';
import './styles.css';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const EASE = 'expo.out';

/* ------------------------------------------------------------------ smooth scroll */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

const bar = $('[data-bar]');
const burger = $('[data-burger]');
const setMenu = (open) => {
  bar.classList.toggle('is-open', open);
  open ? lenis?.stop() : lenis?.start();
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
};
burger.addEventListener('click', () => setMenu(!bar.classList.contains('is-open')));
bar.addEventListener('click', (e) => { if (e.target === bar) setMenu(false); }); // tap on the dimmed area
addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const hash = a.getAttribute('href');
  e.preventDefault();
  if (hash.length < 2) return;
  setMenu(false);
  // «Оставить заявку» lands on the form panel itself, not the device above it
  const target = hash === '#form' ? $('.apply__panel') : $(hash);
  if (!target) return;
  const offset = hash === '#top' ? 0 : hash === '#form' ? -76 : -56;
  if (!lenis) {
    target.scrollIntoView({ behavior: 'smooth' });
    if (hash === '#form') setTimeout(() => $('#form input')?.focus({ preventScroll: true }), 1600);
    return;
  }
  // a long trip would fast-forward the whole 3D choreography (spins, screens, receipt, the day…):
  // the device fades out for the ride and appears already settled at the destination
  const far = Math.abs(target.getBoundingClientRect().top + offset) > innerHeight * 1.2;
  const trip = ++trips; // a newer click supersedes this one
  navigating = far;
  const arrive = () => {
    if (trip !== trips) return;
    trips++; // run once
    if (far) { snapDevice(); navigating = false; }
    if (hash === '#form') $('#form input')?.focus({ preventScroll: true });
  };
  lenis.scrollTo(target, { offset, duration: 1.6, onComplete: arrive });
  setTimeout(arrive, 1900); // in case the ride is interrupted by the visitor's own scrolling
});

let navigating = false;
let trips = 0;

/* bar: active section link */
{
  const links = $$('.bar__nav a');
  const targets = links.map((a) => $(a.getAttribute('href')));
  const update = () => {
    const mid = innerHeight * 0.4;
    targets.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      links[i].classList.toggle('is-active', r.top < mid && r.bottom > mid);
    });
  };
  lenis ? lenis.on('scroll', update) : addEventListener('scroll', update, { passive: true });
  update();
}

/* ------------------------------------------------------------------ choreography
   Poses are keyframed against scroll positions measured from the DOM. The
   terminal and the studio glow follow the interpolated pose with damping. */
const FIELDS = ['rx', 'ry', 'rz', 'x', 'y', 's', 'op', 'gx', 'gy', 'go', 'pr', 'dy', 'dn', 'sh']; // pr: receipt paper out; dy: time of day 0..1, dn: how much the day light is on; sh: cursor highlight (hero only)
// what the terminal's own screen shows in each part of the page (not interpolated: it switches at the midpoint)
const SCR = { menu: 0, pay: 1, done: 2, success: 3, wait: 4, shift: 5 }; // 0–2 screenshots; 3–5 = live canvases (success, waiting for payment, working day)
const P = (o) => ({ rx: 0, ry: 0, rz: 0, x: 0, y: 0, s: 0.85, op: 1, gx: 50, gy: 60, go: 1, pr: 0, dy: 0, dn: 0, sh: 0, screen: SCR.menu, ...o });

let keys = [];
let cutRange = [0, 0];
let narrow = false;

// Must match the camera in terminal.js (fov 28°, distance 6.2, pulled back on tall screens).
const FOV = 28, DIST = 6.2, DEVICE_H = 2.6, DEVICE_W = 1.45;
// same query as the stacked layout in styles.css: phones and portrait screens
const STACKED = matchMedia('(max-width: 760px), (max-aspect-ratio: 9/10)');

/* Fit the terminal into a layout slot as it will sit at scroll position `atY`:
   the slot's on-screen box → world position, scale and glow centre. The copy
   never overlaps the device because the device only ever occupies its slot. */
function fit(slot, atY, fill = 0.92) {
  const pin = slot.closest('.tour__pin'); // sticky: once pinned its box sits at the viewport top
  const vw = innerWidth, vh = innerHeight;
  const aspect = vw / vh;
  const z = aspect < 0.9 ? (DIST / Math.max(aspect, 0.6)) * 0.9 : DIST;
  const worldH = 2 * z * Math.tan((FOV / 2) * (Math.PI / 180));
  const k = worldH / vh; // world units per CSS pixel
  const r = slot.getBoundingClientRect();
  let top = pin ? r.top - pin.getBoundingClientRect().top : r.top + scrollY - atY;
  if (pin) {
    // before the tour pins, its box still scrolls with the page: the slot sits lower by the distance left
    const tour = pin.closest('[data-tour]');
    const start = tour.getBoundingClientRect().top + scrollY;
    if (atY < start) top += start - atY;
    // …and after it unpins, it scrolls away upwards with the page
    const end = start + tour.offsetHeight - vh;
    if (atY > end) top -= atY - end;
  }
  const cx = r.left + r.width / 2;
  const cy = top + r.height / 2;
  const s = Math.min((r.height * k * fill) / DEVICE_H, (r.width * k * fill) / DEVICE_W);
  return { x: (cx - vw / 2) * k, y: -(cy - vh / 2) * k, s: Math.max(0.2, s), gx: (cx / vw) * 100, gy: (cy / vh) * 100 };
}

function buildKeys() {
  const vh = innerHeight;
  const top = (sel) => $(sel).getBoundingClientRect().top + scrollY;
  const slot = (name) => $(`[data-slot="${name}"]`);
  const hero = $('[data-k="hero"]');
  const tour = $('[data-tour]');
  const tourTop = top('[data-tour]');
  const tourLen = tour.offsetHeight - vh;
  narrow = STACKED.matches;
  const at = (y, name, pose, fill) => [y, P({ ...fit(slot(name), y, fill), ...pose })];
  const print = (key) => { key[1].y -= key[1].s * 0.55; return key; }; // leave headroom for the paper
  // a virtual centred box: 76% of the viewport height
  const k = (() => {
    const aspect = innerWidth / vh;
    const z = aspect < 0.9 ? (DIST / Math.max(aspect, 0.6)) * 0.9 : DIST;
    return (2 * z * Math.tan((FOV / 2) * (Math.PI / 180))) / vh;
  })();
  const centreS = Math.min((vh * 0.74 * k) / DEVICE_H, (innerWidth * 0.8 * k) / DEVICE_W);

  const heroY = hero.offsetHeight * 0.6;
  const whyY = top('[data-k="why"]') - vh * 0.1;
  const risksY = top('[data-k="risks"]') - vh * 0.62; // gone before the tiles fill the view
  const tourSlot = (i) => (narrow ? 'tour-l' : i % 2 === 0 ? 'tour-l' : 'tour-r');
  const tourAt = (i) => tourTop + tourLen * (i * 0.25 + 0.125);
  const formY = top('[data-k="form"]') + vh * 0.15;
  const footY = top('[data-k="foot"]');

  keys = [
    // hero: large, turned to show the printer side, tilted into the copy
    // (narrow: the device sits low under the copy, so it leans its top back, away from the camera — otherwise the
    // top end with the logo shows from below, upside down)
    at(0, 'hero', narrow ? { rx: -0.2, ry: -0.35, rz: 0.06, sh: 1 } : { rx: 0.06, ry: -0.62, rz: 0.16, sh: 1 }, 1), // the cursor highlight lives only here
    at(heroY, 'hero', { rx: 0.1, ry: -0.2, rz: 0.04, go: 0.8 }, 1),
    narrow
      ? [whyY, P({ rx: 0.1, ry: -1, y: 1.2, s: centreS * 0.6, op: 0, go: 0.2, screen: SCR.pay })]
      : at(whyY, 'why', { rx: 0.1, ry: -1, rz: 0.12, go: 0.55, screen: SCR.pay }),
    narrow
      ? [risksY, P({ y: 1.4, s: centreS * 0.5, op: 0, go: 0, screen: SCR.pay })]
      : at(risksY, 'why', { rx: 0.1, ry: -1.3, rz: 0.12, op: 0, go: 0, screen: SCR.pay }),
    // appears only once the tour is pinned and the intro heading has left the screen
    // the device rides in with the tour block while it scrolls up to pin — no empty screen before the first slide
    at(tourTop - vh * 0.85, tourSlot(0), { ry: 1.1, op: 0, go: 0 }),
    at(tourTop - vh * 0.4, tourSlot(0), { rx: 0.05, ry: 0.55 }),
    at(tourTop, tourSlot(0), { rx: 0.05, ry: 0.3 }),
    at(tourAt(0), tourSlot(0), { rx: 0.05, ry: 0.6, rz: -0.08 }),
    // tour: one screen per spec — menu (compact), card/QR payment (4G), then the working-day screen from the print step on (it faces away there, so the turn to «До 12 часов» never flashes another screen)
    at(tourAt(1), tourSlot(1), { rx: 0.18, ry: -0.75, rz: 0.06, screen: SCR.pay }),
    // printing: a smaller device set lower, so the receipt has room to rise above it
    print(at(tourAt(2), tourSlot(2), { rx: 0.5, ry: -2.6, rz: 0.1, pr: 1, screen: SCR.shift }, 0.66)), // screen faces away here: switch to the shift screen early, so the turn to «До 12 часов» shows it straight away
    // a working day: the device settles early in the step, then the rest of the step is 08:00 → 20:00
    at(tourTop + tourLen * 0.8, tourSlot(3), { rx: 0.08, ry: -5.95, rz: -0.05, dn: 1, screen: SCR.shift }),
    at(tourTop + tourLen * 0.99, tourSlot(3), { rx: 0.08, ry: -6.05, rz: -0.05, dn: 1, dy: 1, screen: SCR.shift }),
    // leaving: the device rides up with the block and fades only near the top edge
    at(tourTop + tourLen + vh * 0.45, tourSlot(3), { rx: 0.1, ry: -6.3, dn: 1, dy: 1, screen: SCR.shift }),
    at(tourTop + tourLen + vh * 0.9, tourSlot(3), { rx: 0.12, ry: -6.6, op: 0, go: 0, dy: 1, screen: SCR.shift }),
    at(formY - vh * 0.55, 'form', { rx: 0.1, ry: 1.4, op: 0, go: 0, screen: SCR.wait }),
    at(formY, 'form', { rx: 0.08, ry: 0.75, rz: -0.05, go: 0.9, screen: SCR.wait }),
    at(footY - vh * 0.6, 'form', { rx: 0.08, ry: 0.4, go: 0.8, screen: SCR.wait }),
    at(footY - vh * 0.1, 'form', { ry: 0.2, op: 0, go: 0, screen: SCR.wait }),
  ];
  keys.sort((a, b) => a[0] - b[0]);
  // inside the tour the screen cuts with the slide caption instead of wiping across it
  cutRange = [tourTop - vh, tourTop + tourLen + vh];
}

const smooth = (t) => t * t * (3 - 2 * t);
function target(y) {
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [y1, p1] = keys[i];
    if (y <= y1) {
      const [y0, p0] = keys[i - 1];
      const t = smooth((y - y0) / Math.max(1, y1 - y0));
      const o = {};
      FIELDS.forEach((f) => (o[f] = p0[f] + (p1[f] - p0[f]) * t));
      o.screen = t < 0.5 ? p0.screen : p1.screen;
      return o;
    }
  }
  return keys[keys.length - 1][1];
}

/** Put the device straight into the pose for the current scroll (on arrival from a menu link), no easing. */
function snapDevice() {
  if (!keys.length) return;
  const t = target(scrollY);
  FIELDS.forEach((f) => f !== 'op' && (cur[f] = t[f])); // pose snaps; opacity still fades back in
}
if (import.meta.env.DEV) window.__target = (y = scrollY) => target(y); // dev-only: the authored pose at a scroll position
const cur = P({ op: 1 });
let last = [];
const glow = $('[data-glow]');
const flash = $('[data-flash]');
const dayLayer = $('[data-day]');
// page glow for morning → noon → evening (two clouds, as rgb triplets for CSS)
const DAY_A = ['#ffb066', '#bfdcff', '#a98bff'];
const DAY_B = ['#ffd27a', '#fff1dc', '#ff8fb0'];
let lastDay = '';
let shift = null;
function mix3(stops, t) {
  const [a, b] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  return [16, 8, 0].map((sh) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * k)).join(', ');
}
const stage = $('[data-stage]');
let lastT = 0;
// the lead form "pays": after a valid submit the terminal turns to the visitor and shows success
const lead = { sent: false, face: 0 };
function drive() {
  const t = { ...target(scrollY) };
  if (navigating) t.op = 0; // hidden while a menu link scrolls the page
  if (t.screen === SCR.wait) {
    const b = lead.face;
    t.rx *= 1 - b; t.ry = t.ry * (1 - b) + 0.1 * b; t.rz *= 1 - b; t.s *= 1 + 0.12 * b;
    if (lead.sent) t.screen = SCR.success;
  }
  // time-based easing (≈180 ms half-life) so a slow or throttled device catches up just as fast
  const now = performance.now();
  const dt = lastT ? Math.min((now - lastT) / 1000, 1) : 1;
  lastT = now;
  const k = reduced ? 1 : 1 - Math.exp(-dt * 3.8);
  // fading out must not lag (≈60 ms instead of ≈260 ms): on a fast scroll the device would linger over the next section
  const kOut = reduced ? 1 : 1 - Math.exp(-dt * 16);
  FIELDS.forEach((f) => (cur[f] += (t[f] - cur[f]) * (f === 'op' && t.op < cur.op ? kOut : k)));
  // write only what changed; the first frames fade the device in from 0
  const css = [cur.op.toFixed(3), `${cur.gx.toFixed(2)}%`, `${cur.gy.toFixed(2)}%`, cur.go.toFixed(3)];
  if (css[0] !== last[0]) stage.style.opacity = css[0];
  if (css[1] !== last[1]) { glow.style.setProperty('--gx', css[1]); flash.style.setProperty('--gx', css[1]); }
  if (css[2] !== last[2]) { glow.style.setProperty('--gy', css[2]); flash.style.setProperty('--gy', css[2]); }
  if (css[3] !== last[3]) glow.style.setProperty('--go', css[3]);
  last = css;
  shift?.setDay(cur.dy);
  // the page's glow takes the colour of the hour while the day plays
  const day = `${cur.dn.toFixed(3)}|${cur.dy.toFixed(3)}`;
  if (day !== lastDay) {
    lastDay = day;
    dayLayer.style.opacity = cur.dn.toFixed(3);
    dayLayer.style.setProperty('--day-a', mix3(DAY_A, cur.dy));
    dayLayer.style.setProperty('--day-b', mix3(DAY_B, cur.dy));
    dayLayer.style.setProperty('--gx', css[1]);
    dayLayer.style.setProperty('--gy', css[2]);
  }
  return { ...cur, screen: t.screen, cut: scrollY > cutRange[0] && scrollY < cutRange[1], instant: navigating, skip: cur.op < 0.01 };
}

/* tour: which spec is on */
function tourWatch() {
  const tour = $('[data-tour]');
  const specs = $$('[data-spec]', tour);
  const dots = $$('.tour__dots button', tour);
  // a dot takes the tour to the middle of its slide — the same pose and screen a scroll would reach
  dots.forEach((dot, i) => dot.addEventListener('click', () => {
    const top = tour.getBoundingClientRect().top + scrollY;
    const y = top + (tour.offsetHeight - innerHeight) * (i * 0.25 + 0.125);
    if (lenis) lenis.scrollTo(y, { duration: 1.1 });
    else scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }));
  const posters = $$('.poster--tour', tour);
  let active = -1;
  const update = () => {
    const r = tour.getBoundingClientRect();
    const len = tour.offsetHeight - innerHeight;
    const p = -r.top / Math.max(1, len);
    // the first slide shows as soon as the block is mostly in view, not only once it pins
    // …and the last one stays while the block scrolls away, until it has nearly left
    const i = r.top > innerHeight * 0.75 || r.bottom < innerHeight * 0.3 ? -1 : Math.min(3, Math.max(0, Math.floor(p * 4)));
    if (i === active) return;
    active = i;
    specs.forEach((s, j) => s.classList.toggle('is-on', j === i));
    dots.forEach((d, j) => { d.classList.toggle('is-on', j === i); j === i ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current'); });
    posters.forEach((p) => p.classList.toggle('is-on', +p.dataset.i === i));
  };
  lenis ? lenis.on('scroll', update) : addEventListener('scroll', update, { passive: true });
  update();
}

/* ------------------------------------------------------------------ 3D */
async function terminal() {
  const root = document.documentElement;
  // reduced motion: keep the static posters instead of a scroll-driven device
  if (reduced) { root.classList.add('no-3d'); return; }
  buildKeys();
  Object.assign(cur, target(scrollY), { op: 0 });
  try {
    const [{ mountTerminal }, { createSuccessScreen }, { createPayScreen }, { createShiftScreen }] = await Promise.all([
      import('./terminal.js'), import('./success-screen.js'), import('./pay-screen.js'), import('./shift-screen.js'),
    ]);
    let success = null;
    const api = await mountTerminal(stage, {
      reduced,
      assetBase: './',
      drive,
      interactive: false,
      pointerTarget: window,
      look: 'light',
      distance: 6.2,
      // the success screen replays its animation every time the terminal arrives at the form
      onScreen: (i) => (i === SCR.success ? success?.play() : success?.stop()),
    });
    root.classList.add('has-3d');
    success = await createSuccessScreen({ assetBase: './', reduced });
    const pay = await createPayScreen({ assetBase: './', reduced });
    const iS = api.addScreen(success.canvas, success.update);
    const iW = api.addScreen(pay.canvas, pay.update);
    shift = createShiftScreen();
    const iD = api.addScreen(shift.canvas, shift.update);
    if (iS !== SCR.success || iW !== SCR.wait || iD !== SCR.shift) console.warn('[terminal] unexpected screen indices', iS, iW, iD);

    document.addEventListener('lead:sent', () => {
      lead.sent = true;
      // on stacked layouts the device sits above the form: bring it into view for the moment
      if (STACKED.matches && lenis) lenis.scrollTo('.apply__room', { offset: -70, duration: 1.2 });
      gsap.to(lead, { face: 1, duration: 1.6, ease: 'expo.out' });
      const glow = { a: 0 };
      gsap.timeline({ onUpdate: () => api.setAccent(glow.a) })
        .to(glow, { a: 1, duration: 0.35, ease: 'power2.out' }, 0.15)
        .to(glow, { a: 0, duration: 2.4, ease: 'power2.inOut' });
      // a short green burst on the page, gone completely afterwards
      gsap.timeline()
        .to(flash, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.1)
        .to(flash, { opacity: 0, duration: 2.2, ease: 'power2.inOut' });
    });
  } catch (err) {
    console.warn('[terminal] 3D unavailable, keeping the static posters:', err);
    root.classList.add('no-3d');
    return;
  }
  let t;
  const rebuild = () => { clearTimeout(t); t = setTimeout(buildKeys, 120); };
  addEventListener('resize', rebuild);
  new ResizeObserver(rebuild).observe(document.body);
}

/* ------------------------------------------------------------------ reveals */
function reveals() {
  const rv = $$('.hero .rv');
  if (reduced) { gsap.set([...rv, ...$$('[data-reveal]'), ...$$('[data-tile]')], { opacity: 1 }); return; }

  gsap.timeline({ defaults: { ease: EASE } })
    .fromTo(rv, { opacity: 0, y: 40, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6, stagger: 0.1 }, 0.15)
    .from('.bar__inner > *', { opacity: 0, y: -8, duration: 1, stagger: 0.04, clearProps: 'opacity,transform' }, 0.1)
    .from('.studio__glow', { opacity: 0, scale: 1.2, duration: 2.4, clearProps: 'opacity,scale' }, 0);

  const num = $('[data-count]');
  const o = { v: 0 };
  gsap.to(o, {
    v: +num.dataset.count, duration: 1.8, ease: 'power3.out', delay: 0.6,
    onUpdate: () => (num.textContent = `${Math.round(o.v).toLocaleString('ru-RU')} ₽`),
  });

  // the hero copy recedes as the terminal rises through it
  gsap.to('.hero__copy', {
    opacity: 0, y: -60, scale: 0.96, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '45% top', scrub: true },
  });

  $$('[data-reveal]').forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: 36, filter: 'blur(10px)' }, {
      opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3, ease: EASE,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  $$('.bento, .facts').forEach((group) => {
    const tiles = $$('[data-tile]', group);
    gsap.fromTo(tiles, { opacity: 0, y: 60, scale: 0.96 }, {
      opacity: 1, y: 0, scale: 1, duration: 1.4, ease: EASE, stagger: 0.1, clearProps: 'transform',
      scrollTrigger: {
        trigger: group, start: 'top 85%', once: true,
        onEnter: () => tiles.forEach((t, i) => setTimeout(() => t.classList.add('is-in'), 300 + i * 100)),
      },
    });
  });

  // big numbers count up when their tile lands
  $$('.tile__big').forEach((el) => {
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    if (!n) return;
    const o2 = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => gsap.to(o2, {
        v: n, duration: 1.6, ease: 'power3.out',
        onUpdate: () => (el.textContent = `${Math.round(o2.v).toLocaleString('ru-RU')} ₽`),
      }),
    });
  });

  hand();

  // steps: the line fills, numbers light in turn
  const flow = $('[data-flow]');
  const steps = $$('.flow__step', flow);
  gsap.fromTo(steps, { opacity: 0, y: 40 }, {
    opacity: 1, y: 0, duration: 1.2, ease: EASE, stagger: 0.12,
    scrollTrigger: { trigger: flow, start: 'top 85%', once: true },
  });
  ScrollTrigger.create({
    trigger: flow, start: 'top 75%', end: 'bottom 45%', scrub: true,
    onUpdate: (self) => {
      $('[data-flow-fill]').style.transform = `scaleX(${self.progress})`;
      steps.forEach((s, i) => s.classList.toggle('is-on', self.progress >= i / steps.length + 0.05 || self.progress > 0.98));
    },
  });

  // pills: the inner light follows the cursor
  $$('.pill').forEach((p) => p.addEventListener('pointermove', (e) => {
    const r = p.getBoundingClientRect();
    p.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  }));
}

/* ------------------------------------------------------------------ form (visual prototype: nothing is sent or stored) */
/* «Сэкономьте»: the hand brings the terminal into the tile from the wrist as you scroll */
function hand() {
  const el = $('[data-hand]');
  if (!el) return;
  gsap.timeline({ scrollTrigger: { trigger: '.tile--save', start: 'top bottom', end: 'bottom top', scrub: 0.8 } })
    .fromTo(el, { xPercent: 16, yPercent: 26, rotate: 12 }, { xPercent: 0, yPercent: 0, rotate: -1, ease: 'power2.out', duration: 1 })
    .to(el, { yPercent: -5, rotate: -3, ease: 'none', duration: 0.8 });
}

function form() {
  const f = $('[data-form]');
  const phone = $('[data-phone]', f);
  const inn = $('[data-inn]', f);
  const status = $('.form__status', f);
  const submit = $('button[type="submit"]', f);
  const label = $('.pill__label', submit);

  const formatPhone = (raw) => {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    // +7 (900) 123-45-67 — the same shape as the field's example
    let out = '+7';
    if (p[0]) out += ` (${p[0]}${p[0].length === 3 ? ')' : ''}`;
    if (p[1]) out += ` ${p[1]}`;
    if (p[2]) out += `-${p[2]}`;
    if (p[3]) out += `-${p[3]}`;
    return out;
  };
  phone.addEventListener('input', () => { phone.value = phone.value ? formatPhone(phone.value) : ''; });
  phone.addEventListener('focus', () => { if (!phone.value) phone.value = '+7 '; });
  phone.addEventListener('blur', () => { if (phone.value.replace(/\D/g, '').length <= 1) phone.value = ''; });
  inn.addEventListener('input', () => { inn.value = inn.value.replace(/\D/g, '').slice(0, 12); });

  const rules = {
    name: (v) => (v.trim().length >= 2 ? '' : 'Укажите имя'),
    city: (v) => (v.trim().length >= 2 ? '' : 'Укажите город'),
    phone: (v) => (v.replace(/\D/g, '').length === 11 ? '' : 'Введите номер полностью, например +7 (900) 123-45-67'),
    inn: (v) => (/^\d{10}$|^\d{12}$/.test(v) ? '' : 'ИНН — 10 или 12 цифр'),
  };
  const check = (input) => {
    const rule = rules[input.name];
    if (!rule) return true;
    const msg = rule(input.value);
    const field = input.closest('.field');
    field.classList.toggle('is-error', !!msg);
    $('.field__err', field).textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  };
  $$('input', f).forEach((i) => {
    i.addEventListener('blur', () => i.value && check(i));
    i.addEventListener('input', () => i.closest('.is-error') && check(i));
  });
  const pd = $('[name="pd"]', f);
  const pdErr = $('#f-pd-err', f);
  const setConsent = (ok) => {
    pd.closest('.box').classList.toggle('is-error', !ok);
    pdErr.textContent = ok ? '' : 'Отметьте согласие, чтобы отправить заявку';
    pd.setAttribute('aria-invalid', ok ? 'false' : 'true');
  };
  pd.addEventListener('change', () => {
    if (!pd.checked) return;
    setConsent(true);
    demoFill();
  });

  // demo: ticking the consent fills the empty fields with plausible values,
  // so a presenter only has to press the button
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const digits = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10))).join('');
  const DEMO = {
    name: () => pick(['Анна', 'Иван', 'Мария', 'Дмитрий', 'Ольга', 'Сергей', 'Екатерина', 'Алексей']),
    city: () => pick(['Москва', 'Казань', 'Екатеринбург', 'Новосибирск', 'Самара', 'Краснодар', 'Пермь', 'Воронеж']),
    phone: () => formatPhone(`79${digits(9)}`),
    model: () => pick(['Эвотор 5', 'Эвотор 7.2', 'АТОЛ Sigma 7', 'Меркурий 185Ф', 'Дримкас Ф']),
    inn: () => digits(pick([10, 12])),
  };
  function demoFill() {
    for (const [name, make] of Object.entries(DEMO)) {
      const input = f.elements[name];
      if (!input) continue;
      const typed = name === 'phone' ? input.value.replace(/\D/g, '').length > 1 : input.value.trim();
      if (typed) continue; // keep what the visitor typed
      input.value = make();
      check(input);
    }
    status.classList.remove('is-error');
    status.textContent = '';
  }
  const labelOf = (input) => $(`label[for="${input.id}"]`, f)?.firstChild.textContent.trim() || input.name;

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = $$('.field input', f).filter((i) => !check(i));
    const agreed = pd.checked;
    setConsent(agreed);
    if (invalid.length || !agreed) {
      // one polite summary instead of a burst of alerts; focus the first problem
      const names = invalid.map(labelOf);
      if (!agreed) names.push('согласие на обработку данных');
      status.textContent = `Проверьте: ${names.join(', ')}`;
      status.classList.add('is-error');
      (invalid[0] || pd).focus();
      return;
    }
    status.classList.remove('is-error');
    submit.disabled = true;
    label.textContent = 'Проверяем…';
    status.textContent = '';
    await new Promise((r) => setTimeout(r, 700));
    f.reset();
    f.classList.add('is-sent');
    document.documentElement.classList.add('lead-sent');
    document.dispatchEvent(new CustomEvent('lead:sent'));
    label.textContent = 'Демо-режим';
    status.textContent = 'Это прототип: заявка не отправлена, данные нигде не сохраняются.';
  });
}

/* ------------------------------------------------------------------ boot */
const boot = () => {
  reveals();
  tourWatch();
  form();
  terminal();
  ScrollTrigger.refresh();
};
document.fonts?.ready ? document.fonts.ready.then(boot) : addEventListener('load', boot);
