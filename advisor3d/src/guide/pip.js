// Pip, the guide: the frontend's 32×32 pixel art (codelinq_frontend/src/guide/Avatar.tsx),
// drawn flat for chat bubbles and raised into a little relief sculpture for the room.
import * as THREE from 'three';

// One letter per pixel. Letters map to the colors below. Keep in sync with Avatar.tsx.
const PIXELS = [
  '................................',
  '............bbbbbbbb............',
  '.........bbbKKKKKKKKbbb.........',
  '........bbKHHhhhhhHHHKbb........',
  '......bbbKHggghhhhhHHHKbbb......',
  '.....bbbKHgghhhhHHHHHHHKbbb.....',
  '.....bbKHgHHHHHHHHHHHHHHKbb.....',
  '....bbbKhHHHHHHHHHHHHHHHKbbb....',
  '...bbbKHHHHHHHHHHHHHHHHHHKbbb...',
  '...bbbKHHHHSShHHHHHHHHHHHKbbb...',
  '...bbKHHHHSSsshhhHHHHHHHHKKbb...',
  '..bbbKHHHHSSSSssshhhHHHHHKKbbb..',
  '..bbbKKHHHSBBBSSSsBBhhHHHKKbbb..',
  '..bbbKKHHHSSSSSSSSSSSsHHHKKbbb..',
  '..bbbKKHhHSzEESSSSEEzsHHHKKbbb..',
  '..bbbKKHhHSSWESSSSWESsHhHKKbbb..',
  '..bbbKKHhHSSEISSSSEISsHhHKKbbb..',
  '..bbbKKHhHSCCSSSsSSCCsHhHKKbbb..',
  '..bbbKKHHHSSSSSSzSSSSsHhHKKbbb..',
  '...bbKKHHHHSSSmSSmSSsHHHHKKbb...',
  '...bbKKHhHHSSSSmmSSSsHHHHKKbb...',
  '...bbKKHhHHHSSSSSSSsHHHhHKKbb...',
  '....bKKHhHHHHSSSSssHHHHhHKKb....',
  '.....KKHhHHHHHssssHHHHHhHKK.....',
  '.....KKHHHHHHHSSSsHHHHHHHKK.....',
  '......KHhHTTteSSSscdTTHHHK......',
  '.....dKHHHTTteyccycdTTHhHKd.....',
  '...dTtTKHHTTTteoOcdTTTHHKTdTd...',
  '..dTTtTKHTTTTteOOcdTTTTHKTdTTd..',
  '.dTTTTtTTTTTTTtecdTTTTTTTdTTTTd.',
  '.dTTTTtTTTTTTTtTTdTTTTTTTdTTTTd.',
  '.dTTTTTtTTTTTTtTTdTTTTTTdTTTTTd.',
];

const COLORS = {
  '.': '#fde4d6', b: '#fff1e7', K: '#2e1814', H: '#4f2a20', h: '#6e3c2c', g: '#a0623f',
  S: '#f8d5bb', s: '#ecb89a', z: '#dc9f80', E: '#2a1410', I: '#7a4630', W: '#ffffff',
  B: '#7a4632', C: '#f4a493', m: '#a23e55', T: '#650030', t: '#86193f', d: '#480022',
  c: '#fff7f0', e: '#ecdccf', O: '#ff7a47', o: '#ffc7a8', y: '#e9b98f',
};

// How far each pixel stands out from the backing tile, in pixels.
const DEPTH = { '.': 1, b: 1.4, K: 4.6, H: 5, h: 5, g: 5.2, T: 4, t: 4.2, d: 3.6, c: 3.4, e: 3.2, O: 4.4, o: 4.6, y: 3.6 };
const FACE_DEPTH = 3.2;
const N = 32;

// The avatar is clipped to a rounded square (the frontend uses clip-path: inset(0 round 28%)).
function inside(x, y) {
  const r = N * 0.28;
  const cx = Math.min(Math.max(x + 0.5, r), N - r);
  const cy = Math.min(Math.max(y + 0.5, r), N - r);
  return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
}

export function drawPip(ctx, x, y, size) {
  const u = size / N;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.28);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  PIXELS.forEach((line, py) => {
    for (let px = 0; px < N; px++) {
      ctx.fillStyle = COLORS[line[px]];
      ctx.fillRect(x + px * u - 0.25, y + py * u - 0.25, u + 0.5, u + 0.5);
    }
  });
  ctx.restore();
}

// Returns { group, tick(t, mood) }. mood: 'idle' | 'typing'.
export function makePip(size = 0.36) {
  const u = size / N;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), N * N);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  const eyes = [];
  let n = 0;
  PIXELS.forEach((line, y) => {
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue;
      const ch = line[x];
      const depth = (DEPTH[ch] ?? FACE_DEPTH) * u;
      m.makeScale(u, u, depth).setPosition((x - N / 2 + 0.5) * u, (N / 2 - y - 0.5) * u, depth / 2);
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, color.set(COLORS[ch]));
      if ('EIW'.includes(ch)) eyes.push({ n, open: COLORS[ch] });
      n++;
    }
  });
  mesh.count = n;

  const group = new THREE.Group();
  group.add(mesh);
  let shut = false;
  return {
    group,
    tick(t, mood = 'idle') {
      const typing = mood === 'typing';
      group.position.y = Math.sin(t * (typing ? 5 : 1.4)) * (typing ? 0.006 : 0.008);
      group.rotation.y = Math.sin(t * 0.6) * 0.16;
      group.rotation.x = typing ? Math.sin(t * 5) * 0.05 : Math.sin(t * 0.45) * 0.03;
      // A short blink every few seconds.
      const blink = t % 4.2 < 0.13;
      if (blink !== shut) {
        shut = blink;
        for (const e of eyes) mesh.setColorAt(e.n, color.set(shut ? COLORS.z : e.open));
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
  };
}
