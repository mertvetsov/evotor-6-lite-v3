/* "До 12 часов": a working day on the terminal's screen, scrubbed by the page.
   The sky behind the UI goes from morning to evening, the clock runs 08:00 → 20:00,
   a ring fills with the shift, and the battery in the status bar holds out to the end. */

const W = 720;
const H = 1600;
const K = W / 360;
const RING = { x: 180, y: 330, r: 112, w: 14 };
const START = 8 * 60;      // 08:00
const SHIFT = 12 * 60;     // 12 hours
const BATTERY_END = 24;    // % left after the shift

// three stops of the day: morning, noon, evening
const SKY_TOP = ['#f39a5a', '#4a8fe8', '#6d47e8'];
const SKY_BOTTOM = ['#3a2660', '#173468', '#140d30'];
const SUN = ['#ffe2b0', '#ffffff', '#ffc2d8'];

export function createShiftScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let day = 0;
  let dirty = true;

  const font = (weight, size) => `${weight} ${size}px "Onest Variable", "Onest", system-ui, sans-serif`;

  function draw() {
    const t = day;
    const minutes = START + Math.round((t * SHIFT) / 5) * 5;
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const battery = Math.round(100 - t * (100 - BATTERY_END));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix3(SKY_TOP, t));
    sky.addColorStop(0.75, mix3(SKY_BOTTOM, t));
    sky.addColorStop(1, mix3(SKY_BOTTOM, t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.scale(K, K);

    // the sun crosses the top of the screen on its own arc and warms the sky around it
    const a = Math.PI * (1 - (0.08 + 0.84 * t));
    const sx = 180 + Math.cos(a) * 150;
    const sy = 230 - Math.sin(a) * 150;
    const sun = mix3(SUN, t);
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 150);
    halo.addColorStop(0, withAlpha(sun, 0.55));
    halo.addColorStop(1, withAlpha(sun, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 360, 800);

    // status bar
    ctx.fillStyle = '#fff';
    ctx.font = font(500, 15);
    ctx.textBaseline = 'middle';
    ctx.fillText(clock, 22, 26);
    drawBattery(ctx, 296, 19, battery);
    ctx.font = font(500, 13);
    const pct = `${battery}%`;
    ctx.fillText(pct, 290 - ctx.measureText(pct).width, 26);

    // the shift ring
    ctx.lineCap = 'round';
    ctx.lineWidth = RING.w;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(RING.x, RING.y, RING.r, 0, Math.PI * 2);
    ctx.stroke();
    if (t > 0.002) {
      const end = -Math.PI / 2 + t * Math.PI * 2;
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = withAlpha(sun, 0.9);
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(RING.x, RING.y, RING.r, -Math.PI / 2, end);
      ctx.stroke();
      // a glowing head at the end of the arc
      const hx = RING.x + Math.cos(end) * RING.r;
      const hy = RING.y + Math.sin(end) * RING.r;
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(hx, hy, RING.w * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 12 hour ticks under the clock
    for (let i = 0; i < 12; i++) {
      const on = t * 12 > i + 0.5;
      ctx.fillStyle = on ? '#fff' : 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(RING.x - 55 + i * 10, RING.y + 42, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.font = font(600, 58);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(clock, RING.x - ctx.measureText(clock).width / 2, RING.y + 18);

    // a large battery under the ring, the same charge as the status bar
    drawBattery(ctx, 120, 520, battery, 3.9);
    ctx.fillStyle = '#fff';
    ctx.font = font(600, 30);
    const big = `${battery}%`;
    ctx.fillText(big, RING.x - ctx.measureText(big).width / 2, 620);
  }

  function drawBattery(c, x, y, level, k = 1) {
    const w = 26 * k, h = 13 * k, r = 3.5 * k;
    c.save();
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = 1.4 * k;
    roundRect(c, x, y, w, h, r);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    roundRect(c, x + w + 1.2 * k, y + h * 0.32, 2 * k, h * 0.36, 1 * k);
    c.fill();
    const inset = 2.2 * k;
    const fw = Math.max(0, (w - inset * 2) * (level / 100));
    c.fillStyle = level > 20 ? '#fff' : '#ffb36b';
    roundRect(c, x + inset, y + inset, fw, h - inset * 2, Math.max(0.5, r - inset * 0.6));
    c.fill();
    c.restore();
  }

  /** 0..1 — where in the shift we are. */
  function setDay(v) {
    const next = Math.min(1, Math.max(0, v));
    if (Math.abs(next - day) < 0.0005) return;
    day = next;
    dirty = true;
  }

  function update() {
    if (!dirty) return false;
    dirty = false;
    draw();
    return true;
  }

  draw();
  return { canvas, setDay, update };
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Blend across three stops (0 → 0.5 → 1). */
export function mix3(stops, t) {
  const [a, b] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(', ')})`;
}
function withAlpha(rgb, a) {
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
}
