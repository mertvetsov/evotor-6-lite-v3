import { Vector3, Matrix3, Matrix4, MathUtils, BufferAttribute } from 'three';

/* Exploded view of the terminal: every part slides out along its own axis, layer by layer.
   Travel is in rig units (the device is 2.6 tall, screen toward +Z, printer on the back, −Z).
   Layers, front to back: screen → black glass → front frame (with the side keys) → middle plate
   (stays put: it carries the top end with the logo and the scanner) → back frame → battery cover
   (leaves through the back frame's window) and the printer cover (up and back, with the cutter and camera). */
const PARTS = [
  // [name or RegExp, travel [x, y, z], delay 0..1]
  // outermost first, like a real teardown: each layer starts later and travels less than the one in
  // front of it, so it never overtakes it (the glass passing the screen, or the frame leaving before
  // the screen, made the screen look sunk into the body)
  ['_Screen', [0, 0, 1.55], 0],
  ['_Screen_Background', [0, 0, 1.22], 0.06],
  ['_Body_1', [0, 0, 0.78], 0.14],
  [/^_Button_|^_USB_/, [-0.3, 0, 0.78], 0.16],
  [/^_Scan_(Glass|Background)$/, [0, 0.72, 0.06], 0.24], // high enough for the scanner engine (internals.js) and its wires to hang clear of the body
  // back: the frame goes far enough for the roll and the battery (internals.js) to sit between it and the plate
  ['_Body_3', [0, 0, -1.05], 0],
  [/^_Rubber_/, [0, 0, -1.17], 0],
  ['_Body_4', [0, -0.06, -1.5], 0.08],
  ['_Body_5', [0, 0.55, -1.05], 0.1],
  [/^_Cam_|^_Paper_Cut_/, [0, 0.55, -1.05], 0.1],
];
// Flat filler faces to cut out of a part (rig space). The front frame carries a flat grey back wall
// right behind the screen (z ≈ 0.23, facing back): in the exploded view it covers the board. Sealed
// behind the screen and the glass, it is never seen on the assembled device, so it can simply go.
const STRIP = [['_Body_1', { z: [0.222, 0.236], nz: 0.9 }]];

const SPAN = 0.62; // each part travels over this share of the explode; the delays fill the rest

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** `model` must be inside `rig`, with the rig still at identity (called once, right after loading).
    `extras`: illustrative insides ({ mesh, travel, delay }) that live in rig space, hidden while assembled. */
export function createExplode(model, rig, extras = []) {
  rig.updateMatrixWorld(true);
  const toRig = new Matrix4().copy(rig.matrixWorld).invert().multiply(model.matrixWorld);
  const rigToModel = new Matrix3().setFromMatrix4(toRig).invert(); // a travel vector into the parts' parent space
  const parts = [];
  const byName = new Map();
  model.traverse((o) => {
    if (!o.isMesh) return;
    byName.set(o.name, o);
    const cut = STRIP.find(([n]) => n === o.name);
    if (cut) stripFaces(o, rig, cut[1]);
    const spec = PARTS.find(([n]) => (typeof n === 'string' ? n === o.name : n.test(o.name)));
    if (!spec) return;
    const travel = new Vector3(...spec[1]).applyMatrix3(rigToModel);
    parts.push({ mesh: o, base: o.position.clone(), travel, delay: spec[2] });
  });
  for (const e of extras) {
    rig.add(e.mesh);
    e.mesh.visible = false;
    byName.set(e.mesh.name, e.mesh);
    parts.push({ mesh: e.mesh, base: e.mesh.position.clone(), travel: new Vector3(...e.travel), delay: e.delay, inner: true });
  }

  let last = -1;
  const set = (ex) => {
    ex = MathUtils.clamp(ex, 0, 1);
    if (Math.abs(ex - last) < 1e-4) return;
    last = ex;
    for (const p of parts) {
      const k = easeInOut(MathUtils.clamp((ex - p.delay) / SPAN, 0, 1));
      p.mesh.position.copy(p.base).addScaledVector(p.travel, k);
      if (p.inner) p.mesh.visible = ex > 0.002; // sealed inside while assembled: no need to draw it
    }
  };

  // label anchors: a point on a part (its local bounding-box centre, nudged) that rides with it
  const anchors = new Map();
  const tmp = new Vector3();
  const anchor = (id, name, nudge = [0, 0, 0]) => {
    const mesh = byName.get(name);
    if (!mesh) return;
    let local;
    if (mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      local = mesh.geometry.boundingBox.getCenter(new Vector3());
      local.add(new Vector3(...nudge).multiply(mesh.geometry.boundingBox.getSize(new Vector3())));
    } else local = new Vector3(...nudge); // a group: the nudge is an offset from its origin, in its units
    anchors.set(id, { mesh, local });
  };
  /** Screen position (CSS px within the canvas) of an anchor, or null. */
  const project = (id, camera, width, height) => {
    const a = anchors.get(id);
    if (!a) return null;
    tmp.copy(a.local).applyMatrix4(a.mesh.matrixWorld).project(camera);
    return { x: (tmp.x + 1) * 0.5 * width, y: (1 - tmp.y) * 0.5 * height, behind: tmp.z > 1 };
  };
  /** How far a part has travelled (0..1) — labels show once their part is out. */
  const progressOf = (name) => {
    const p = parts.find((q) => q.mesh.name === name);
    return p ? easeInOut(MathUtils.clamp((last - p.delay) / SPAN, 0, 1)) : 0;
  };

  return { set, anchor, project, progressOf, get value() { return Math.max(0, last); } };
}


/** Drop the triangles of a mesh that lie flat (|normal.z| > nz) within a z band, in rig space. */
function stripFaces(mesh, rig, { z: [z0, z1], nz }) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const index = g.index;
  if (!index) return;
  mesh.updateMatrixWorld(true);
  const m = new Matrix4().copy(rig.matrixWorld).invert().multiply(mesh.matrixWorld);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), e = new Vector3();
  const keep = [];
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    a.fromBufferAttribute(pos, ia).applyMatrix4(m);
    b.fromBufferAttribute(pos, ib).applyMatrix4(m);
    c.fromBufferAttribute(pos, ic).applyMatrix4(m);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    const flat = Math.abs(n.z) > nz && Math.min(a.z, b.z, c.z) > z0 && Math.max(a.z, b.z, c.z) < z1;
    if (!flat) keep.push(ia, ib, ic);
  }
  const Arr = index.array.constructor;
  g.setIndex(new BufferAttribute(new Arr(keep), 1));
}
