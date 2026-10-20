import { Vector3, Matrix3, Matrix4, MathUtils } from 'three';

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
  [/^_Scan_/, [0, 0.36, 0.06], 0.3],
  ['_Body_3', [0, 0, -0.62], 0],
  [/^_Rubber_/, [0, 0, -0.74], 0],
  ['_Body_4', [0, -0.06, -1.2], 0.14],
  ['_Body_5', [0, 0.5, -0.62], 0.2],
  [/^_Cam_|^_Paper_Cut_/, [0, 0.5, -0.62], 0.2],
];
const SPAN = 0.62; // each part travels over this share of the explode; the delays fill the rest

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** `model` must be inside `rig`, with the rig still at identity (called once, right after loading). */
export function createExplode(model, rig) {
  rig.updateMatrixWorld(true);
  const toRig = new Matrix4().copy(rig.matrixWorld).invert().multiply(model.matrixWorld);
  const rigToModel = new Matrix3().setFromMatrix4(toRig).invert(); // a travel vector into the parts' parent space
  const parts = [];
  const byName = new Map();
  model.traverse((o) => {
    if (!o.isMesh) return;
    byName.set(o.name, o);
    const spec = PARTS.find(([n]) => (typeof n === 'string' ? n === o.name : n.test(o.name)));
    if (!spec) return;
    const travel = new Vector3(...spec[1]).applyMatrix3(rigToModel);
    parts.push({ mesh: o, base: o.position.clone(), travel, delay: spec[2] });
  });

  let last = -1;
  const set = (ex) => {
    ex = MathUtils.clamp(ex, 0, 1);
    if (Math.abs(ex - last) < 1e-4) return;
    last = ex;
    for (const p of parts) {
      const k = easeInOut(MathUtils.clamp((ex - p.delay) / SPAN, 0, 1));
      p.mesh.position.copy(p.base).addScaledVector(p.travel, k);
    }
  };

  // label anchors: a point on a part (its local bounding-box centre, nudged) that rides with it
  const anchors = new Map();
  const tmp = new Vector3();
  const anchor = (id, name, nudge = [0, 0, 0]) => {
    const mesh = byName.get(name);
    if (!mesh) return;
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox.getCenter(new Vector3());
    const size = mesh.geometry.boundingBox.getSize(new Vector3());
    local.add(new Vector3(...nudge).multiply(size));
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

