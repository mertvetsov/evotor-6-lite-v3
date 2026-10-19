import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3, Color,
  MeshPhysicalMaterial, MeshStandardMaterial, TextureLoader, SRGBColorSpace,
  BufferAttribute, PMREMGenerator, DirectionalLight, MathUtils, NeutralToneMapping, CanvasTexture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createReceipt } from './receipt.js';
import { gsap } from 'gsap';

const MODEL_PATH = 'models/terminal.glb';
const SCREENS = ['img/screen-tex-0.jpg', 'img/screen-tex-1.jpg', 'img/screen-tex-2.jpg'];
const SCREEN_HOLD = 3.8; // seconds a screen stays before the next one wipes in

// Pose from the mockup: standing, leaning right, screen toward the viewer,
// printer hump peeking out on the right.
const POSE = { x: -0.22, y: -0.5, z: -0.42 };

export async function mountTerminal(stage, {
  reduced = false,
  pose = POSE,
  swayY = [0.55, -0.35], // rotation.y added at scroll progress 0 → 1
  swayX = [0.18, -0.12],
  getProgress = null,    // optional () => 0..1 to drive the pose instead of the stage's own scroll position
  distance = 6.2,
  assetBase = './',      // where public/ lives relative to the page
  drive = null,          // optional () => { rx, ry, rz, x, y, s }: an external choreography owns the pose
  interactive = true,    // drag to rotate, tap to flip screens
  pointerTarget = null,  // element (or window) whose pointer position adds a gentle tilt
  look = 'default',      // 'studio': dark-stage key/rim lighting
  onScreen = null,       // (index) => void, called when a screen starts wiping in
} = {}) {
  const canvas = stage.querySelector('canvas');
  const isTouch = matchMedia('(hover: none)').matches;
  const small = Math.min(screen.width, screen.height) < 768;

  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' })
    || canvas.getContext('webgl', { alpha: true, antialias: true });
  if (!gl) throw new Error('WebGL unavailable');

  const renderer = new WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  const maxDpr = small ? 1.5 : 2;
  let dpr = Math.min(devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  // soft warm key from above (a hint of the mockup's orange glow without tinting the grey body), cool fill from the left
  const key = new DirectionalLight(new Color('#ffd6b8'), 2.4);
  key.position.set(0.8, 4, 1.2);
  const fill = new DirectionalLight(new Color('#cfe0ff'), 1.1);
  fill.position.set(-3, 0.5, 2.5);
  const rim = new DirectionalLight(new Color('#ffb36b'), 2.2);
  rim.position.set(1.5, 2, -3);
  scene.add(key, fill, rim);
  // light the screen throws onto the body when the success screen fires (driven by setAccent)
  const screenGlow = new DirectionalLight(new Color('#7dffc0'), 0);
  screenGlow.position.set(-0.8, 0.6, 3.2);
  scene.add(screenGlow);
  let edge = null;
  if (look === 'light') {
    // bright product-shot lighting for a pale page: big soft key, gentle peach
    // rim and a lavender edge so the grey body separates from the background
    key.color.set('#ffffff'); key.intensity = 2.2; key.position.set(1.2, 3.5, 3.5);
    fill.color.set('#f1f3ff'); fill.intensity = 1.4; fill.position.set(-2.5, 0.8, 4);
    rim.color.set('#ff9a66'); rim.intensity = 2.4; rim.position.set(-3, 1.5, -2.5);
    edge = new DirectionalLight(new Color('#b9b2ff'), 1.8);
    edge.position.set(3.2, 2, -2);
    scene.add(edge);
    scene.environmentIntensity = 1.0;
    renderer.toneMappingExposure = 1.02;
  }
  if (look === 'studio') {
    // product-shot lighting for a dark stage: a soft white key from above-front,
    // an orange rim from behind-left and a cool edge from behind-right
    key.color.set('#fff4ea'); key.intensity = 2.6; key.position.set(0.5, 3.5, 3);
    fill.color.set('#e8eeff'); fill.intensity = 1.5; fill.position.set(-1.2, 0.6, 4.5); // soft frontal fill so the bezel reads when facing the camera
    rim.color.set('#ff6a2b'); rim.intensity = 5.5; rim.position.set(-3, 1.5, -2.5);
    edge = new DirectionalLight(new Color('#bcd4ff'), 2.4);
    edge.position.set(3.2, 2, -2);
    scene.add(edge);
    scene.environmentIntensity = 0.55;
    renderer.toneMappingExposure = 1.12;
  }

  /* ------------------------------------------------ light that follows the cursor (desktop only)
     A soft studio "softbox" hovers in front of the device where the pointer is. The materials
     add its reflection in the shader (a broad Blinn highlight), so it glides over the clearcoat
     body and the screen glass like on a product page. Touch devices never enable it. */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const sheen = { uSheenPos: { value: new Vector3(0, 0, 3) }, uSheenOn: { value: 0 } };
  const cursor = { x: 0, y: 0, on: 0, seen: false, inside: true };
  if (finePointer && !reduced) {
    addEventListener('pointermove', (e) => {
      cursor.tx = (e.clientX / innerWidth - 0.5) * 2;
      cursor.ty = (e.clientY / innerHeight - 0.5) * 2;
      cursor.seen = true;
      cursor.inside = true;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => (cursor.inside = false));
  }
  const sheenWorld = new Vector3();
  let sheenAmount = 1; // set by drive().sh: the highlight is only wanted on the first screen
  function moveCursorLight(dt) {
    if (!finePointer || reduced) return;
    const k = Math.min(1, dt * 7);
    cursor.x += ((cursor.tx ?? 0) - cursor.x) * k;
    cursor.y += ((cursor.ty ?? 0) - cursor.y) * k;
    cursor.on += ((cursor.seen && cursor.inside ? 1 : 0) - cursor.on) * Math.min(1, dt * 3);
    // the pointer maps onto a plane in front of the device, about as wide as the visible stage
    const halfH = Math.tan((camera.fov / 2) * (Math.PI / 180)) * (camera.position.z - 2.6);
    sheenWorld.set(cursor.x * halfH * camera.aspect, -cursor.y * halfH, 2.6);
    camera.updateMatrixWorld();
    sheen.uSheenPos.value.copy(sheenWorld).applyMatrix4(camera.matrixWorldInverse); // view space
    sheen.uSheenOn.value = cursor.on * sheenAmount;
  }
  /** Add the cursor softbox reflection to a material: `sharp` = gloss, `strength` = brightness. */
  function addSheen(material, sharp, strength) {
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      prev?.call(material, shader, r);
      Object.assign(shader.uniforms, sheen, { uSheenSharp: { value: sharp }, uSheenStrength: { value: strength } });
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSheenPos;\nuniform float uSheenOn;\nuniform float uSheenSharp;\nuniform float uSheenStrength;')
        .replace('#include <opaque_fragment>', /* glsl */`
          if (uSheenOn > 0.001) {
            vec3 sp = -vViewPosition;
            vec3 L = normalize(uSheenPos - sp);
            vec3 Vd = normalize(vViewPosition);
            vec3 Hh = normalize(L + Vd);
            float spec = pow(max(dot(normal, Hh), 0.0), uSheenSharp);
            float fres = 0.6 + 0.4 * pow(1.0 - max(dot(normal, Vd), 0.0), 2.0);
            outgoingLight += vec3(1.0, 0.98, 0.96) * spec * fres * uSheenStrength * uSheenOn;
          }
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => `sheen-${material.type}-${material.uuid}`;
  }

  /* ------------------------------------------------ a working day ("До 12 часов")
     The key light becomes the sun: it rises on the left, crosses overhead and sets on the right,
     while every light shifts from warm morning through white noon to a violet-coral evening.
     `on` blends from the page's normal studio light, so the rest of the page is untouched. */
  const lights = [key, fill, rim, edge].filter(Boolean);
  const base = lights.map((l) => ({ color: l.color.clone(), intensity: l.intensity, position: l.position.clone() }));
  const baseExposure = renderer.toneMappingExposure;
  const DAY = {
    // tints stay soft: the light reads as morning or evening, the body stays RAL 7040 grey
    key: [['#ffdcb4', 2.5], ['#ffffff', 2.6], ['#ffc8bf', 2.2]],
    fill: [['#fff0e2', 1.4], ['#f1f3ff', 1.4], ['#dcd8ff', 1.4]],
    rim: [['#ffb26e', 2.8], ['#ffd9c0', 1.8], ['#b297ff', 3.0]],
    edge: [['#ffe2bd', 1.6], ['#cfe0ff', 1.8], ['#ff8dbb', 2.4]],
    exposure: [1.04, 1.06, 0.97],
  };
  const tmp = new Color();
  const tmpB = new Color();
  const pick = (stops, t) => {
    const [a, b] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return [tmp.set(a[0]).lerp(tmpB.set(b[0]), k), a[1] + (b[1] - a[1]) * k];
  };
  let dayKey = '';
  function applyDay(t, on) {
    const id = `${t.toFixed(3)}|${on.toFixed(3)}`;
    if (id === dayKey) return;
    dayKey = id;
    const names = ['key', 'fill', 'rim', 'edge'];
    lights.forEach((l, i) => {
      const b = base[i];
      const [c, k] = pick(DAY[names[i]], t);
      l.color.copy(b.color).lerp(c, on);
      l.intensity = b.intensity + (k - b.intensity) * on;
      l.position.copy(b.position);
    });
    // the sun's arc: left horizon → overhead → right horizon, always a little in front
    const a = Math.PI * (1 - (0.1 + 0.8 * t));
    const sun = new Vector3(Math.cos(a) * 4.2, Math.sin(a) * 3.6 + 0.4, 2.6);
    key.position.lerp(sun, on);
    const e = DAY.exposure;
    const ex = t < 0.5 ? e[0] + (e[1] - e[0]) * t * 2 : e[1] + (e[2] - e[1]) * (t - 0.5) * 2;
    renderer.toneMappingExposure = baseExposure + (ex - baseExposure) * on;
  }

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0, distance);

  /* ------------------------------------------------ load */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new TextureLoader();
  const loadTex = (url) => texLoader.loadAsync(url).then((t) => {
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  });
  const [gltf, ...textures] = await Promise.all([loader.loadAsync(assetBase + MODEL_PATH), ...SCREENS.map((s) => loadTex(assetBase + s))]);

  /* ------------------------------------------------ materials */
  const body = new MeshPhysicalMaterial({
    color: new Color('#9da3a6'), roughness: 0.42, metalness: 0.0, // RAL 7040 Window grey
    clearcoat: 0.35, clearcoatRoughness: 0.3,
  });
  const dark = new MeshPhysicalMaterial({ color: new Color('#16191d'), roughness: 0.42, clearcoat: 0.3 });
  const rubber = new MeshStandardMaterial({ color: new Color('#7d8487'), roughness: 0.85 });
  const accent = new MeshPhysicalMaterial({ color: new Color('#ff4a17'), roughness: 0.4, clearcoat: 0.6 });
  const glass = new MeshPhysicalMaterial({ color: new Color('#0b0d10'), roughness: 0.05, clearcoat: 1, metalness: 0.2 });
  const lens = new MeshPhysicalMaterial({ color: new Color('#1d2a38'), roughness: 0.08, clearcoat: 1, metalness: 0.4 });

  const uniforms = { uMapB: { value: textures[1] }, uProgress: { value: 0 } };
  const screenMat = new MeshPhysicalMaterial({
    color: new Color('#000000'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
    emissive: new Color('#ffffff'), emissiveIntensity: 1, emissiveMap: textures[0],
  });
  screenMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMapB;\nuniform float uProgress;')
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #ifdef USE_EMISSIVEMAP
          vec2 suv = vEmissiveMapUv;
          vec3 a = texture2D(emissiveMap, suv).rgb;
          vec3 b = texture2D(uMapB, suv).rgb;
          // diagonal wipe from top to bottom with a soft lit seam
          float d = (1.0 - suv.y) * 0.86 + suv.x * 0.14;
          float p = uProgress * 1.24 - 0.12;
          float m = 1.0 - smoothstep(p - 0.06, p, d);
          float seam = smoothstep(0.07, 0.0, abs(d - p + 0.03)) * step(0.001, uProgress) * step(uProgress, 0.999);
          vec3 col = mix(a, b, m) + seam * vec3(1.0, 0.62, 0.35) * 0.55;
          totalEmissiveRadiance *= col * 0.92;
        #endif
      `);
  };

  if (finePointer && !reduced) {
    // kept subtle: a glint, not a wash (at 1.7 the whole screen went milky)
    addSheen(body, 14, 0.18);       // satin plastic: a wide, soft glow
    addSheen(dark, 36, 0.35);
    addSheen(screenMat, 70, 0.55);  // glass: a tighter streak that reads on the dark screen
    addSheen(glass, 70, 0.5);
  }

  const byMaterial = {
    Plastic: body, Black_Plastic: dark, Rubber: rubber, 'mat_2.001': accent,
    Glass: glass, Black_Glass: glass, 'Glass.001': lens,
  };

  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (/FRONT_SCREEN/.test(o.name) || /FRONT_SCREEN/.test(o.parent?.name)) {
      planarScreenUV(o.geometry);
      o.material = screenMat;
      return;
    }
    o.material = byMaterial[o.material?.name] || body;
  });

  // center, lay the screen toward the camera (+Y → +Z) and scale to ~2.6 units tall
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  model.position.sub(center);
  const oriented = new Group();
  oriented.add(model);
  oriented.rotation.x = Math.PI / 2;
  oriented.scale.setScalar(2.6 / size.z);

  const rig = new Group(); // scroll + drag + float
  rig.add(oriented);
  scene.add(rig);
  // receipt paper from the printer slot (rig-local, so it follows every pose)
  const receipt = createReceipt({ anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  rig.add(receipt.mesh);
  if (import.meta.env?.DEV) window.__term = { scene, rig, oriented, model, camera, renderer, receipt, textures, screenMat, uniforms, cursor, sheen, moveCursorLight, setSheenAmount: (v) => (sheenAmount = v), applyDay: (...a) => applyDay(...a) }; // dev-only handle for checks

  /* ------------------------------------------------ sizing */
  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // keep the whole device in frame on narrow/tall stages
    camera.position.z = camera.aspect < 0.9 ? distance / Math.max(camera.aspect, 0.6) * 0.9 : distance;
    camera.updateProjectionMatrix();

  };
  new ResizeObserver(resize).observe(stage);
  resize();

  /* ------------------------------------------------ interaction state */
  const state = {
    intro: reduced ? 1 : 0, // 0 → 1 entrance
    scroll: 0.5,
    dragX: 0, dragY: 0, velX: 0, velY: 0,
    hoverX: 0, hoverY: 0, hx: 0, hy: 0,
    dragging: false, lastInteract: 0,
  };

  const computeScroll = () => {
    if (getProgress) { state.scroll = MathUtils.clamp(getProgress(), 0, 1); return; }
    const r = stage.getBoundingClientRect();
    const vh = innerHeight;
    state.scroll = MathUtils.clamp((vh - r.top) / (vh + r.height), 0, 1);
  };

  let px = 0, py = 0, moved = 0;
  if (pointerTarget) {
    pointerTarget.addEventListener('pointermove', (e) => {
      state.hoverX = (e.clientX / innerWidth - 0.5) * 2;
      state.hoverY = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  if (interactive) stage.addEventListener('pointerdown', (e) => {
    state.dragging = true; moved = 0;
    px = e.clientX; py = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    state.hoverX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    state.hoverY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!state.dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    state.velX = dx * 0.009;
    state.velY = isTouch ? 0 : dy * 0.006;
    state.dragX += state.velX;
    state.dragY = MathUtils.clamp(state.dragY + state.velY, -0.6, 0.6);
    state.lastInteract = performance.now();
    stage.classList.remove('show-hint');
  });
  const release = (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (moved < 6) nextScreen(true); // a tap flips to the next screen
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', () => { state.hoverX = 0; state.hoverY = 0; });

  /* ------------------------------------------------ screens */
  let current = 0;
  let swapping = null;
  let holdTimer = 0;
  let pending = null;
  let driven = false;              // once the page picks screens itself, the timer stops
  const baseCount = textures.length;
  const live = [];                 // canvas screens that redraw while shown

  function showScreen(next, manual = false, instant = false, quick = false) {
    if (swapping && !instant && uniforms.uMapB.value === textures[next]) return; // already wiping to it
    // quick: a short wipe that starts right now — a wipe still running is finished at once instead of queueing
    if (quick && swapping) {
      const from = uniforms.uMapB.value;
      swapping.kill();
      swapping = null;
      pending = null;
      screenMat.emissiveMap = from;
      uniforms.uProgress.value = 0;
      current = textures.indexOf(from);
    }
    // a hard cut: no wipe, no queue (while the device is hidden)
    if (instant) {
      if (!textures[next]) return;
      swapping?.kill();
      swapping = null;
      pending = null;
      uniforms.uProgress.value = 0;
      if (screenMat.emissiveMap === textures[next] && current === next) return;
      screenMat.emissiveMap = textures[next];
      current = next;
      holdTimer = 0;
      onScreen?.(next);
      return;
    }
    if (swapping) { pending = next; return; }
    if (next === current || !textures[next]) return;
    uniforms.uMapB.value = textures[next];
    uniforms.uProgress.value = 0;
    holdTimer = 0;
    onScreen?.(next);
    swapping = gsap.to(uniforms.uProgress, {
      value: 1, duration: reduced ? 0.01 : quick ? 0.55 : manual ? 0.8 : 1.0, ease: quick ? 'power2.inOut' : 'power3.inOut',
      onComplete: () => {
        screenMat.emissiveMap = textures[next];
        uniforms.uProgress.value = 0;
        current = next;
        swapping = null;
        if (pending !== null) { const p = pending; pending = null; showScreen(p); }
      },
    });
  }
  function nextScreen(manual = false) {
    showScreen((current + 1) % baseCount, manual);
  }

  /* ------------------------------------------------ entrance */
  const playIntro = () => {
    if (reduced) return;
    gsap.fromTo(state, { intro: 0 }, { intro: 1, duration: 2.2, ease: 'expo.out' });
    if (interactive) setTimeout(() => stage.classList.add('show-hint'), 1800);
  };

  /* ------------------------------------------------ loop (only while visible) */
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let slowFrames = 0;
  const clock = { t: 0 };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    clock.t += dt;

    // adaptive resolution: drop DPR if the device can't hold ~50fps
    if (dt > 0.024) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 40 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      slowFrames = 0;
    }

    computeScroll();

    // inertia, then a gentle spring back to the authored pose
    if (!state.dragging) {
      state.velX *= 0.92; state.velY *= 0.9;
      state.dragX += state.velX; state.dragY += state.velY;
      if (now - state.lastInteract > 1400) {
        state.dragX = wrapNear(state.dragX) * (1 - dt * 1.6);
        state.dragY *= 1 - dt * 2;
      }
    }
    state.hx += (state.hoverX - state.hx) * Math.min(1, dt * 3);
    state.hy += (state.hoverY - state.hy) * Math.min(1, dt * 3);

    const s = state.scroll;
    const intro = state.intro;
    const float = reduced ? 0 : Math.sin(clock.t * 0.9) * 0.035;
    const sy = MathUtils.lerp(swayY[0], swayY[1], s);    // scroll turns it toward the viewer and past
    const sx = MathUtils.lerp(swayX[0], swayX[1], s);

    let skipRender = false;
    if (drive) {
      const d = drive(dt);
      skipRender = !!d.skip;
      if (d.screen != null) { driven = true; if (d.screen !== current || swapping) showScreen(d.screen, false, d.op < 0.05, !!d.cut); }
      // paper feeds in the second half of the approach, once the device has nearly turned
      receipt.setProgress(MathUtils.smoothstep(d.pr ?? 0, 0.35, 1));
      applyDay(d.dy ?? 0, d.dn ?? 0);
      sheenAmount = d.sh ?? 1;
      rig.rotation.set(
        d.rx + state.hy * 0.06 + (1 - intro) * 0.4,
        d.ry + state.hx * 0.12 + (1 - intro) * -Math.PI * 0.9,
        d.rz + float * 0.4,
        'YXZ'
      );
      rig.position.set(d.x, d.y + float - (1 - intro) * 0.6, 0);
      rig.scale.setScalar(d.s * (0.86 + intro * 0.14));
    } else rig.rotation.set(
      pose.x + sx + state.dragY + state.hy * 0.08 + (1 - intro) * 0.5,
      pose.y + sy + state.dragX + state.hx * 0.14 + (1 - intro) * -Math.PI * 1.1,
      pose.z + (1 - intro) * 0.35 + float * 0.6,
      'YXZ'
    );
    if (!drive) {
      rig.position.y = float - (1 - intro) * 0.9;
      rig.scale.setScalar(0.82 + intro * 0.18);
    }

    if (!driven && !reduced && !swapping && !state.dragging) {
      holdTimer += dt;
      if (holdTimer > SCREEN_HOLD) nextScreen();
    }
    // live canvas screens re-upload only while they are on (or wiping in)
    for (const l of live) {
      if ((screenMat.emissiveMap === l.tex || uniforms.uMapB.value === l.tex) && l.update(now)) l.tex.needsUpdate = true;
    }

    moveCursorLight(dt);
    if (!skipRender) renderer.render(scene, camera);
  };

  // the entrance plays on the first frame that is actually shown — a page opened
  // in a background tab would otherwise sit at the entrance's start pose
  let introPlayed = false;
  const start = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
    if (!introPlayed) { introPlayed = true; playIntro(); }
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !document.hidden) start();
    else stop();
  }, { threshold: 0.01 }).observe(stage);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));

  // compile shaders and paint one frame in the settled pose before revealing the
  // canvas, so even a throttled background tab shows the device the right way round
  renderer.compile(scene, camera);
  const settle = state.intro;
  state.intro = 1;
  computeScroll();
  if (drive) {
    const d = drive(1);
    rig.rotation.set(d.rx, d.ry, d.rz, 'YXZ');
    rig.position.set(d.x, d.y, 0);
    rig.scale.setScalar(d.s);
  } else {
    const s0 = state.scroll;
    rig.rotation.set(pose.x + MathUtils.lerp(swayX[0], swayX[1], s0), pose.y + MathUtils.lerp(swayY[0], swayY[1], s0), pose.z, 'YXZ');
  }
  state.intro = settle;
  renderer.render(scene, camera);
  stage.classList.add('is-3d');

  return {
    /** 0..1 — green light from the screen onto the device. */
    setAccent(v) { screenGlow.intensity = Math.max(0, v) * 3.2; },
    /** Register a canvas as an extra, live screen; returns its index for `drive().screen`. */
    addScreen(source, update) {
      const tex = new CanvasTexture(source);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.push(tex);
      live.push({ tex, update });
      return textures.length - 1;
    },
    /** Render one still in a given pose (used to bake the static fallback posters). */
    snapshot({ rx = 0, ry = 0, rz = 0, s = 1, screen = 0, pr = 0, width = 900, height = 1200 } = {}) {
      stop();
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = distance;
      camera.updateProjectionMatrix();
      screenMat.emissiveMap = textures[screen % textures.length];
      uniforms.uProgress.value = 0;
      receipt.setProgress(pr);
      rig.rotation.set(rx, ry, rz, 'YXZ');
      rig.position.set(0, 0, 0);
      rig.scale.setScalar(s);
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
  };
}

/** Bring an angle back to the nearest equivalent of 0 so the spring takes the short way. */
function wrapNear(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The screen mesh ships without UVs: project its local X/Z extent onto 0..1 (top of the device = top of the image). */
function planarScreenUV(geometry) {
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - min.x) / (max.x - min.x);
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - min.z) / (max.z - min.z);
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
}
