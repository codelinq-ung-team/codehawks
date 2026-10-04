// A small canvas-backed UI kit for WebXR, drawn to look like the 2D frontend's App Kit
// (apps/web/src/kit). Layout is in design px, like CSS; PX converts to meters.
// Every element is a textured plane, so panels stay sharp and each control can lift on hover.
import * as THREE from 'three';

// Tokens from kit/tokens.css plus the warm theme overrides in App.css.
export const T = {
  tint: '#650030', shiraz: '#ad112b', highlight: '#ff4f17', highlightText: '#c8380a',
  onBrandMuted: '#ffb38f', partner: '#008198',
  label: '#000000', label2: '#5a5a5a', gray: '#8e8e93',
  bg: '#ffffff', grouped: '#f8f5f2', grouped3: '#f1ece6', edge: '#e6dfd7', blob: '#efe5df',
  fill3: 'rgba(118,118,128,0.12)', fill4: 'rgba(116,116,128,0.08)', separator: 'rgba(60,60,67,0.18)',
  rose: '#f3e3e8', roseSoft: '#fbf3f5',
  success: '#008932', warning: '#c55300', danger: '#e9152d',
  hue: { blue: '#0088ff', indigo: '#6155f5', green: '#34c759', orange: '#ff8d28', teal: '#00c3d0', mint: '#00c8b3', brown: '#ac7f5e' },
};
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Arial, sans-serif';
const ROUNDED = 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif';
export const font = (weight, size, rounded = false) => `${weight} ${size}px ${rounded ? ROUNDED : SANS}`;

export const PX = 0.0015; // meters per design px: 20px text is 3cm tall, readable at 1.7m in a Quest 3S
const K = 2; // canvas pixels per design px

// ---------- text ----------
const mctx = document.createElement('canvas').getContext('2d');
export function measure(text, f) { mctx.font = f; return mctx.measureText(text).width; }

export function wrap(text, f, maxW) {
  mctx.font = f;
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && mctx.measureText(next).width > maxW) { lines.push(cur); cur = word; } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
}

// Draws wrapped text with its top at y and returns the height it used.
export function drawText(ctx, text, x, y, { f, color = T.label, maxW = Infinity, lineH, align = 'left', spacing = 0 }) {
  const size = parseFloat(f.match(/(\d+(?:\.\d+)?)px/)[1]);
  lineH ??= Math.round(size * 1.3);
  const lines = Number.isFinite(maxW) ? wrap(text, f, maxW) : String(text).split('\n');
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${spacing}px`;
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + lineH * i + lineH / 2 + size * 0.04));
  ctx.letterSpacing = '0px';
  return lines.length * lineH;
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Array.isArray(r) ? r : Math.min(r, w / 2, h / 2));
}

// ---------- icons (stroked, in a size × size box centered on cx, cy) ----------
export function icon(ctx, name, cx, cy, size, color, weight = 2) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (...pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.stroke(); };
  const ring = (r = 0.42) => { ctx.beginPath(); ctx.arc(0, 0, r * s, 0, Math.PI * 2); ctx.stroke(); };
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); ctx.fill(); };
  switch (name) {
    case 'chevron-right': line([-0.16, -0.34], [0.18, 0], [-0.16, 0.34]); break;
    case 'chevron-left': line([0.16, -0.34], [-0.18, 0], [0.16, 0.34]); break;
    case 'check': line([-0.34, 0.02], [-0.1, 0.26], [0.36, -0.26]); break;
    case 'check-circle': ring(); line([-0.2, 0.02], [-0.05, 0.17], [0.21, -0.14]); break;
    case 'info': ring(); dot(0, -0.19, 0.055); line([0, -0.03], [0, 0.21]); break;
    case 'exclamation': ring(); dot(0, 0.2, 0.055); line([0, -0.22], [0, 0.04]); break;
    case 'plus': line([-0.3, 0], [0.3, 0]); line([0, -0.3], [0, 0.3]); break;
    case 'minus': line([-0.3, 0], [0.3, 0]); break;
    case 'trend-up': line([-0.4, 0.24], [-0.1, -0.06], [0.08, 0.12], [0.4, -0.22]); line([0.16, -0.22], [0.4, -0.22], [0.4, 0.02]); break;
    case 'backspace': line([-0.46, 0], [-0.18, -0.3], [0.42, -0.3], [0.42, 0.3], [-0.18, 0.3], [-0.46, 0]); line([-0.02, -0.12], [0.22, 0.12]); line([0.22, -0.12], [-0.02, 0.12]); break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, 0.36 * s);
      ctx.bezierCurveTo(-0.62 * s, 0, -0.4 * s, -0.46 * s, 0, -0.16 * s);
      ctx.bezierCurveTo(0.4 * s, -0.46 * s, 0.62 * s, 0, 0, 0.36 * s);
      ctx.stroke();
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, -0.44 * s);
      ctx.lineTo(0.36 * s, -0.3 * s);
      ctx.lineTo(0.36 * s, 0.02 * s);
      ctx.bezierCurveTo(0.36 * s, 0.24 * s, 0.16 * s, 0.38 * s, 0, 0.45 * s);
      ctx.bezierCurveTo(-0.16 * s, 0.38 * s, -0.36 * s, 0.24 * s, -0.36 * s, 0.02 * s);
      ctx.lineTo(-0.36 * s, -0.3 * s);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'people':
      ctx.beginPath(); ctx.arc(-0.1 * s, -0.2 * s, 0.15 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.1 * s, 0.4 * s, 0.32 * s, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.27 * s, -0.12 * s, 0.11 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.27 * s, 0.4 * s, 0.24 * s, Math.PI * 1.5, Math.PI * 1.9); ctx.stroke();
      break;
    case 'calendar':
      ctx.beginPath(); ctx.roundRect(-0.36 * s, -0.3 * s, 0.72 * s, 0.68 * s, 0.1 * s); ctx.stroke();
      line([-0.36, -0.08], [0.36, -0.08]); line([-0.16, -0.42], [-0.16, -0.24]); line([0.16, -0.42], [0.16, -0.24]);
      break;
    default: break;
  }
  ctx.restore();
}

// ---------- elements ----------
// Every element registers here so pointers can find panels (for the reticle) and controls.
export const elements = new Set();

export function el(w, h, draw, { pad = 0 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((w + pad * 2) * K);
  canvas.height = Math.ceil((h + pad * 2) * K);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((w + pad * 2) * PX, (h + pad * 2) * PX), mat);
  const e = {
    mesh, w, h, draw, z0: 0, hover: false, lift: 0, press: 0, onSelect: null, enabled: true,
    redraw() {
      ctx.setTransform(K, 0, 0, K, pad * K, pad * K);
      ctx.clearRect(-pad, -pad, w + pad * 2, h + pad * 2);
      e.draw(ctx, e);
      tex.needsUpdate = true;
      return e;
    },
    setEnabled(on) { e.enabled = on; mat.opacity = on ? 1 : 0.4; return e; },
    dispose() {
      elements.delete(e);
      mesh.removeFromParent();
      mesh.geometry.dispose();
      tex.dispose();
      mat.dispose();
    },
  };
  mesh.userData.el = e;
  elements.add(e);
  return e; // not drawn yet: factories set their state first, then call redraw()
}

// A static element: drawn once now, and again whenever the caller asks.
export const paint = (w, h, draw, opts) => el(w, h, draw, opts).redraw();

// Step the hover lift and press dip of every control. Called once per frame.
export function animateElements(dt) {
  const a = Math.min(1, dt * 14);
  for (const e of elements) {
    if (!e.onSelect) continue;
    e.lift += ((e.hover && e.enabled ? 1 : 0) - e.lift) * a;
    e.press = Math.max(0, e.press - dt * 5);
    e.mesh.position.z = e.z0 + e.lift * 0.014;
    e.mesh.scale.setScalar(1 + e.lift * 0.035 - e.press * 0.05);
    e.mesh.material.color.setScalar(1 - e.lift * 0.05);
  }
}

// A group of elements laid out in px from its top-left corner.
export class Panel {
  constructor(w, h, opts = {}) {
    this.w = w;
    this.h = h;
    this.group = new THREE.Group();
    this.buckets = new Map();
    if (opts.card !== false) this.add(card(w, h, opts), 0, 0, { layer: 0 });
  }

  // px position → local meters (for placing 3D objects on the panel)
  at(x, y, z = 0) { return new THREE.Vector3((x - this.w / 2) * PX, (this.h / 2 - y) * PX, z); }

  add(e, x, y, { layer = 1, bucket = 'main' } = {}) {
    e.z0 = layer * 0.004;
    e.mesh.renderOrder = layer;
    e.mesh.position.copy(this.at(x + e.w / 2, y + e.h / 2, e.z0));
    this.group.add(e.mesh);
    if (!this.buckets.has(bucket)) this.buckets.set(bucket, []);
    this.buckets.get(bucket).push(e);
    return e;
  }

  clear(bucket) {
    for (const e of this.buckets.get(bucket) ?? []) e.dispose();
    this.buckets.set(bucket, []);
  }

  dispose() {
    for (const bucket of this.buckets.keys()) this.clear(bucket);
    this.group.removeFromParent();
  }
}

// ---------- kit components ----------
export function card(w, h, { fill = T.bg, r = 24, shadow = true, edge = true } = {}) {
  return paint(w, h, (ctx) => {
    if (shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(60,20,30,0.16)';
      ctx.shadowBlur = 40 * K;
      ctx.shadowOffsetY = 16 * K;
      rr(ctx, 0, 0, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }
    rr(ctx, 0, 0, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      rr(ctx, 0.5, 0.5, w - 1, h - 1, r);
      ctx.strokeStyle = T.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, { pad: shadow ? 56 : 0 });
}

// variant: filled | bordered | plain | inverse. icon sits after the label unless iconLeft.
export function button(w, h, o) {
  const e = el(w, h, (ctx) => {
    const { label, variant = 'filled', size = 19 } = e.o;
    const bg = { filled: T.tint, bordered: T.fill3, inverse: '#ffffff', plain: null, danger: T.fill3 }[variant];
    const fg = { filled: '#ffffff', bordered: T.tint, inverse: T.tint, plain: T.tint, danger: T.danger }[variant];
    if (bg) { rr(ctx, 0, 0, w, h, h / 2); ctx.fillStyle = bg; ctx.fill(); }
    // inverse sits straight on the room rather than on a card, so it carries its own edge
    if (variant === 'inverse') { rr(ctx, 0.75, 0.75, w - 1.5, h - 1.5, h / 2); ctx.strokeStyle = T.edge; ctx.lineWidth = 1.5; ctx.stroke(); }
    const f = font(600, size);
    const iw = e.o.icon ? size + 8 : 0;
    const tw = measure(label, f);
    const x0 = (w - tw - iw) / 2;
    if (e.o.icon && e.o.iconLeft) icon(ctx, e.o.icon, x0 + size / 2, h / 2, size, fg, 2.4);
    drawText(ctx, label, x0 + (e.o.iconLeft ? iw : 0), 0, { f, color: fg, lineH: h, spacing: -0.2 });
    if (e.o.icon && !e.o.iconLeft) icon(ctx, e.o.icon, x0 + tw + 8 + size / 2, h / 2, size, fg, 2.6);
  });
  e.o = o;
  e.onSelect = () => e.o.onSelect?.();
  e.set = (patch) => { Object.assign(e.o, patch); e.setEnabled(!e.o.disabled); return e.redraw(); };
  return e.set({});
}

const CHIP_FONT = font(600, 19);
export function chip(label, { why = false, onSelect }) {
  const w = Math.ceil(measure(label, CHIP_FONT)) + 40 + (why ? 26 : 0);
  const e = el(w, 48, (ctx) => {
    rr(ctx, 1, 1, w - 2, 46, 23);
    ctx.fillStyle = why ? '#ece8e4' : T.bg;
    ctx.fill();
    if (!why) { ctx.strokeStyle = T.tint; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (why) icon(ctx, 'info', 29, 24, 19, T.label, 1.8);
    drawText(ctx, label, why ? 46 : 20, 0, { f: CHIP_FONT, color: why ? T.label : T.tint, lineH: 48 });
  });
  e.onSelect = onSelect;
  return e.redraw();
}

// One answer in the Basics form (the frontend's .qform__option).
export function option(w, h, { label, on, onSelect }) {
  const e = el(w, h, (ctx) => {
    rr(ctx, 1, 1, w - 2, h - 2, 14);
    ctx.fillStyle = e.on ? T.roseSoft : T.bg;
    ctx.fill();
    ctx.strokeStyle = e.on ? T.tint : T.edge;
    ctx.lineWidth = e.on ? 2.5 : 1.5;
    ctx.stroke();
    drawText(ctx, label, 24, 0, { f: font(600, 21), lineH: h });
    ctx.beginPath();
    ctx.arc(w - 36, h / 2, 14, 0, Math.PI * 2);
    if (e.on) { ctx.fillStyle = T.tint; ctx.fill(); icon(ctx, 'check', w - 36, h / 2, 17, '#ffffff', 3); } else { ctx.strokeStyle = '#cfc6bd'; ctx.lineWidth = 1.5; ctx.stroke(); }
  });
  e.on = on;
  e.onSelect = onSelect;
  return e.redraw();
}

// A list row: title (+ subtitle) on the left, value (+ note) on the right. Sits on a list card.
export function row(w, h, o) {
  const e = el(w, h, (ctx) => {
    const { title, subtitle, value, valueColor = T.label2, note, first, check, chevron } = e.o;
    if (e.o.selected) { rr(ctx, 3, 3, w - 6, h - 6, 12); ctx.fillStyle = T.rose; ctx.fill(); }
    if (!first && !e.o.selected) { ctx.fillStyle = T.separator; ctx.fillRect(16, 0, w - 16, 1); }
    const trail = (chevron || check !== undefined ? 26 : 0);
    const vf = font(e.o.bold ? 700 : 500, 17);
    const vw = value ? measure(value, vf) : 0;
    const tf = font(e.o.bold ? 700 : 500, 17);
    const maxW = w - 32 - vw - trail - (value ? 14 : 0);
    const lines = wrap(title, tf, maxW);
    const sub = subtitle && lines.length === 1;
    const th = lines.length * 21 + (sub ? 19 : 0);
    let y = (h - th) / 2;
    y += drawText(ctx, lines.join('\n'), 16, y, { f: tf, lineH: 21 });
    if (sub) drawText(ctx, subtitle, 16, y, { f: font(400, 14), color: T.label2, lineH: 19 });
    if (value) {
      const vy = note ? (h - 38) / 2 : (h - 22) / 2;
      drawText(ctx, value, w - 16 - trail, vy, { f: vf, color: valueColor, align: 'right', lineH: 22 });
      if (note) drawText(ctx, note, w - 16 - trail, vy + 22, { f: font(400, 13), color: T.label2, align: 'right', lineH: 16 });
    }
    if (chevron) icon(ctx, 'chevron-right', w - 22, h / 2, 15, T.gray, 2.2);
    if (check) icon(ctx, 'check', w - 26, h / 2, 20, T.tint, 2.8);
  });
  e.o = o;
  if (o.onSelect) e.onSelect = o.onSelect;
  return e.redraw();
}

export function key(w, h, label, onSelect, { iconName } = {}) {
  const e = el(w, h, (ctx) => {
    rr(ctx, 0, 0, w, h, 16);
    ctx.fillStyle = iconName ? '#e8e0d8' : T.grouped3;
    ctx.fill();
    if (iconName) icon(ctx, iconName, w / 2, h / 2, 34, T.tint, 2.4);
    else drawText(ctx, label, w / 2, 0, { f: font(600, 30, true), align: 'center', lineH: h });
  });
  e.onSelect = onSelect;
  return e.redraw();
}
