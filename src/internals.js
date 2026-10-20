import {
  Group, Mesh, InstancedMesh, CylinderGeometry, BoxGeometry, PlaneGeometry, TubeGeometry, MeshStandardMaterial, MeshPhysicalMaterial,
  CanvasTexture, SRGBColorSpace, Color, Matrix4, CatmullRomCurve3, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* Illustrative insides for the exploded view: the model is only a shell. Not the real layout of
   the Evotor 6 lite — a clean, slightly abstract product-render version that fits the measured cavities.
   Rig units (the device is 2.6 tall ≈ 184 mm, so 1 unit ≈ 71 mm), screen toward +Z, printer on the back.
   Cavities (raycast): printer hump x ±0.55, y 0.24…1.25, z −0.36…0.2; handle x ±0.44, y −1.21…0.2, z 0…0.2. */

const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/** The end of the paper roll: faint winding rings and the cardboard core. */
function rollEnd() {
  return canvas(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f7f6f3';
    g.fillRect(0, 0, w, w);
    for (let r = 34; r < c; r += 3) {
      g.strokeStyle = `rgba(120, 110, 100, ${0.05 + 0.05 * Math.random()})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#c49a6c'; // cardboard core
    g.beginPath(); g.arc(c, c, 32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2f26';
    g.beginPath(); g.arc(c, c, 22, 0, Math.PI * 2); g.fill();
  });
}

/** The board's face: solder mask, copper traces, gold pads and white silkscreen. UV v runs bottom → top. */
function boardArt() {
  return canvas(512, 1200, (g, w, h) => {
    g.fillStyle = '#1d6b45';
    g.fillRect(0, 0, w, h);
    // traces: right-angle runs with 45° joints, a little lighter than the mask
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = 'rgba(120, 200, 140, 0.35)';
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      g.lineWidth = rnd() < 0.2 ? 5 : 2;
      let x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        const len = 40 + rnd() * 160;
        const dir = Math.floor(rnd() * 4);
        if (dir === 0) x += len; else if (dir === 1) x -= len; else if (dir === 2) y += len; else y -= len;
        const d = 18 * (rnd() < 0.5 ? -1 : 1);
        g.lineTo(x, y); x += d; y += d; g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#d9b06a';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); // a via
    }
    // gold pads along the edges and mounting holes in the corners
    g.fillStyle = '#d9b06a';
    for (let i = 0; i < 16; i++) g.fillRect(470, 300 + i * 22, 22, 10);
    for (const [x, y] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]]) {
      g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0d2b1c'; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d9b06a';
    }
    // silkscreen
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    g.font = '600 22px "Onest Variable", system-ui, sans-serif';
    g.fillText('MB-01  REV A', 40, h - 60);
    g.font = '500 16px "Onest Variable", system-ui, sans-serif';
    ['U1', 'U4', 'J2', 'C17', 'R8', 'SIM1'].forEach((t, i) => g.fillText(t, 60 + (i % 3) * 150, 200 + Math.floor(i / 3) * 520));
    g.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    g.lineWidth = 2;
    g.strokeRect(36, 130, 230, 200);
    g.strokeRect(300, 520, 170, 140);
  });
}

/** The battery's wrap: graphite with a brand-orange band and a few lines of fine print. */
function batteryLabel() {
  return canvas(512, 560, (g, w, h) => {
    g.fillStyle = '#23262c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f05023';
    g.fillRect(0, 70, w, 10);
    g.fillStyle = '#ffffff';
    g.font = '600 64px "Onest Variable", system-ui, sans-serif';
    g.fillText('Li-ion', 44, 190);
    g.fillStyle = 'rgba(255, 255, 255, 0.28)';
    for (let i = 0; i < 4; i++) g.fillRect(44, 250 + i * 34, [300, 360, 240, 320][i], 10);
    // small pictograms in the corner, like the usual certification marks
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 4;
    g.strokeRect(44, h - 130, 70, 70);
    g.beginPath(); g.arc(170, h - 95, 35, 0, Math.PI * 2); g.stroke();
  });
}

export function createInternals() {
  const paper = new MeshStandardMaterial({ color: new Color('#ffffff'), roughness: 0.9, emissive: new Color('#ffffff'), emissiveIntensity: 0.1 });
  const paperEnd = new MeshStandardMaterial({ map: rollEnd(), roughness: 0.85 });
  const rubber = new MeshStandardMaterial({ color: new Color('#1b1d21'), roughness: 0.7 });
  const metal = new MeshStandardMaterial({ color: new Color('#c9ced3'), roughness: 0.3, metalness: 1 });
  const brass = new MeshStandardMaterial({ color: new Color('#c9a25e'), roughness: 0.35, metalness: 1 });
  const head = new MeshPhysicalMaterial({ color: new Color('#3b3f46'), roughness: 0.45, clearcoat: 0.3 });
  const ceramic = new MeshStandardMaterial({ color: new Color('#e9e6df'), roughness: 0.6 });
  const cell = new MeshPhysicalMaterial({ color: new Color('#23262c'), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const wrap = new MeshPhysicalMaterial({ map: batteryLabel(), roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const kapton = new MeshStandardMaterial({ color: new Color('#c8802f'), roughness: 0.45, metalness: 0.1 });
  const solder = new MeshPhysicalMaterial({ color: new Color('#1d6b45'), roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const boardTop = new MeshPhysicalMaterial({ map: boardArt(), roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const shield = new MeshStandardMaterial({ color: new Color('#d3d7db'), roughness: 0.32, metalness: 1 });
  const chip = new MeshPhysicalMaterial({ color: new Color('#16181c'), roughness: 0.5, clearcoat: 0.2 });
  const connector = new MeshStandardMaterial({ color: new Color('#ece6d8'), roughness: 0.55 });
  const gold = new MeshStandardMaterial({ color: new Color('#d9b06a'), roughness: 0.3, metalness: 1 });
  const alu = new MeshStandardMaterial({ color: new Color('#b9c0c7'), roughness: 0.35, metalness: 0.9 });
  const passive = new MeshStandardMaterial({ color: new Color('#8a6d4e'), roughness: 0.6 });
  const glassy = new MeshPhysicalMaterial({ color: new Color('#1f3346'), roughness: 0.05, metalness: 0.3, clearcoat: 1 });
  const ledRed = new MeshStandardMaterial({ color: new Color('#ff3b2f'), emissive: new Color('#ff2a1a'), emissiveIntensity: 0.8 });
  const wireRed = new MeshStandardMaterial({ color: new Color('#c8372d'), roughness: 0.5 });
  const wireBlack = new MeshStandardMaterial({ color: new Color('#1b1d21'), roughness: 0.5 });

  const parts = [];
  const add = (name, mesh, x, y, z, travel, delay) => {
    mesh.name = name;
    mesh.position.set(x, y, z);
    parts.push({ mesh, travel, delay });
    return mesh;
  };

  /* printer: the paper roll (axis across the device), the platen roller with the thermal head
     right under the paper slot, and a small drive motor with its gear at the side */
  const roll = new Mesh(new CylinderGeometry(0.2, 0.2, 0.76, 64, 1), [paper, paperEnd, paperEnd]);
  roll.rotation.z = Math.PI / 2;
  add('_Roll', roll, 0, 0.62, -0.1, [0, 0.12, -0.56], 0.24);

  const printer = new Group();
  const platen = new Mesh(new CylinderGeometry(0.045, 0.045, 0.8, 32), rubber);
  platen.rotation.z = Math.PI / 2;
  platen.position.set(0, 0, 0.05);
  const bar = new Mesh(new BoxGeometry(0.8, 0.07, 0.05), head);
  bar.position.set(0, 0, -0.045);
  const strip = new Mesh(new BoxGeometry(0.72, 0.012, 0.004), ceramic); // the heating line, facing the paper
  strip.position.set(0, 0, -0.018);
  const shaft = new Mesh(new CylinderGeometry(0.012, 0.012, 0.9, 12), metal);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0, 0, 0.05);
  printer.add(platen, bar, strip, shaft);
  add('_Printer_Head', printer, 0, 1.06, -0.2, [0, 0.2, -0.42], 0.28);

  const motor = new Group();
  const can = new Mesh(new CylinderGeometry(0.06, 0.06, 0.15, 32), metal);
  can.rotation.z = Math.PI / 2;
  const gear = new Mesh(new CylinderGeometry(0.045, 0.045, 0.02, 18), brass);
  gear.rotation.z = Math.PI / 2;
  gear.position.x = -0.09;
  motor.add(can, gear);
  add('_Motor', motor, 0.43, 0.98, -0.02, [0.28, 0.12, -0.5], 0.3);

  /* battery: a flat pouch in the handle with a flex cable running up to the board */
  const battery = new Group();
  // sized to the measured handle with a margin: the back cover curves forward toward its edges
  // (inner face z ≈ 0 in the middle, 0.016 at x ±0.3, 0.07 at ±0.4) and toward the bottom (below y −1.05)
  const body = new Mesh(new RoundedBoxGeometry(0.6, 0.7, 0.1, 4, 0.025), cell);
  const label = new Mesh(new PlaneGeometry(0.52, 0.6), wrap);
  label.position.z = 0.0505; // on the face toward the screen: the side the camera sees in the exploded pose
  const flex = new Mesh(new BoxGeometry(0.14, 0.2, 0.008), kapton);
  flex.position.set(0.14, 0.44, 0.03);
  const plug = new Mesh(new BoxGeometry(0.18, 0.05, 0.03), head);
  plug.position.set(0.14, 0.55, 0.03);
  battery.add(body, label, flex, plug);
  add('_Battery', battery, 0, -0.65, 0.08, [0, 0, -0.55], 0.2);

  /* barcode scanner engine behind the top window (scan glass: y 1.2…1.25, z 0.06…0.18): a small block with
     a lens and two aimer LEDs looking up through the window, a flat flex that folds down toward the board and
     a pair of thin wires. Follows the glass up, a little behind it. */
  const scanner = new Group();
  const block = new Mesh(new RoundedBoxGeometry(0.34, 0.1, 0.13, 3, 0.015), head);
  const lens = new Mesh(new CylinderGeometry(0.03, 0.034, 0.03, 28), glassy);
  lens.position.set(0, 0.06, 0);
  const ring = new Mesh(new CylinderGeometry(0.042, 0.042, 0.012, 28), metal);
  ring.position.set(0, 0.052, 0);
  scanner.add(block, lens, ring);
  for (const x of [-0.11, 0.11]) {
    const led = new Mesh(new BoxGeometry(0.026, 0.012, 0.026), ledRed);
    led.position.set(x, 0.056, 0.02);
    scanner.add(led);
  }
  const route = (pts, r, mat) => new Mesh(new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), 32, r, 8, false), mat);
  // the flex: a flat ribbon folding down from the back of the block (a tube squashed flat along z)
  const ribbon = route([[0.06, -0.03, -0.06], [0.06, -0.1, -0.09], [0.04, -0.2, -0.07], [0.05, -0.3, -0.02]], 0.03, kapton);
  ribbon.scale.set(1, 1, 0.25);
  scanner.add(ribbon);
  scanner.add(route([[-0.12, -0.04, -0.03], [-0.15, -0.12, -0.06], [-0.12, -0.22, -0.02], [-0.16, -0.32, 0]], 0.007, wireRed));
  scanner.add(route([[-0.09, -0.04, -0.03], [-0.11, -0.13, -0.07], [-0.08, -0.23, -0.03], [-0.11, -0.33, -0.01]], 0.007, wireBlack));
  add('_Scan_Engine', scanner, 0, 1.1, 0.12, [0, 0.46, 0.05], 0.3);

  /* main board: lies on the face of the middle plate (the flat grey slab in the middle of the exploded stack),
     in the gap between the plate and the screen glass (z 0.229…0.366), and stays with the plate */
  const board = new Group();
  const pcb = new Mesh(new RoundedBoxGeometry(0.9, 1.96, 0.024, 3, 0.03), [solder, solder, solder, solder, boardTop, solder]);
  board.add(pcb);
  const top = 0.012; // the board's front face
  const put = (geo, mat, x, y, d) => { const m = new Mesh(geo, mat); m.position.set(x, y, top + d / 2); board.add(m); return m; };
  put(new BoxGeometry(0.42, 0.34, 0.045), shield, -0.08, 0.55, 0.045);      // processor + memory under a shield can
  put(new BoxGeometry(0.3, 0.24, 0.04), shield, 0.18, 0.08, 0.04);          // 4G modem can
  put(new BoxGeometry(0.16, 0.14, 0.02), chip, -0.22, 0.12, 0.02);          // flash
  put(new BoxGeometry(0.12, 0.12, 0.016), chip, 0.22, 0.6, 0.016);          // power management
  put(new BoxGeometry(0.28, 0.2, 0.022), metal, -0.16, -0.42, 0.022);       // SIM tray
  put(new BoxGeometry(0.24, 0.05, 0.022), chip, 0, 0.82, 0.022);             // display connector
  put(new BoxGeometry(0.16, 0.05, 0.03), connector, 0.18, -0.85, 0.03);     // battery connector
  put(new BoxGeometry(0.06, 0.16, 0.03), metal, -0.38, 0.3, 0.03);          // USB-C at the edge
  put(new BoxGeometry(0.12, 0.06, 0.012), gold, 0.3, -0.35, 0.012);         // antenna contacts
  put(new CylinderGeometry(0.035, 0.035, 0.03, 20).rotateX(Math.PI / 2), alu, 0.3, 0.38, 0.03); // a can capacitor
  // a scatter of tiny passives, as one instanced mesh
  const caps = new InstancedMesh(new BoxGeometry(0.022, 0.012, 0.01), passive, 120);
  const m4 = new Matrix4();
  let n = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const keepOut = [[-0.3, 0.38, 0.14, 0.72], [0.03, -0.04, 0.33, 0.2], [-0.3, -0.52, -0.02, -0.32]];
  while (n < 120) {
    const x = -0.36 + rnd() * 0.72, y = -0.88 + rnd() * 1.76;
    if (keepOut.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) continue;
    m4.makeRotationZ(rnd() < 0.5 ? 0 : Math.PI / 2).setPosition(x, y, top + 0.005);
    caps.setMatrixAt(n++, m4);
  }
  board.add(caps);
  add('_Board', board, 0, -0.2, 0.243, [0, 0, 0], 0); // kept clear of the seams at the sides and the top (raycast)

  return parts;
}
