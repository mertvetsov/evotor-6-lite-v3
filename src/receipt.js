import {
  Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial, CanvasTexture,
  SRGBColorSpace, DoubleSide, Color, MathUtils,
} from 'three';

/* A thermal-paper receipt that feeds out of the printer slot at the top of the terminal.
   Rig-local units (the device is ~2.6 tall, screen toward +Z, printer cover on the back, −Z).
   The strip is rebuilt on the CPU when its length changes: 96 rows × 7 columns is nothing. */

// the printer's paper slot: a narrow gap between the cover and the paper cutter (z −0.2007…−0.1963,
// x −0.45…+0.45, open deep inside, lips at y ≈ 1.247 / 1.257), measured by raycasting the model.
// The paper starts below the lips, so it visibly comes out of the slot.
const SLOT = { x: 0, y: 1.12, z: -0.1985 };
const LIP = 0.14;                   // paper hidden inside the slot before it clears the lips
const WIDTH = 0.72;                 // ≈ 2/3 of the device width, as on the real Evotor
const MAX_LEN = 1.55 + LIP;         // visible part: never longer than ~60% of the device
const TEX_LEN = 1.8;                // receipt length the texture covers (units)
const ROWS = 96;
const COLS = 7;
const CURL = 1.15;                  // curvature of paper off the roll (1/units), bending toward the back
const BOW = 0.018;                  // slight cross-curl across the width

export function createReceipt({ anisotropy = 4 } = {}) {
  const texture = new CanvasTexture(drawPaper());
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false; // v = 0 is the top of the canvas = the receipt's head, which comes out first
  texture.anisotropy = anisotropy;

  const material = new MeshStandardMaterial({
    color: new Color('#ffffff'), map: texture, roughness: 0.88, metalness: 0,
    side: DoubleSide,
    emissive: new Color('#ffffff'), emissiveIntensity: 0.12, // paper lets light through: stays white in shade
  });
  // print only on the outer face; the back of the paper is plain
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = diffuse;',
    );
  };

  const count = (ROWS + 1) * COLS;
  const position = new BufferAttribute(new Float32Array(count * 3), 3);
  const uv = new BufferAttribute(new Float32Array(count * 2), 2);
  const index = [];
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLS - 1; j++) {
      const a = i * COLS + j, b = a + 1, c = a + COLS, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('uv', uv);
  geometry.setIndex(index);

  const mesh = new Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;

  let shown = -1;
  /** 0..1 — how much paper is out. */
  function setProgress(p) {
    const len = MathUtils.clamp(p, 0, 1) * MAX_LEN;
    if (Math.abs(len - shown) < 1e-4) return;
    shown = len;
    mesh.visible = len > LIP * 0.5;
    if (!mesh.visible) return;

    // walk the centreline from the slot outwards: straight for a moment, then the roll's curl takes over
    let y = SLOT.y, z = SLOT.z, phi = 0; // phi: angle from +Y toward −Z; straight up out of the slot
    const ds = len / ROWS;
    for (let i = 0; i <= ROWS; i++) {
      const s = i * ds;
      if (i > 0) {
        const k = CURL * MathUtils.smoothstep(s, LIP + 0.06, LIP + 0.4); // curls only once it is out
        phi += k * ds;
        y += Math.cos(phi) * ds;
        z -= Math.sin(phi) * ds;
      }
      // normal of the strip in the YZ plane (points toward +Z at the slot)
      const ny = Math.sin(phi), nz = Math.cos(phi);
      const v = (len - s) / TEX_LEN; // the head of the receipt is at the tip
      for (let j = 0; j < COLS; j++) {
        const u = j / (COLS - 1);
        const x = (u - 0.5) * WIDTH;
        const bow = BOW * (1 - (2 * u - 1) ** 2) * MathUtils.smoothstep(s, LIP, LIP + 0.25);
        const n = (i * COLS + j);
        position.setXYZ(n, SLOT.x + x, y + ny * bow, z + nz * bow);
        uv.setXY(n, 1 - u, v); // printed face looks toward the back: mirror so the print reads
      }
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return { mesh, setProgress };
}

/* The receipt itself: pale thermal print, a few rows of items and a QR code.
   It is seen small and at an angle, so it only has to read as a receipt. */
function drawPaper() {
  const W = 512;
  const H = Math.round((W * TEX_LEN) / WIDTH);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  // a little fibre so the paper is not a flat colour
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(90, 95, 105, ${Math.random() * 0.035})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
  }

  const ink = 'rgba(28, 30, 34, 0.86)';
  g.fillStyle = ink;
  g.textBaseline = 'alphabetic';
  const mono = (size, weight = 500) => (g.font = `${weight} ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`);
  const centre = (text, y) => g.fillText(text, (W - g.measureText(text).width) / 2, y);
  const row = (l, r, y) => {
    g.fillText(l, 36, y);
    g.fillText(r, W - 36 - g.measureText(r).width, y);
  };
  const rule = (y) => {
    g.save();
    g.setLineDash([6, 6]);
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(36, y); g.lineTo(W - 36, y); g.stroke();
    g.restore();
  };

  let y = 90;
  mono(40, 800); centre('ЭВОТОР', y);
  y += 46; mono(22); centre('КАССОВЫЙ ЧЕК', y);
  y += 30; centre('ПРИХОД', y);
  y += 30; rule(y);
  mono(22);
  const items = [['Товар 1', '1 290,00'], ['Товар 2', '349,90'], ['Товар 3', '2 450,00'], ['Товар 4', '89,00']];
  for (const [l, r] of items) { y += 40; row(l, r, y); }
  y += 30; rule(y);
  y += 54; mono(30, 800); row('ИТОГ', '≡4 178,90', y);
  y += 40; mono(20); row('КАРТА', '4 178,90', y);
  y += 30; row('НДС не облагается', '', y);
  y += 26; rule(y);

  // QR code: a deterministic pseudo-random grid with the three finder squares
  const q = 25, cell = 9, qx = (W - q * cell) / 2, qy = y + 30;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const finder = (fx, fy) => {
    g.fillRect(qx + fx * cell, qy + fy * cell, 7 * cell, 7 * cell);
    g.clearRect(qx + (fx + 1) * cell, qy + (fy + 1) * cell, 5 * cell, 5 * cell);
    g.fillStyle = '#ffffff';
    g.fillRect(qx + (fx + 1) * cell, qy + (fy + 1) * cell, 5 * cell, 5 * cell);
    g.fillStyle = ink;
    g.fillRect(qx + (fx + 2) * cell, qy + (fy + 2) * cell, 3 * cell, 3 * cell);
  };
  for (let i = 0; i < q; i++) {
    for (let j = 0; j < q; j++) {
      const inFinder = (i < 8 && j < 8) || (i > q - 9 && j < 8) || (i < 8 && j > q - 9);
      if (!inFinder && rnd() > 0.52) g.fillRect(qx + i * cell, qy + j * cell, cell, cell);
    }
  }
  finder(0, 0); finder(q - 7, 0); finder(0, q - 7);

  y = qy + q * cell + 56;
  mono(24, 700); centre('СПАСИБО ЗА ПОКУПКУ', y);
  y += 34; mono(18); centre('19.10.2026  12:30', y);
  return c;
}
