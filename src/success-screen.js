import { gsap } from 'gsap';
import V from './success-vectors.json';

/* Animated "payment successful" screen for the terminal, drawn on a 2D canvas
   and used as a live texture. Layers come from the interface PDF (360×800):
   a text-free background raster plus vector paths for every label and the heart.
   It plays when the visitor submits the lead form — their "payment" goes through. */

const W = 720; // 2× the 360×800 artboard
const H = 1600;
const K = W / 360;
const HEART = { x: 180, y: 183 }; // heart centre in artboard units
const AMOUNT = 122310.74;
const SPARKS = 16;

export async function createSuccessScreen({ assetBase = './', reduced = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // onload rather than decode(): decode() can stall while the document is hidden (background tab)
  const bg = new Image();
  await new Promise((resolve, reject) => {
    bg.onload = resolve;
    bg.onerror = reject;
    bg.src = `${assetBase}img/screen/success-bg.webp`;
  });

  const path = Object.fromEntries(Object.entries(V).map(([k, d]) => [k, new Path2D(d)]));

  // sparks fly out of the heart along fixed, pleasantly uneven directions
  const sparks = Array.from({ length: SPARKS }, (_, i) => {
    const a = (i / SPARKS) * Math.PI * 2 + Math.sin(i * 7.3) * 0.25;
    return { a, d: 70 + ((i * 37) % 60), r: 1.6 + ((i * 13) % 5) * 0.5, delay: (i % 4) * 0.04 };
  });

  const FINAL = { heart: 1, flash: 0, ring: 1, ring2: 1, spark: 1, title: 1, label: 1, count: 1, vec: 1, line1: 1, line2: 1, pulse: 0 };
  const s = { ...FINAL };
  let tl = null;
  let beat = null;
  let dirty = true;
  const mark = () => (dirty = true);

  function play() {
    tl?.kill();
    beat?.kill();
    if (reduced) { Object.assign(s, FINAL); mark(); return; }
    Object.assign(s, { heart: 0, flash: 0, ring: 0, ring2: 0, spark: 0, title: 0, label: 0, count: 0, vec: 0, line1: 0, line2: 0, pulse: 0 });
    tl = gsap.timeline({ onUpdate: mark })
      .to(s, { flash: 1, duration: 0.14, ease: 'power2.out' }, 0.12)
      .to(s, { flash: 0, duration: 0.9, ease: 'power2.out' }, 0.26)
      .to(s, { heart: 1, duration: 1.0, ease: 'back.out(2.8)' }, 0.12)
      .to(s, { ring: 1, duration: 1.4, ease: 'power2.out' }, 0.2)
      .to(s, { ring2: 1, duration: 1.6, ease: 'power2.out' }, 0.42)
      .to(s, { spark: 1, duration: 1.5, ease: 'power3.out' }, 0.22)
      .to(s, { title: 1, duration: 0.8, ease: 'expo.out' }, 0.55)
      .to(s, { label: 1, duration: 0.6, ease: 'power2.out' }, 0.8)
      .to(s, { count: 1, duration: 1.3, ease: 'power3.out' }, 0.85)
      .to(s, { vec: 1, duration: 0.35, ease: 'power1.inOut' }, 2.1)
      .to(s, { line1: 1, duration: 0.8, ease: 'expo.out' }, 1.25)
      .to(s, { line2: 1, duration: 0.8, ease: 'expo.out' }, 1.37)
      .add(() => {
        // a calm double heartbeat every couple of seconds while the screen is shown
        beat = gsap.timeline({ repeat: -1, repeatDelay: 1.3, onUpdate: mark })
          .to(s, { pulse: 1, duration: 0.15, ease: 'power2.out' })
          .to(s, { pulse: 0, duration: 0.2, ease: 'power2.in' })
          .to(s, { pulse: 0.65, duration: 0.13, ease: 'power2.out' })
          .to(s, { pulse: 0, duration: 0.42, ease: 'power3.in' });
      }, 2.2);
  }

  function stop() {
    tl?.kill();
    beat?.kill();
    Object.assign(s, FINAL);
    mark();
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const money = (v) => `${Math.floor(v).toLocaleString('ru-RU')},${String(Math.round((v % 1) * 100) % 100).padStart(2, '0')} ₽`;

  function ring(p, base, grow, alpha, width) {
    if (p <= 0 || p >= 1) return;
    ctx.beginPath();
    ctx.arc(HEART.x, HEART.y, base + ease(p) * grow, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(225, 255, 240, ${alpha * (1 - p)})`;
    ctx.lineWidth = width * (1 - p * 0.6);
    ctx.stroke();
  }

  function draw(time) {
    const t = time / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#08090e';
    ctx.fillRect(0, 0, W, H);

    // background breathes: a slow drift and scale, never enough to reveal an edge
    const drift = reduced ? 0 : 1;
    ctx.save();
    ctx.translate(W / 2 + Math.sin(t * 0.21) * 10 * drift, H / 2 + Math.cos(t * 0.17) * 14 * drift);
    const sc = 1.05 + Math.sin(t * 0.13) * 0.015 * drift + s.pulse * 0.006;
    ctx.scale(sc, sc);
    ctx.drawImage(bg, -W / 2, -H / 2, W, H);
    ctx.restore();

    ctx.scale(K, K); // artboard units from here on

    // light behind the heart, swelling with each beat
    const glowR = 95 + s.pulse * 26 + s.ring * 12;
    const g = ctx.createRadialGradient(HEART.x, HEART.y, 6, HEART.x, HEART.y, glowR);
    g.addColorStop(0, `rgba(215, 255, 235, ${0.34 * s.heart + 0.18 * s.pulse})`);
    g.addColorStop(1, 'rgba(215, 255, 235, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(HEART.x - 150, HEART.y - 150, 300, 300);

    // two waves roll out when the payment lands
    ring(s.ring, 46, 150, 0.85, 3);
    ring(s.ring2, 46, 210, 0.55, 2);

    // sparks
    if (s.spark > 0 && s.spark < 1) {
      for (const sp of sparks) {
        const p = Math.min(1, Math.max(0, (s.spark - sp.delay) / (1 - sp.delay)));
        if (p <= 0) continue;
        const e = ease(p);
        const x = HEART.x + Math.cos(sp.a) * (40 + sp.d * e);
        const y = HEART.y + Math.sin(sp.a) * (40 + sp.d * e);
        const r = sp.r * (1 - p * 0.7);
        ctx.fillStyle = `rgba(240, 255, 248, ${0.95 * (1 - p)})`;
        ctx.beginPath(); // four-point star
        ctx.moveTo(x, y - r * 2.4); ctx.lineTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 2.4, y);
        ctx.lineTo(x + r * 0.6, y + r * 0.6); ctx.lineTo(x, y + r * 2.4); ctx.lineTo(x - r * 0.6, y + r * 0.6);
        ctx.lineTo(x - r * 2.4, y); ctx.lineTo(x - r * 0.6, y - r * 0.6); ctx.closePath();
        ctx.fill();
      }
    }

    // heart: larger than the source so it reads on a small turned device; white → lavender
    if (s.heart > 0) {
      ctx.save();
      const hs = Math.max(0.001, s.heart) * (1.22 + s.pulse * 0.1);
      ctx.translate(HEART.x, HEART.y);
      ctx.scale(hs, hs);
      ctx.translate(-HEART.x, -HEART.y);
      const hg = ctx.createLinearGradient(140, 148, 220, 218);
      hg.addColorStop(0, 'rgba(255, 255, 255, 1)');
      hg.addColorStop(1, 'rgba(236, 240, 255, 0.38)');
      ctx.globalAlpha = Math.min(1, s.heart * 1.4);
      ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      ctx.shadowBlur = (20 + s.pulse * 14) * K;
      ctx.fillStyle = hg;
      ctx.fill(path.heart);
      // a glossy highlight across the top-left lobe
      ctx.shadowBlur = 0;
      const gl = ctx.createLinearGradient(150, 150, 180, 185);
      gl.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.ellipse(160, 162, 14, 8, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.96;
    ctx.fill(path.status);

    const rise = (p, dy, layer, clip) => {
      if (p <= 0) return;
      ctx.save();
      if (clip) { ctx.beginPath(); ctx.rect(...clip); ctx.clip(); }
      ctx.globalAlpha = Math.min(1, p * 1.2);
      ctx.translate(0, (1 - ease(p)) * dy);
      ctx.fill(layer);
      ctx.restore();
    };
    rise(s.title, 26, path.title);
    rise(s.label, 10, path.label);

    // the amount counts up, then hands over to the original vector lettering
    if (s.count > 0 && s.vec < 1) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.count * 2) * (1 - s.vec);
      ctx.fillStyle = '#fff';
      ctx.font = '500 38px "Onest Variable", "Onest", system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(money(AMOUNT * ease(s.count)), 31, 514);
      ctx.restore();
    }
    if (s.vec > 0) {
      ctx.save();
      ctx.globalAlpha = s.vec;
      ctx.fill(path.amount);
      ctx.restore();
    }

    // "Спасибо" / "за покупку" share one path: reveal each line through its own band
    rise(s.line1, 18, path.thanks, [0, 560, 360, 44]);
    rise(s.line2, 18, path.thanks, [0, 604, 360, 44]);

    // a white flash the moment the payment goes through
    if (s.flash > 0) {
      ctx.globalAlpha = 1;
      const f = ctx.createRadialGradient(HEART.x, HEART.y, 0, HEART.x, HEART.y, 420);
      f.addColorStop(0, `rgba(235, 255, 245, ${0.75 * s.flash})`);
      f.addColorStop(1, `rgba(235, 255, 245, ${0.15 * s.flash})`);
      ctx.fillStyle = f;
      ctx.fillRect(0, 0, 360, 800);
    }
    ctx.globalAlpha = 1;
  }

  /** Called by the 3D loop while this screen is on; returns true when the texture must re-upload. */
  let last = 0;
  function update(time) {
    if (!dirty && time - last < 33) return false; // background drift redraws at ~30 fps
    last = time;
    dirty = false;
    draw(time);
    return true;
  }

  /** Freeze the intro at `seconds` and draw it (for checks and stills, independent of frame rate). */
  function renderAt(seconds) {
    play();
    tl?.pause().time(seconds);
    beat?.pause();
    draw(seconds * 1000);
  }

  draw(0);
  return { canvas, play, stop, update, renderAt };
}
