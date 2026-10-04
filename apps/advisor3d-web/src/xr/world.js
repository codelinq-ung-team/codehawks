// The room, the renderer, and the pointers (controllers, hands, or a mouse).
// The look follows the 2D frontend: warm beige, white cards, burgundy and one orange arc.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { T, animateElements, elements } from './ui.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(T.grouped, 1);
renderer.xr.enabled = true;
renderer.xr.setFoveation(0); // text sits across the whole view, so keep the edges sharp
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 90);

scene.add(new THREE.HemisphereLight(0xffffff, 0xe6d8cf, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1.5, 3, 2.5);
scene.add(sun);

// Panels hang off the rig. In a headset it slides to the wearer's eye height, seated or standing.
export const rig = new THREE.Group();
scene.add(rig);
export const EYE = 1.5; // the height the layout is designed around, in meters
export const FOCUS = new THREE.Vector3(0, 1.38, -1.7); // center of the main panel

// ---------- room ----------
const environment = new THREE.Group();
scene.add(environment);
{
  const FLOOR = '#efe7df';
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { low: { value: new THREE.Color(FLOOR) }, high: { value: new THREE.Color('#fcfaf8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 low; uniform vec3 high; void main(){ float h = smoothstep(0.0, 0.7, normalize(vP).y); gl_FragColor = vec4(mix(low, high, h), 1.0);\n#include <colorspace_fragment>\n}',
    }),
  );
  sky.renderOrder = -10;
  environment.add(sky);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ color: FLOOR }));
  floor.rotation.x = -Math.PI / 2;
  environment.add(floor);

  const ring = (inner, outer, color, opacity) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    environment.add(m);
  };
  ring(0, 2.3, '#f8f5f2', 1);
  ring(2.3, 2.34, T.tint, 0.22);
  ring(3.3, 3.42, T.highlight, 0.85);

  // Soft hills on the horizon, and the brand's arcs rising out of the floor.
  const hill = new THREE.SphereGeometry(1, 32, 16);
  [[-13, -15, 7, '#e6d9cf'], [10, -19, 9, '#e9ded5'], [-2, -24, 8, '#ebe1d9'], [19, -6, 6, '#e6d9cf'], [-20, 2, 8, '#e9ded5'], [3, 21, 9, '#e6d9cf'], [-12, 16, 6, '#ebe1d9']]
    .forEach(([x, z, r, color]) => {
      const m = new THREE.Mesh(hill, new THREE.MeshBasicMaterial({ color }));
      m.scale.set(r, r * 0.5, r);
      m.position.set(x, -r * 0.14, z);
      environment.add(m);
    });
  [[9.5, -10, 3.6, 0.11, T.highlight, 0.7], [-11, -9, 4.4, 0.13, T.tint, -0.7], [10, 7, 3, 0.09, T.tint, 1.9], [-9, 8, 2.6, 0.09, T.highlight, -2.2]]
    .forEach(([x, z, r, tube, color, yaw]) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 96), new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, -r * 0.25, z);
      m.rotation.y = yaw;
      environment.add(m);
    });
}

// Slow motes of warm light, so the air has depth. Shown in VR and on desktop, hidden in passthrough.
const MOTES = 70;
const moteBase = new Float32Array(MOTES * 3);
{
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < MOTES; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 2.4 + rnd() * 5;
    moteBase.set([Math.sin(a) * r, 0.3 + rnd() * 3.2, -Math.cos(a) * r], i * 3);
  }
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(moteBase), 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: T.onBrandMuted, size: 0.035, transparent: true, opacity: 0.8 }));
environment.add(motes);

// ---------- sound (tiny synthesized cues, no assets) ----------
let actx;
export function blip(freq = 660, dur = 0.09, vol = 0.04) {
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

// ---------- pointers ----------
const rc = new THREE.Raycaster();
const rot = new THREE.Matrix4();
const mouse = new THREE.Vector2(0, 0);
const pointers = [];

const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

// Nearest control under the ray, plus the distance to whatever surface the ray lands on.
function pick(p) {
  p.setRay(rc.ray);
  const meshes = [];
  for (const e of elements) if (shown(e.mesh)) meshes.push(e.mesh);
  const found = rc.intersectObjects(meshes, false);
  let target = null;
  let distance = found.length ? found[0].distance : null;
  for (const f of found) {
    const e = f.object.userData.el;
    if (e.onSelect && e.enabled) { target = e; distance = f.distance; break; }
  }
  if (target !== p.hovered) {
    p.hovered = target;
    if (target) blip(880, 0.03, 0.012);
  }
  p.distance = distance;
}

function select(p) {
  pick(p);
  const e = p.hovered;
  if (!e) return;
  e.press = 1;
  blip(520, 0.1, 0.04);
  e.onSelect();
}

const controllerModels = new XRControllerModelFactory();
const handModels = new XRHandModelFactory();
for (let n = 0; n < 2; n++) {
  const c = renderer.xr.getController(n);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: T.tint, transparent: true, opacity: 0.55 }),
  );
  c.add(line);
  scene.add(c);

  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 24), new THREE.MeshBasicMaterial({ color: T.highlight, depthTest: false, transparent: true }));
  dot.add(new THREE.Mesh(new THREE.RingGeometry(0.008, 0.011, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true })));
  dot.renderOrder = 999;
  dot.children[0].renderOrder = 999;
  dot.visible = false;
  scene.add(dot);

  const p = {
    object: c, line, dot, hovered: null, distance: null, connected: false,
    setRay(ray) {
      rot.identity().extractRotation(c.matrixWorld);
      ray.origin.setFromMatrixPosition(c.matrixWorld);
      ray.direction.set(0, 0, -1).applyMatrix4(rot);
    },
  };
  c.addEventListener('connected', () => { p.connected = true; });
  c.addEventListener('disconnected', () => { p.connected = false; p.hovered = null; dot.visible = false; });
  c.addEventListener('selectstart', () => select(p));
  pointers.push(p);

  const grip = renderer.xr.getControllerGrip(n);
  grip.add(controllerModels.createControllerModel(grip));
  scene.add(grip);
  const hand = renderer.xr.getHand(n);
  hand.add(handModels.createHandModel(hand, 'mesh'));
  scene.add(hand);
}

const mousePointer = { hovered: null, distance: null, setRay(ray) { rc.setFromCamera(mouse, camera); ray.copy(rc.ray); } };
const setMouse = (e) => mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
renderer.domElement.addEventListener('pointermove', setMouse);
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  setMouse(e);
  select(mousePointer);
});

// ---------- desktop camera ----------
// Pull back until the three panels fit the window, whatever its shape.
function fitCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.userData.z = Math.max(0.75, 1.3 / (camera.aspect * half) - 1.27);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
fitCamera();
window.addEventListener('resize', fitCamera);

// ---------- sessions ----------
let settle = 0; // frames to wait before reading the wearer's eye height
function onSessionChange() {
  const session = renderer.xr.getSession();
  const passthrough = !!session && session.environmentBlendMode !== 'opaque';
  environment.visible = !passthrough;
  renderer.setClearAlpha(passthrough ? 0 : 1);
  document.body.classList.toggle('in-xr', !!session);
  if (session) settle = 20; else { rig.position.y = 0; fitCamera(); }
}
renderer.xr.addEventListener('sessionstart', onSessionChange);
renderer.xr.addEventListener('sessionend', onSessionChange);

// mode: 'immersive-vr' | 'immersive-ar'. Both use the floor as the origin so the layout
// lands at the same height in passthrough as in VR.
export async function enterXR(mode) {
  const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
  let space = 'local-floor';
  try { await session.requestReferenceSpace(space); } catch { space = 'local'; }
  renderer.xr.setReferenceSpaceType(space);
  await renderer.xr.setSession(session);
}

// ---------- loop ----------
const frameFns = new Set();
export const onFrame = (fn) => { frameFns.add(fn); return () => frameFns.delete(fn); };

const clock = new THREE.Clock();
const head = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const xr = renderer.xr.isPresenting;

  if (xr) {
    if (settle > 0 && --settle === 0) {
      // three copies the headset pose into the camera on every XR frame. With a floor
      // origin, head.y is the real eye height. Without one it is near zero.
      rig.position.y = THREE.MathUtils.clamp(camera.getWorldPosition(head).y - EYE, -EYE, 0.4);
    }
  } else {
    camera.position.lerp(head.set(mouse.x * 0.1, EYE - 0.08 + mouse.y * 0.05, camera.userData.z), Math.min(1, dt * 4));
    camera.lookAt(FOCUS);
  }

  for (const e of elements) e.hover = false;
  if (xr) {
    for (const p of pointers) {
      if (!p.connected) { p.line.visible = false; continue; }
      pick(p);
      if (p.hovered) p.hovered.hover = true;
      p.line.visible = true;
      p.line.scale.z = p.distance ?? 2.5;
      p.dot.visible = p.distance !== null;
      if (p.dot.visible) {
        rc.ray.at(p.distance - 0.004, p.dot.position);
        p.dot.lookAt(rc.ray.origin);
        p.dot.scale.setScalar((p.hovered ? 1.5 : 1) * Math.max(1, p.distance / 1.4));
      }
    }
  } else {
    pick(mousePointer);
    if (mousePointer.hovered) mousePointer.hovered.hover = true;
    renderer.domElement.style.cursor = mousePointer.hovered ? 'pointer' : 'default';
  }
  animateElements(dt);

  const pos = moteGeo.attributes.position;
  for (let i = 0; i < MOTES; i++) {
    pos.setY(i, moteBase[i * 3 + 1] + Math.sin(t * 0.25 + i * 1.7) * 0.3);
    pos.setX(i, moteBase[i * 3] + Math.sin(t * 0.18 + i) * 0.25);
  }
  pos.needsUpdate = true;

  for (const fn of frameFns) fn(t, dt);
  renderer.render(scene, camera);
});
