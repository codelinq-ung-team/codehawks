import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { visibleQuestions, defaultAnswers, sampleAnswers, compute, fmt, saveToStorage, loadFromStorage } from './model.js';

// =====================================================================
// Advisor3D: an immersive walk-through of the LinqLife needs assessment.
// No flat windows: every question is a 3D scene you stand inside.
// =====================================================================

const state = { stage: 'home', qi: 0, answers: defaultAnswers() };
const C = { income: 0x4f8cff, debts: 0xff9f43, funeral: 0xa86bff, resources: 0x2ecc9a, existing: 0x19b5c9, gap: 0xff5c6c, gold: 0xffc94f, pink: 0xff6fa3 };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 80);
camera.position.set(0, 1.6, 1.3);
camera.lookAt(0, 1.4, -2.5);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20264a, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(3, 6, 2);
scene.add(sun);

// ---------- sound (tiny synthesized cues, no assets) ----------
let actx;
function blip(freq = 660, dur = 0.09, vol = 0.05) {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    const now = actx.currentTime;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(actx.destination);
    o.start(now);
    o.stop(now + dur);
  } catch { /* audio unavailable */ }
}

// ---------- helpers ----------
const col = (hex) => new THREE.Color(hex);
const standard = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: color, emissiveIntensity: 0.22, ...o });

function makeLabel(w, h, px = 260) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * px);
  canvas.height = Math.round(h * px);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.userData.label = { canvas, tex, px };
  return mesh;
}

// lines: [{ text, size (meters of text height), color, weight, italic }]
function setLabel(mesh, lines, { pill = 0, align = 'center' } = {}) {
  const { canvas, tex, px } = mesh.userData.label;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (pill) {
    ctx.fillStyle = `rgba(10,16,40,${pill})`;
    const r = Math.min(canvas.height / 2, 60);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  const maxW = canvas.width * 0.9;
  const rows = [];
  for (const ln of lines) {
    const fpx = ln.size * px;
    ctx.font = `${ln.italic ? 'italic ' : ''}${ln.weight ?? 600} ${fpx}px system-ui, -apple-system, sans-serif`;
    const words = String(ln.text).split(' ');
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) { rows.push({ t: cur, ln, fpx }); cur = w; } else cur = test;
    }
    rows.push({ t: cur, ln, fpx });
  }
  const total = rows.reduce((s, r) => s + r.fpx * 1.2, 0);
  let y = (canvas.height - total) / 2;
  const x = align === 'center' ? canvas.width / 2 : canvas.width * 0.05;
  for (const r of rows) {
    y += r.fpx * 1.05;
    ctx.font = `${r.ln.italic ? 'italic ' : ''}${r.ln.weight ?? 600} ${r.fpx}px system-ui, -apple-system, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = r.fpx * 0.12;
    ctx.fillStyle = r.ln.color ?? '#ffffff';
    ctx.fillText(r.t, x, y);
    y += r.fpx * 0.15;
  }
  tex.needsUpdate = true;
}

function faceCenter(obj, y = obj.position.y) {
  obj.lookAt(0, y, 0);
}

function makeFigure(h, color, ghost = false) {
  const g = new THREE.Group();
  const mat = standard(color, { transparent: ghost, opacity: ghost ? 0.28 : 1, emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.1, h * 0.42, 6, 12), mat);
  body.position.y = h * 0.33;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.075, 18, 14), standard(0xf2d1b3, { transparent: ghost, opacity: ghost ? 0.28 : 1, emissiveIntensity: 0.1 }));
  head.position.y = h * 0.76;
  g.add(body, head);
  return g;
}

function makeHouse(s = 1, wall = 0xe9e2d0, roofC = 0xd9534f, lit = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2 * s, 1.5 * s, 1.8 * s), new THREE.MeshStandardMaterial({ color: wall, roughness: 0.8 }));
  body.position.y = 0.75 * s;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7 * s, 1.0 * s, 4), new THREE.MeshStandardMaterial({ color: roofC, roughness: 0.7 }));
  roof.position.y = 1.5 * s + 0.5 * s;
  roof.rotation.y = Math.PI / 4;
  g.add(body, roof);
  const wMat = new THREE.MeshBasicMaterial({ color: lit ? 0xffd27a : 0x2a3350 });
  for (const x of [-0.6, 0.6]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.4 * s, 0.4 * s), wMat);
    w.position.set(x * s, 0.95 * s, 0.91 * s);
    g.add(w);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.4 * s, 0.7 * s), new THREE.MeshBasicMaterial({ color: 0x5b3a29 }));
  door.position.set(0, 0.35 * s, 0.91 * s);
  g.add(door);
  return g;
}

// ---------- world: sky, ground, neighborhood, fireflies ----------
const environment = new THREE.Group();
scene.add(environment);

const skyU = { top: { value: col(0x0b1230) }, bottom: { value: col(0x2f4aa0) } };
const skyTarget = { top: col(0x0b1230), bottom: col(0x2f4aa0) };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(60, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.55)), 1.0); }',
  }),
);
sky.renderOrder = -10;
environment.add(sky);
const setMood = (top, bottom) => { skyTarget.top.set(top); skyTarget.bottom.set(bottom); };

const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x131b3a, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
environment.add(ground);
const grid = new THREE.GridHelper(40, 80, 0x3a4a8a, 0x1b2550);
grid.position.y = 0.01;
environment.add(grid);

const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(500 * 3);
for (let i = 0; i < 500; i++) {
  const r = 45; const th = Math.random() * Math.PI * 2; const ph = Math.random() * Math.PI * 0.48;
  sp.set([r * Math.cos(th) * Math.sin(ph), r * Math.cos(ph) + 2, r * Math.sin(th) * Math.sin(ph)], i * 3);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
environment.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.35, fog: false, sizeAttenuation: true })));

// your house, front and slightly left, with neighbors and trees all around
const yourHouse = makeHouse(1.6, 0xf1e6cf, 0xd9534f, true);
yourHouse.position.set(-4.5, 0, -9);
yourHouse.rotation.y = 0.35;
environment.add(yourHouse);
const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2 + rng() * 0.3;
  const r = 12 + rng() * 6;
  const h = makeHouse(0.9 + rng() * 0.5, [0xd8d2c0, 0xc9d3e6, 0xe3cdb8][i % 3], [0x7a4b4b, 0x4b5f7a, 0x6a7a4b][i % 3], rng() > 0.4);
  h.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
  h.lookAt(0, 0, 0);
  environment.add(h);
}
const treeTrunk = new THREE.MeshStandardMaterial({ color: 0x4a3425 });
const treeLeaf = new THREE.MeshStandardMaterial({ color: 0x1f5a45, roughness: 0.9 });
for (let i = 0; i < 40; i++) {
  const a = rng() * Math.PI * 2;
  const r = 7 + rng() * 10;
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6), treeTrunk);
  trunk.position.y = 0.4;
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 7), treeLeaf);
  leaf.position.y = 1.5;
  t.add(trunk, leaf);
  t.scale.setScalar(0.8 + rng() * 0.9);
  t.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
  environment.add(t);
}

const FF = 160;
const ffBase = new Float32Array(FF * 3);
for (let i = 0; i < FF; i++) ffBase.set([(rng() - 0.5) * 12, 0.2 + rng() * 3.6, -rng() * 8 + 1.5], i * 3);
const ffGeo = new THREE.BufferGeometry();
ffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ffBase), 3));
const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xfff1a8, size: 0.05, transparent: true, opacity: 0.85, fog: false }));
scene.add(fireflies);

// ---------- interaction: rays, hover, select, drag ----------
let hitMeshes = [];
const registerHit = (mesh, i) => { mesh.userData.i = i; hitMeshes.push(mesh); return mesh; };

const rc = new THREE.Raycaster();
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const mouse = new THREE.Vector2();
const mouseRc = new THREE.Raycaster();

function makePointer(getRay, line) {
  return { getRay, line, hovered: null, dragging: null, active: true };
}

const pointers = [];
const handFactory = new XRHandModelFactory();
for (let n = 0; n < 2; n++) {
  const c = renderer.xr.getController(n);
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
  line.scale.z = 3;
  c.add(line);
  scene.add(c);
  const p = makePointer((ray) => {
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  }, line);
  p.object = c;
  c.addEventListener('selectstart', () => pointerDown(p));
  c.addEventListener('selectend', () => pointerUp(p));
  pointers.push(p);
  scene.add(renderer.xr.getControllerGrip(n));
  const hand = renderer.xr.getHand(n);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  scene.add(hand);
}
const mousePointer = makePointer((ray) => { mouseRc.setFromCamera(mouse, camera); ray.copy(mouseRc.ray); }, null);
mousePointer.isMouse = true;

function dragUpdate(p) {
  const i = p.dragging.userData.i;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(i.dragZ ?? -2));
  if (rc.ray.intersectPlane(plane, tmpV)) i.onDrag(tmpV);
}

function updatePointer(p) {
  p.getRay(rc.ray);
  if (p.dragging) { dragUpdate(p); return; }
  const hits = rc.intersectObjects(hitMeshes, false).filter((h) => h.object.userData.i.enabled !== false);
  const next = hits.length ? hits[0].object : null;
  if (next !== p.hovered) {
    p.hovered = next;
    if (next) blip(900, 0.04, 0.025);
  }
  if (p.line) p.line.scale.z = hits.length ? hits[0].distance : 3;
}

function pointerDown(p) {
  updatePointer(p);
  if (!p.hovered) return;
  const i = p.hovered.userData.i;
  blip(520, 0.12, 0.06);
  if (i.onDrag) { p.dragging = p.hovered; p.getRay(rc.ray); dragUpdate(p); } else i.onSelect?.();
}
function pointerUp(p) {
  if (p.dragging) { p.dragging.userData.i.onDragEnd?.(); p.dragging = null; }
}

renderer.domElement.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  updatePointer(mousePointer);
  renderer.domElement.style.cursor = mousePointer.hovered ? 'pointer' : 'default';
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerDown(mousePointer);
});
window.addEventListener('pointerup', () => pointerUp(mousePointer));

// ---------- reusable 3D widgets ----------
function makeButton(text, { w = 0.95, h = 0.3, color = 0x4f8cff, onSelect } = {}) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), standard(color, { emissiveIntensity: 0.4 }));
  const lab = makeLabel(w * 0.96, h * 0.8, 300);
  lab.position.z = 0.038;
  setLabel(lab, [{ text, size: h * 0.4, weight: 700 }]);
  g.add(box, lab);
  const api = { group: g, box, setEnabled(on) {
    box.userData.i.enabled = on;
    box.material.color.set(on ? color : 0x39425f);
    box.material.emissive.set(on ? color : 0x000000);
    lab.material.opacity = on ? 1 : 0.4;
  } };
  registerHit(box, { onSelect, hover: g, enabled: true });
  return api;
}

function progressRing(frac) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.95, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide })));
  const arc = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.02, 64, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.02, frac)), new THREE.MeshBasicMaterial({ color: 0x4f8cff, side: THREE.DoubleSide }));
  g.add(arc);
  g.rotation.x = -Math.PI / 2;
  g.position.y = 0.02;
  return g;
}

// ---------- stage lifecycle (with a quick fade between scenes) ----------
const stage = new THREE.Group();
scene.add(stage);
let stageTick = null;

const fade = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
fade.renderOrder = 999;
fade.visible = false;
camera.add(fade);
const fadeState = { t: 0, dir: 0, cb: null };
function transition(cb) {
  if (fadeState.dir !== 0) { cb(); return; }
  fadeState.dir = 1;
  fadeState.cb = cb;
}

function clearStage() {
  stage.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (m) { m.map?.dispose?.(); m.dispose?.(); }
  });
  stage.clear();
  hitMeshes = [];
  stageTick = null;
  for (const p of pointers) { p.hovered = null; p.dragging = null; }
  mousePointer.hovered = null;
  mousePointer.dragging = null;
}

function build() {
  clearStage();
  if (state.stage === 'home') buildHome();
  else if (state.stage === 'quiz') buildQuiz();
  else buildResults();
}

function go(next) {
  saveToStorage(state.answers);
  transition(() => { state.stage = next; build(); });
}

// ---------- HOME ----------
function buildHome() {
  setMood(0x2a1b5e, 0xff8a6b);

  const title = makeLabel(4.2, 1.7, 240);
  title.position.set(0, 2.55, -3.1);
  setLabel(title, [
    { text: 'LinqLife', size: 0.2, color: '#ff8fb8', weight: 700 },
    { text: 'Advisor3D', size: 0.62, weight: 800 },
    { text: 'Life insurance, made personal.', size: 0.19, color: '#ffe4d6', weight: 500, italic: true },
  ]);
  stage.add(title);

  const portal = new THREE.Group();
  portal.position.set(0, 1.25, -2.3);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.055, 16, 64), standard(C.pink, { emissiveIntensity: 0.9 }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.82, 48), new THREE.MeshBasicMaterial({ color: 0xff6fa3, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  const lab = makeLabel(1.4, 0.7, 260);
  lab.position.z = 0.02;
  setLabel(lab, [{ text: 'Begin', size: 0.27, weight: 800 }, { text: 'point and pinch', size: 0.1, color: '#ffd0e0', weight: 500 }]);
  portal.add(ring, disc, lab);
  stage.add(portal);
  registerHit(disc, { onSelect: () => { state.qi = 0; go('quiz'); }, hover: portal });

  const sample = makeButton('Try a sample family', { w: 1.5, h: 0.32, color: 0x3a4a8a, onSelect: () => { state.answers = { ...defaultAnswers(), ...sampleAnswers }; go('results'); } });
  sample.group.position.set(1.5, 0.95, -1.7);
  faceCenter(sample.group);
  stage.add(sample.group);

  const note = makeLabel(3.6, 0.3, 240);
  note.position.set(0, 0.35, -2.0);
  note.rotation.x = -0.9;
  setLabel(note, [{ text: 'Educational estimates only. Not financial, legal, or tax advice.', size: 0.075, color: '#ffe4d6', weight: 500 }]);
  stage.add(note);

  const fam = new THREE.Group();
  [[1.75, C.income, -0.6], [1.65, C.pink, -0.2], [1.1, C.gold, 0.2], [0.85, C.resources, 0.55]].forEach(([h, c, x]) => {
    const f = makeFigure(h, c);
    f.position.x = x;
    fam.add(f);
  });
  fam.position.set(-2.1, 0, -2.6);
  fam.rotation.y = 0.5;
  stage.add(fam);

  stageTick = (t) => {
    ring.rotation.z = t * 0.4;
    disc.material.opacity = 0.18 + 0.08 * Math.sin(t * 2);
    fam.children.forEach((f, i) => { f.position.y = Math.abs(Math.sin(t * 1.6 + i)) * 0.03; });
  };
}

// ---------- QUIZ ----------
function buildQuiz() {
  const vis = visibleQuestions(state.answers);
  state.qi = Math.min(state.qi, vis.length - 1);
  const q = vis[state.qi];
  setMood(0x0b1230, 0x2f4aa0 + (state.qi % 3) * 0x080800);

  stage.add(progressRing((state.qi + 1) / vis.length));

  const prompt = makeLabel(3.6, 1.15, 250);
  prompt.position.set(0, 2.7, -2.7);
  prompt.rotation.x = 0.12;
  setLabel(prompt, [
    { text: `${state.qi + 1} / ${vis.length}`, size: 0.09, color: '#9fb4ff', weight: 700 },
    { text: q.prompt, size: 0.17, weight: 700 },
    { text: q.help, size: 0.09, color: '#c4cff5', weight: 500 },
  ], { pill: 0.45 });
  stage.add(prompt);

  const isLast = state.qi === vis.length - 1;
  const next = makeButton(isLast ? 'See results' : 'Continue  →', { w: 1.1, h: 0.34, color: 0x2ecc9a, onSelect: () => {
    if (isLast) go('results'); else { state.qi += 1; go('quiz'); }
  } });
  next.group.position.set(1.4, 0.8, -1.3);
  faceCenter(next.group);
  stage.add(next.group);
  const back = makeButton('←  Back', { w: 0.9, h: 0.3, color: 0x3a4a8a, onSelect: () => {
    if (state.qi === 0) go('home'); else { state.qi -= 1; go('quiz'); }
  } });
  back.group.position.set(-1.4, 0.8, -1.3);
  faceCenter(back.group);
  stage.add(back.group);

  const tickers = [];
  if (q.type === 'single') {
    const answered = state.answers[q.id] !== undefined;
    next.setEnabled(answered);
    tickers.push(buildSingle(q));
  } else {
    tickers.push(buildNumber(q));
  }
  stageTick = (t, dt) => tickers.forEach((fn) => fn?.(t, dt));
}

function optionIcon(q, o, selected) {
  const g = new THREE.Group();
  if (q.id === 'marital') {
    const add = (h, c, x, ghost) => { const f = makeFigure(h, c, ghost); f.position.x = x; g.add(f); };
    if (o.value === 'Single') add(0.5, C.income, 0);
    else if (o.value === 'Married') { add(0.5, C.income, -0.09); add(0.47, C.pink, 0.09); }
    else if (o.value === 'Divorced') { add(0.5, C.income, -0.22); add(0.47, 0x8a8fa8, 0.22); }
    else { add(0.5, C.income, -0.12); add(0.47, 0xffffff, 0.14, true); }
    g.position.y = -0.22;
  } else if (q.id === 'horizon') {
    if (o.value === 'life') {
      const t = new THREE.Mesh(new THREE.TorusKnotGeometry(0.14, 0.04, 64, 8), standard(C.pink, { emissiveIntensity: 0.6 }));
      t.userData.spin = true;
      g.add(t);
    } else {
      const yrs = Number(o.value);
      const hh = 0.12 + (yrs / 30) * 0.4;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, hh, 16), standard(C.existing, { emissiveIntensity: 0.5 }));
      cyl.position.y = -0.22 + hh / 2;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      flame.position.y = -0.22 + hh + 0.06;
      g.add(cyl, flame);
    }
  } else {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), standard(selected ? C.resources : C.income)));
  }
  return g;
}

function buildSingle(q) {
  const a = state.answers;
  const n = q.options.length;
  const span = n === 1 ? 0 : Math.min(1.1, 0.38 * (n - 1));
  const R = 2.7;
  const items = [];
  q.options.forEach((o, idx) => {
    const ang = n === 1 ? 0 : -span / 2 + (span * idx) / (n - 1);
    const selected = a[q.id] === o.value;
    const grp = new THREE.Group();
    grp.position.set(Math.sin(ang) * R, 0, -Math.cos(ang) * R);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.55, 24), standard(0x24305f, { emissiveIntensity: 0.15 }));
    pedestal.position.y = 0.275;
    const orbMat = new THREE.MeshStandardMaterial({ color: selected ? 0x2ecc9a : 0x7fa2ff, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.2, emissive: selected ? 0x2ecc9a : 0x335, emissiveIntensity: selected ? 0.8 : 0.35 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 24), orbMat);
    orb.position.y = 1.05;
    const icon = optionIcon(q, o, selected);
    icon.position.y = 1.05;
    const lab = makeLabel(1.25, 0.55, 260);
    lab.position.y = 1.72;
    setLabel(lab, [
      { text: o.label, size: 0.13, weight: 700, color: selected ? '#7dffd0' : '#ffffff' },
      ...(o.description ? [{ text: o.description, size: 0.075, color: '#c4cff5', weight: 500 }] : []),
    ], { pill: 0.4 });
    grp.add(pedestal, orb, icon, lab);
    if (selected) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.025, 12, 48), new THREE.MeshBasicMaterial({ color: 0x2ecc9a }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.05;
      grp.add(halo);
    }
    grp.lookAt(0, 0, 0);
    stage.add(grp);
    registerHit(orb, { onSelect: () => { a[q.id] = o.value; blip(780, 0.15, 0.06); build(); }, hover: grp });
    items.push({ grp, icon });
  });
  return (t) => items.forEach(({ icon }, i) => icon.children.forEach((c) => { if (c.userData.spin) c.rotation.y = t * 1.2 + i; }));
}

const fmtValue = (q, v) => (q.unit === 'money' ? fmt(v) : q.unit === 'years' ? `${v} years` : `${v} ${v === 1 ? 'person' : 'people'}`);

function buildNumber(q) {
  const a = state.answers;
  const Y0 = 0.35;
  const LEN = 1.8;
  const RZ = -1.9;
  const rail = new THREE.Group();
  rail.position.set(1.15, 0, RZ);
  stage.add(rail);

  const track = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, LEN, 12), new THREE.MeshStandardMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.35 }));
  track.position.y = Y0 + LEN / 2;
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 12), standard(C.existing, { emissiveIntensity: 0.9 }));
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 18), standard(0xffffff, { emissiveIntensity: 0.7 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), standard(0x24305f));
  cap.position.y = Y0 - 0.02;
  rail.add(track, fill, handle, cap);
  for (let k = 0; k <= 4; k++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0x9fb4ff }));
    tick.position.y = Y0 + (LEN * k) / 4;
    rail.add(tick);
  }
  // tall invisible target so you can grab anywhere along the rail
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, LEN + 0.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = Y0 + LEN / 2;
  rail.add(hit);

  const valueLabel = makeLabel(2.6, 0.7, 250);
  valueLabel.position.set(-0.7, 2.15, -2.4);
  stage.add(valueLabel);

  const meta = makeMetaphor(q);
  meta.group.position.set(-0.6, 0, -2.4);
  stage.add(meta.group);

  const tFromValue = (v) => (v - q.min) / (q.max - q.min);
  let last = null;
  const setValue = (v, quiet) => {
    v = Math.min(q.max, Math.max(q.min, Math.round(v / q.step) * q.step));
    const t = tFromValue(v);
    a[q.id] = v;
    handle.position.y = Y0 + t * LEN;
    fill.scale.y = Math.max(0.001, t * LEN);
    fill.position.y = Y0 + (t * LEN) / 2;
    setLabel(valueLabel, [{ text: fmtValue(q, v), size: 0.3, weight: 800 }], { pill: 0.35 });
    meta.update(v, t);
    if (!quiet && v !== last) blip(380 + t * 700, 0.05, 0.03);
    last = v;
  };
  setValue(a[q.id] ?? q.def, true);

  registerHit(hit, { dragZ: RZ, onDrag: (p) => setValue(q.min + ((p.y - Y0) / LEN) * (q.max - q.min)) });

  const mk = (txt, dx, d) => {
    const b = makeButton(txt, { w: 0.34, h: 0.34, color: 0x3a4a8a, onSelect: () => setValue((a[q.id] ?? q.def) + d) });
    b.group.position.set(1.15 + dx, 2.5, RZ);
    stage.add(b.group);
  };
  mk('−', -0.3, -q.step);
  mk('+', 0.3, q.step);

  return (t) => { meta.tick?.(t); };
}

const COIN_COLOR = { income: C.gold, spouseIncome: C.gold, longTermIncome: C.gold, resources: C.resources, existingCoverage: C.existing, funeral: C.funeral, debts: C.debts };

function makeMetaphor(q) {
  const g = new THREE.Group();

  if (q.unit === 'money') {
    const bricks = q.id === 'debts';
    const color = COIN_COLOR[q.id] ?? C.gold;
    const N = 72;
    const geo = bricks ? new THREE.BoxGeometry(0.34, 0.12, 0.2) : new THREE.CylinderGeometry(0.17, 0.17, 0.04, 24);
    const mat = standard(color, { metalness: bricks ? 0.1 : 0.7, roughness: bricks ? 0.7 : 0.3, emissiveIntensity: 0.18 });
    const items = [];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, mat);
      const stack = Math.floor(i / 12);
      const k = i % 12;
      const sx = (stack % 3) * 0.5 - 0.5;
      const sz = Math.floor(stack / 3) * 0.45 - 0.2;
      m.position.set(sx + (bricks ? ((k % 2) * 0.03) : 0), (bricks ? 0.06 + k * 0.125 : 0.02 + k * 0.045), sz);
      m.rotation.y = bricks ? (k % 2) * 0.12 : 0;
      g.add(m);
      items.push(m);
    }
    return { group: g, update: (v, t) => { const cnt = Math.round(t * N); items.forEach((m, i) => { m.visible = i < Math.max(1, cnt); }); } };
  }

  if (q.id === 'dependents') {
    const you = makeFigure(1.75, C.income);
    you.position.set(-1.7, 0, 0.3);
    g.add(you);
    const kids = [];
    for (let i = 0; i < 8; i++) {
      const f = makeFigure(i % 2 ? 0.95 : 1.2, [C.gold, C.pink, C.resources, C.existing][i % 4]);
      f.position.set(-1.0 + i * 0.5 - 0.6, 0, 0.1 - (i % 2) * 0.25);
      g.add(f);
      kids.push(f);
    }
    return {
      group: g,
      update: (v) => kids.forEach((f, i) => { f.visible = i < v; }),
      tick: (t) => kids.forEach((f, i) => { f.position.y = f.visible ? Math.abs(Math.sin(t * 2 + i)) * 0.025 : 0; }),
    };
  }

  // years / age: a candle of time
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 24), standard(C.existing, { emissiveIntensity: 0.6 }));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  const glow = new THREE.PointLight(0xffd27a, 1.2, 4);
  g.add(body, flame, glow);
  for (let k = 1; k <= 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    r.rotation.x = Math.PI / 2;
    r.position.y = (1.9 * k) / 4;
    g.add(r);
  }
  return {
    group: g,
    update: (v, t) => {
      const h = 0.12 + t * 1.8;
      body.scale.y = h;
      body.position.y = h / 2;
      flame.position.y = h + 0.14;
      glow.position.y = h + 0.3;
    },
    tick: (t) => { flame.scale.setScalar(1 + 0.12 * Math.sin(t * 9)); },
  };
}

// ---------- RESULTS ----------
function buildResults() {
  const r = compute(state.answers);
  const ratio = r.need > 0 ? Math.min(1, r.covered / r.need) : 1;
  const covered = r.gap === 0;
  setMood(covered ? 0x063a35 : 0x2a0f1c, covered ? 0x2ecc9a : 0xb0485a);
  const tone = new THREE.Color(0xff5c6c).lerp(new THREE.Color(0x2ecc9a), ratio);

  // a protective dome around you: coverage decides how much sky it shelters
  const theta = Math.max(0.06, ratio * (Math.PI / 2));
  const domeGeo = new THREE.SphereGeometry(3.6, 56, 28, 0, Math.PI * 2, 0, theta);
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
  const wire = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: tone, wireframe: true, transparent: true, opacity: 0.28 }));
  const domeGrp = new THREE.Group();
  domeGrp.add(dome, wire);
  stage.add(domeGrp);

  const ground3 = new THREE.Mesh(new THREE.RingGeometry(3.45, 3.6, 96), new THREE.MeshBasicMaterial({ color: tone, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  ground3.rotation.x = -Math.PI / 2;
  ground3.position.y = 0.02;
  stage.add(ground3);

  // life-size towers
  const S = 3.0 / Math.max(r.need, r.covered, 1);
  const makeTower = (x, parts) => {
    const segs = parts.map(([label, value, color, op]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), standard(color, { transparent: op < 1, opacity: op ?? 1, emissiveIntensity: op < 1 ? 0.6 : 0.2 }));
      m.position.x = x;
      stage.add(m);
      const lab = makeLabel(1.5, 0.4, 240);
      setLabel(lab, [{ text: label, size: 0.085, color: '#c4cff5', weight: 600 }, { text: fmtShort(value), size: 0.14, weight: 800 }], { pill: 0.4 });
      stage.add(lab);
      return { m, lab, value, x };
    });
    return segs;
  };
  const needSegs = makeTower(-1.55, [['Income replacement', r.income, C.income], ['Debts', r.debts, C.debts], ['Final expenses', r.funeral, C.funeral]]);
  const coverSegs = makeTower(1.55, [['Savings', r.resources, C.resources], ['Policies you have', r.existing, C.existing], ['Gap', r.gap, C.gap, 0.6]]);
  const allSegs = [...needSegs, ...coverSegs];
  const TZ = -2.4;
  [needSegs, coverSegs].forEach((segs) => segs.forEach((s) => { s.m.position.z = TZ; }));

  // the family you are protecting, standing between the towers
  const fam = new THREE.Group();
  const people = [];
  for (let i = 0; i < r.adults; i++) people.push([1.7 - i * 0.05, i ? C.pink : C.income]);
  for (let i = 0; i < Math.min(r.dependents, 6); i++) people.push([i % 2 ? 0.95 : 1.2, [C.gold, C.resources, C.existing][i % 3]]);
  people.forEach(([h, c], i) => {
    const f = makeFigure(h, c);
    f.position.x = (i - (people.length - 1) / 2) * 0.42;
    f.position.z = (i % 2) * 0.2;
    fam.add(f);
  });
  fam.position.set(0, 0, -1.9);
  stage.add(fam);

  const head = makeLabel(3.8, 1.15, 240);
  head.position.set(0, 3.0, -3.0);
  head.rotation.x = 0.1;
  setLabel(head, [
    { text: covered ? 'YOU LOOK COVERED' : 'ESTIMATED COVERAGE GAP', size: 0.1, color: '#c4cff5', weight: 700 },
    { text: covered ? fmt(r.covered - r.need) + ' to spare' : fmt(r.gap), size: 0.42, color: covered ? '#7dffd0' : '#ff8d99', weight: 800 },
  ], { pill: 0.4 });
  stage.add(head);

  const rec = makeLabel(3.4, 0.9, 240);
  rec.position.set(0, 2.15, -3.0);
  setLabel(rec, [
    { text: 'WHAT COULD FIT', size: 0.085, color: '#c4cff5', weight: 700 },
    { text: r.type, size: 0.2, weight: 800 },
    { text: covered ? 'Your savings and policies meet the estimate.' : `Around ${fmt(r.suggested)} of coverage would close the gap.`, size: 0.09, color: '#dfe6ff', weight: 500 },
  ], { pill: 0.4 });
  stage.add(rec);

  const edit = makeButton('Edit answers', { w: 1.1, h: 0.32, color: 0x3a4a8a, onSelect: () => { state.qi = 0; go('quiz'); } });
  edit.group.position.set(-1.4, 0.95, -1.2);
  faceCenter(edit.group);
  stage.add(edit.group);
  const again = makeButton('Start over', { w: 1.1, h: 0.32, color: 0x4f8cff, onSelect: () => { state.answers = defaultAnswers(); state.qi = 0; go('home'); } });
  again.group.position.set(1.4, 0.95, -1.2);
  faceCenter(again.group);
  stage.add(again.group);

  const ease = (x) => 1 - Math.pow(1 - x, 3);
  let t0 = null;
  stageTick = (t) => {
    t0 ??= t;
    const k = ease(Math.min(1, (t - t0) / 1.6));
    domeGrp.scale.setScalar(0.2 + 0.8 * k);
    dome.material.opacity = (0.1 + 0.07 * Math.sin(t * 1.5)) * k;
    for (const group of [needSegs, coverSegs]) {
      let y = 0;
      for (const s of group) {
        const h = Math.max(0.001, s.value * S * k);
        s.m.scale.y = h;
        s.m.position.y = y + h / 2;
        s.m.visible = s.value > 0;
        const side = s.x < 0 ? -1 : 1;
        s.lab.position.set(s.x + side * 1.2, y + h / 2, TZ + 0.4);
        s.lab.visible = s.value > 0 && h > 0.15;
        s.lab.lookAt(0, s.lab.position.y, 0);
        y += h;
      }
    }
    void allSegs;
    fam.children.forEach((f, i) => { f.position.y = Math.abs(Math.sin(t * 1.6 + i)) * 0.02; });
  };
}

function fmtShort(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

// ---------- XR buttons + passthrough ----------
const vrBtn = VRButton.createButton(renderer);
const arBtn = ARButton.createButton(renderer, { optionalFeatures: ['local-floor', 'hand-tracking', 'layers'] });
for (const [b, left] of [[vrBtn, 'calc(50% - 160px)'], [arBtn, 'calc(50% + 10px)']]) {
  b.style.left = left;
  b.style.width = '150px';
  document.body.appendChild(b);
}

function onSessionChange() {
  const s = renderer.xr.getSession();
  const passthrough = !!s && s.environmentBlendMode !== 'opaque';
  environment.visible = !passthrough;
  fireflies.visible = !passthrough;
  renderer.setClearAlpha(passthrough ? 0 : 1);
  document.getElementById('hint').style.display = s ? 'none' : 'block';
}
renderer.xr.addEventListener('sessionstart', onSessionChange);
renderer.xr.addEventListener('sessionend', onSessionChange);

// ---------- boot (dev hashes: #quiz=3, #results) ----------
{
  const h = window.location.hash;
  if (h === '#results') { state.answers = { ...defaultAnswers(), ...sampleAnswers }; state.stage = 'results'; }
  else if (!h.startsWith('#quiz')) {
    // pick up anything the 2D frontend already saved on this domain
    const saved = loadFromStorage();
    state.answers = saved.answers;
  } else if (h.startsWith('#quiz')) { state.answers = { ...defaultAnswers(), ...sampleAnswers }; state.stage = 'quiz'; state.qi = Number(h.split('=')[1] || 0); }
}
build();

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  skyU.top.value.lerp(skyTarget.top, 0.04);
  skyU.bottom.value.lerp(skyTarget.bottom, 0.04);
  sky.position.copy(camera.position);

  const pos = ffGeo.attributes.position;
  for (let i = 0; i < FF; i++) {
    pos.setXYZ(i, ffBase[i * 3] + Math.sin(t * 0.4 + i) * 0.4, ffBase[i * 3 + 1] + Math.sin(t * 0.7 + i * 1.7) * 0.25, ffBase[i * 3 + 2] + Math.cos(t * 0.3 + i) * 0.4);
  }
  pos.needsUpdate = true;

  if (fadeState.dir !== 0) {
    fadeState.t += (fadeState.dir * dt) / 0.22;
    if (fadeState.dir > 0 && fadeState.t >= 1) { fadeState.t = 1; const cb = fadeState.cb; fadeState.cb = null; cb?.(); fadeState.dir = -1; }
    else if (fadeState.dir < 0 && fadeState.t <= 0) { fadeState.t = 0; fadeState.dir = 0; }
    fade.material.opacity = fadeState.t;
  }
  fade.visible = fadeState.t > 0;

  if (renderer.xr.isPresenting) pointers.forEach((p) => { if (p.object.visible) updatePointer(p); });

  const hovered = new Set([...pointers.map((p) => p.hovered), mousePointer.hovered]);
  for (const m of hitMeshes) {
    const target = m.userData.i.hover;
    if (!target) continue;
    const s = hovered.has(m) ? 1.1 : 1;
    target.scale.lerp(tmpV.set(s, s, s), 0.2);
  }

  stageTick?.(t, dt);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
