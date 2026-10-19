/* "Приложите карту" — the terminal waiting for payment next to the lead form.
   The page from the interface PDF (360×800), rendered at 2×, is the base;
   over it the violet–magenta gradient of the background slowly breathes,
   as if the screen is waiting for a card. */

const W = 720;
const H = 1600;
const K = W / 360;
const PERIOD = 2.4; // seconds per breath

// glow blobs in artboard units: violet top-left, magenta in the middle (where the PDF has them)
const BLOBS = [
  { x: 95, y: 110, r: 230, rgb: '150, 50, 255', shift: 0 },
  { x: 250, y: 280, r: 220, rgb: '255, 70, 160', shift: 0.18 },
];

export async function createPayScreen({ assetBase = './', reduced = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // onload rather than decode(): decode() can stall while the document is hidden
  const base = new Image();
  await new Promise((resolve, reject) => {
    base.onload = resolve;
    base.onerror = reject;
    base.src = `${assetBase}img/screen/pay-bg.webp`;
  });

  const glow = document.createElement('canvas');
  glow.width = W;
  glow.height = H;
  const gtx = glow.getContext('2d');
  const FADE = gtx.createLinearGradient(0, 0, 0, 330); // artboard units, used under scale(K)
  FADE.addColorStop(0, '#000');
  FADE.addColorStop(230 / 330, '#000');
  FADE.addColorStop(1, 'rgba(0, 0, 0, 0)');

  function draw(time) {
    const t = time / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    if (reduced) return;

    // the glow is drawn on its own layer, faded out above the QR / photo cards,
    // then laid over the screen in "screen" mode (lightens the colour, keeps white text white)
    gtx.setTransform(1, 0, 0, 1, 0, 0);
    gtx.globalCompositeOperation = 'source-over';
    gtx.clearRect(0, 0, W, H);
    gtx.scale(K, K);
    for (const b of BLOBS) {
      const p = (t / PERIOD + b.shift) % 1;
      const breath = Math.pow(0.5 - 0.5 * Math.cos(p * Math.PI * 2), 1.4); // 0 → 1 → 0, a little peaky
      const x = b.x + Math.sin(t * 0.6 + b.shift * 9) * 22;
      const y = b.y + Math.cos(t * 0.5 + b.shift * 9) * 16;
      const r = b.r * (0.75 + 0.5 * breath);
      const g = gtx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.rgb}, ${0.05 + 0.85 * breath})`);
      g.addColorStop(0.55, `rgba(${b.rgb}, ${0.02 + 0.42 * breath})`);
      g.addColorStop(1, `rgba(${b.rgb}, 0)`);
      gtx.fillStyle = g;
      gtx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    gtx.globalCompositeOperation = 'destination-in';
    gtx.fillStyle = FADE;
    gtx.beginPath();
    gtx.roundRect(0, 0, 360, 800, 24); // stay inside the screen's rounded corners
    gtx.fill();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(glow, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  let last = 0;
  function update(time) {
    if (time - last < 33) return false; // ~30 fps is plenty for a screen texture
    last = time;
    draw(time);
    return true;
  }

  /** Draw the screen at a given moment (for checks and stills). */
  function renderAt(seconds) { draw(seconds * 1000); }

  draw(0);
  return { canvas, update, renderAt };
}
