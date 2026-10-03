// The five screens of the 2D frontend (Home → Basics → Chat with Pip → Review → Results),
// laid out for a headset: one main card in front, Pip on the left, the number pad or
// side actions on the right. Copy and flow follow codelinq_frontend; the logic is shared.
import * as THREE from 'three';
import { FIELD, FIELDS, GROUPS, HOUSEHOLD, calculate, formatField, formatMoney, missingRequired, summaryText } from './domain/calculator.ts';
import { GUIDE_NAME } from './guide/guide.ts';
import { drawPip, makePip } from './guide/pip.js';
import { CLOSING, WHY, applyForm, intro, nextStep, question, respond } from './intake/script.ts';
import { getState, go, loadSample, readRoute, resetState, setField, setState, subscribe } from './lib/store.ts';
import { PX, Panel, T, button, card, chip, drawText, el, font, icon, key, measure, option, paint, row, rr, wrap } from './xr/ui.js';
import { FOCUS, onFrame, rig } from './xr/world.js';

const MAIN_W = 760;
const MAIN_H = 660;
const SIDE_W = 420;
const YAW = THREE.MathUtils.degToRad(34);
const RADIUS = 1.7;
const M = 36; // main card margin

const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const plural = (n, word) => `${n} ${n === 1 ? word : word + 's'}`;

// ---------- the parts that stay up on every screen ----------
function sidePanel(sign) {
  const p = new Panel(SIDE_W, MAIN_H, { card: false });
  p.group.position.set(sign * Math.sin(YAW) * RADIUS, FOCUS.y, -Math.cos(YAW) * RADIUS);
  p.group.rotation.y = -sign * YAW;
  rig.add(p.group);
  return p;
}
const left = sidePanel(-1);
const right = sidePanel(1);

const STEPS = [['prepare', 'Basics'], ['chat', 'Chat'], ['review', 'Review'], ['results', 'Results']];
const header = new Panel(MAIN_W, 64, { r: 32 });
header.group.position.set(0, FOCUS.y + (MAIN_H / 2 + 18 + 32) * PX, FOCUS.z);
rig.add(header.group);
header.add(paint(190, 64, (ctx) => {
  rr(ctx, 16, 14, 36, 36, 11);
  ctx.fillStyle = T.tint;
  ctx.fill();
  icon(ctx, 'heart', 34, 32.5, 20, '#ffffff', 2.4);
  drawText(ctx, 'Linq', 62, 0, { f: font(700, 22), lineH: 64 });
  drawText(ctx, 'Life', 62 + measure('Linq', font(700, 22)), 0, { f: font(700, 22), color: T.highlightText, lineH: 64 });
}), 0, 0);
const stepper = header.add(el(380, 64, (ctx) => {
  const index = STEPS.findIndex(([id]) => id === readRoute());
  if (index < 0) {
    drawText(ctx, 'Life insurance needs, in a guided chat', 380, 0, { f: font(500, 15), color: T.label2, lineH: 64, align: 'right' });
    return;
  }
  STEPS.forEach(([, label], i) => {
    const x = i * 96;
    const done = i < index;
    const now = i === index;
    rr(ctx, x, 14, 88, 4, 2);
    ctx.fillStyle = done ? T.highlightText : now ? T.tint : 'rgba(120,120,128,0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 9, 38, 9, 0, Math.PI * 2);
    ctx.fillStyle = done ? T.highlightText : now ? T.tint : 'rgba(120,120,128,0.16)';
    ctx.fill();
    if (done) icon(ctx, 'check', x + 9, 38, 11, '#ffffff', 2.4);
    drawText(ctx, label, x + 24, 28, { f: font(now ? 600 : 400, 15), color: done || now ? T.label : T.label2, lineH: 20 });
  });
}), 196, 0);
let confirmTimer = 0;
const startOver = header.add(button(168, 40, {
  label: 'Start Over', variant: 'plain', size: 16,
  onSelect() {
    clearTimeout(confirmTimer);
    if (startOver.o.variant === 'danger') {
      startOver.set({ label: 'Start Over', variant: 'plain' });
      resetState();
      go('home');
    } else {
      // The frontend asks "Start over?" in an alert. Here a second tap confirms.
      startOver.set({ label: 'Tap again to clear', variant: 'danger' });
      confirmTimer = setTimeout(() => startOver.set({ label: 'Start Over', variant: 'plain' }), 4000);
    }
  },
}), MAIN_W - 168 - 12, 12);

const footer = new Panel(MAIN_W, 52, { card: false });
footer.group.position.set(0, FOCUS.y - (MAIN_H / 2 + 14 + 26) * PX, FOCUS.z);
rig.add(footer.group);
footer.add(paint(MAIN_W, 52, (ctx) => {
  rr(ctx, 0, 0, MAIN_W, 52, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fill();
  drawText(ctx, 'LinqLife gives an educational estimate, not a quote, a recommendation, or financial, legal, or tax advice. It doesn’t account for inflation, investment returns, taxes, or Social Security. Prototype: answers stay in this browser tab.',
    MAIN_W / 2, 8, { f: font(400, 13), color: T.label2, maxW: MAIN_W - 48, lineH: 18, align: 'center' });
}), 0, 0, { layer: 0 });

// ---------- chat bubbles (used by Pip's card and by the chat log) ----------
function bubbleLayout(m, size, maxW) {
  const f = font(400, size);
  const lineH = Math.round(size * 1.36);
  const padX = Math.round(size * 0.8);
  const padY = Math.round(size * 0.55);
  const lines = wrap(m.text, f, maxW - padX * 2);
  const tag = m.why ? Math.round(size * 1.25) : 0;
  const textW = Math.max(...lines.map((l) => measure(l, f)), m.why ? measure('Why we ask', font(600, size - 3)) + size + 6 : 0);
  return { m, f, size, lineH, padX, padY, lines, tag, w: Math.ceil(textW) + padX * 2, h: lines.length * lineH + padY * 2 + tag };
}

function drawBubble(ctx, b, x, y) {
  const { m } = b;
  const r = Math.min(20, b.h / 2);
  const user = m.role === 'user';
  rr(ctx, x, y, b.w, b.h, user ? [r, r, 6, r] : [r, r, r, 6]);
  ctx.fillStyle = user ? T.tint : m.why ? T.bg : T.grouped;
  ctx.fill();
  if (m.why) {
    rr(ctx, x + 0.75, y + 0.75, b.w - 1.5, b.h - 1.5, [r, r, r, 6]);
    ctx.strokeStyle = T.tint;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    icon(ctx, 'info', x + b.padX + b.size * 0.42, y + b.padY + b.tag / 2 - 2, b.size * 0.84, T.tint, 1.6);
    drawText(ctx, 'Why we ask', x + b.padX + b.size + 2, y + b.padY - 2, { f: font(600, b.size - 3), color: T.tint, lineH: b.tag });
  }
  drawText(ctx, b.lines.join('\n'), x + b.padX, y + b.padY + b.tag, { f: b.f, color: user ? '#ffffff' : T.label, lineH: b.lineH });
}

// ---------- Pip, on the left ----------
const pip = makePip(0.36);
const pipHolder = new THREE.Group();
pipHolder.position.copy(left.at(SIDE_W / 2, 124, 0.02));
pipHolder.add(pip.group);
left.group.add(pipHolder);

let pipLines = [];
const pipCard = left.add(el(SIDE_W, 460, (ctx) => {
  // One card: Pip's name plate, then whatever she is saying on this screen.
  const bubbles = pipLines.map((m) => bubbleLayout(m, 16, (SIDE_W - 36) * 0.88));
  const h = bubbles.reduce((sum, b) => sum + b.h + 8, 78) + (bubbles.length ? 12 : -4);
  ctx.save();
  ctx.shadowColor = 'rgba(60,20,30,0.14)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 20;
  rr(ctx, 0, 0, SIDE_W, h, 24);
  ctx.fillStyle = T.bg;
  ctx.fill();
  ctx.restore();
  rr(ctx, 0.5, 0.5, SIDE_W - 1, h - 1, 24);
  ctx.strokeStyle = T.edge;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawText(ctx, GUIDE_NAME, SIDE_W / 2, 12, { f: font(700, 22), align: 'center', lineH: 28 });
  const sub = 'Your life insurance guide';
  const sw = measure(sub, font(400, 15));
  ctx.beginPath();
  ctx.arc(SIDE_W / 2 - sw / 2 - 4, 51, 4, 0, Math.PI * 2);
  ctx.fillStyle = T.success;
  ctx.fill();
  drawText(ctx, sub, SIDE_W / 2 + 6, 40, { f: font(400, 15), color: T.label2, align: 'center', lineH: 22 });
  if (!bubbles.length) return;
  ctx.fillStyle = T.edge;
  ctx.fillRect(18, 74, SIDE_W - 36, 1);
  let y = 88;
  for (const b of bubbles) {
    drawBubble(ctx, b, b.m.role === 'user' ? SIDE_W - 18 - b.w : 18, y);
    y += b.h + 8;
  }
}, { pad: 40 }), 0, 250);
function say(lines) {
  pipLines = lines;
  pipCard.redraw();
}

// What Pip would answer to "why do you ask?" for a field, straight from the chat script.
const why = (id) => respond(id, 'why', { ...getState(), pending: null }).say[0];

// ---------- number pad, on the right ----------
let pad = null; // the pad a physical keyboard types into
function clearRight() {
  right.clear('main');
  pad = null;
}

function numberPad({ title, money, value = null, hint = '', action, onChange }) {
  let digits = value == null ? '' : String(value);
  let note = { text: hint, error: false };
  const Y = 20;
  right.add(card(SIDE_W, 562), 0, Y, { layer: 0 });
  const display = right.add(el(SIDE_W, 128, (ctx) => {
    drawText(ctx, title, 30, 20, { f: font(600, 17), color: T.label2, lineH: 22 });
    rr(ctx, 31, 53, 358, 62, 14);
    ctx.fillStyle = T.bg;
    ctx.fill();
    ctx.strokeStyle = note.error ? T.danger : T.tint;
    ctx.lineWidth = 2;
    ctx.stroke();
    const text = digits === '' ? '0' : Number(digits).toLocaleString('en-US');
    let x = 48;
    if (money) {
      drawText(ctx, '$', x, 53, { f: font(600, 26), color: T.label2, lineH: 62 });
      x += measure('$', font(600, 26)) + 6;
    }
    drawText(ctx, text, x, 53, { f: font(700, 32, true), color: digits === '' ? '#c7c7cc' : T.label, lineH: 62 });
  }), 0, Y).redraw();
  const hintEl = right.add(el(SIDE_W, 50, (ctx) => {
    drawText(ctx, note.text, 30, 0, { f: font(note.error ? 600 : 400, 14), color: note.error ? T.danger : T.label2, maxW: 360, lineH: 19 });
  }), 0, Y + 498).redraw();

  const current = () => (digits === '' ? null : Number(digits));
  const act = right.add(button(360, 54, { ...action, onSelect: () => action.onSelect(current()), disabled: action.disabled?.(current()) }), 30, Y + 434);
  const press = (k) => {
    if (k === 'back') digits = digits.slice(0, -1);
    else if (digits === '' || digits === '0') digits = k === '000' ? digits : k;
    else if ((digits + k).length <= 9) digits += k;
    note = { text: hint, error: false };
    onChange?.(current());
    display.redraw();
    hintEl.redraw();
    act.set({ disabled: action.disabled?.(current()) });
  };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', money ? '000' : null, '0', 'back'].forEach((k, i) => {
    if (!k) return;
    const e = k === 'back' ? key(112, 64, '', () => press(k), { iconName: 'backspace' }) : key(112, 64, k === '000' ? ',000' : k, () => press(k));
    right.add(e, 30 + (i % 3) * 124, Y + 134 + Math.floor(i / 3) * 74);
  });

  pad = {
    press,
    submit: () => { if (act.enabled) act.onSelect(); },
    refresh: () => act.set({ disabled: action.disabled?.(current()) }),
    fail(text) { note = { text, error: true }; display.redraw(); hintEl.redraw(); },
  };
  return pad;
}

window.addEventListener('keydown', (e) => {
  if (!pad || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^\d$/.test(e.key)) pad.press(e.key);
  else if (e.key === 'Backspace') pad.press('back');
  else if (e.key === 'Enter') pad.submit();
  else return;
  e.preventDefault();
});

function mainPanel() {
  const p = new Panel(MAIN_W, MAIN_H);
  p.group.position.copy(FOCUS);
  rig.add(p.group);
  return p;
}

// ---------- Home ----------
const DEMO = [
  { role: 'bot', text: `Hi, I’m ${GUIDE_NAME}! About how much do you earn in a year?` },
  { role: 'user', text: 'Why do you ask?' },
  { role: 'bot', why: true, text: 'It’s the paycheck your family would lose. It’s a starting point, not the final number.' },
  { role: 'user', text: 'Makes sense. About $75,000.' },
  { role: 'bot', text: 'Thanks! Next, let’s talk about any debts.' },
];
const HOW = [
  ['info', T.hue.blue, 'Start with the basics', 'Five quick questions about your income, family, debts and coverage.'],
  ['people', T.hue.indigo, 'Chat with ' + GUIDE_NAME, 'Ask “why?” any time. “Not sure” is always an answer.'],
  ['check-circle', T.hue.green, 'Check your answers', 'Fix anything before we do the math.'],
  ['trend-up', T.hue.orange, 'See the math', 'Try different numbers and watch the gap change in front of you.'],
];

function home() {
  const main = mainPanel();
  const s = getState();
  const resume = s.started;
  const start = () => go(resume ? (s.messages.length ? 'chat' : 'prepare') : 'prepare');

  main.add(paint(MAIN_W, MAIN_H, (ctx) => {
    const pill = 'FREE GUIDED ASSESSMENT';
    const pf = font(700, 13);
    const pw = measure(pill, pf) + 13 * 1.1 + 28;
    rr(ctx, M + 4, 40, pw, 30, 15);
    ctx.fillStyle = T.rose;
    ctx.fill();
    drawText(ctx, pill, M + 18, 40, { f: pf, color: T.tint, lineH: 30, spacing: 1 });
    ctx.beginPath();
    ctx.arc(M + pw + 20, 55, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = T.highlightText;
    ctx.fill();
    drawText(ctx, 'NO SALES PRESSURE', M + pw + 34, 40, { f: pf, color: T.label2, lineH: 30, spacing: 1 });

    drawText(ctx, 'Life insurance,', M, 88, { f: font(800, 64), color: T.tint, lineH: 66, spacing: -2.2 });
    drawText(ctx, 'made simple.', M, 154, { f: font(800, 64), color: T.highlightText, lineH: 66, spacing: -2.2 });
    drawText(ctx, 'Find out how much coverage your family may need in one friendly conversation. We explain every question and show you every number.',
      M + 4, 242, { f: font(400, 20), color: T.label2, maxW: 620, lineH: 31 });
    if (!resume) drawText(ctx, '5 quick questions,\nthen a short chat', M + 430, 366, { f: font(400, 16), color: T.label2, lineH: 22 });

    ctx.fillStyle = T.edge;
    ctx.fillRect(M, 492, MAIN_W - M * 2, 1);
    [['shield', 'Private by design', 'Answers stay in this session'], ['check-circle', 'Educational guidance', 'No account, nothing to buy']].forEach(([ic, strong, text], i) => {
      const x = M + 4 + i * 330;
      icon(ctx, ic, x + 12, 530, 25, T.tint, 2);
      drawText(ctx, strong, x + 38, 510, { f: font(600, 16), lineH: 21 });
      drawText(ctx, text, x + 38, 531, { f: font(400, 14), color: T.label2, lineH: 19 });
    });

    // The stats band along the bottom of the card.
    rr(ctx, 0, 574, MAIN_W, 86, [0, 0, 24, 24]);
    ctx.fillStyle = T.tint;
    ctx.fill();
    [['~10', 'short questions'], ['100%', 'free'], ['0', 'accounts needed'], ['1', 'summary to keep']].forEach(([n, label], i) => {
      const cx = MAIN_W / 8 + (i * MAIN_W) / 4;
      const nf = font(700, 28, true);
      const lf = font(400, 15);
      const w = measure(n, nf) + 8 + measure(label, lf);
      drawText(ctx, n, cx - w / 2, 574, { f: nf, color: '#ffffff', lineH: 86 });
      drawText(ctx, label, cx - w / 2 + measure(n, nf) + 8, 576, { f: lf, color: T.onBrandMuted, lineH: 86 });
      if (i) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect((i * MAIN_W) / 4, 596, 1, 42); }
    });
  }), 0, 0);

  main.add(button(410, 62, { label: resume ? 'Continue Where You Left Off' : 'Start Your Free Assessment', icon: 'chevron-right', size: 20, onSelect: start }), M, 352);
  if (resume) main.add(button(210, 44, { label: 'Start fresh instead', variant: 'plain', size: 16, onSelect: () => { resetState(); go('prepare'); } }), M + 424, 361);
  main.add(button(250, 46, { label: 'See a sample family', variant: 'bordered', size: 17, onSelect: () => { loadSample(); go('results'); } }), M, 428);

  right.add(card(SIDE_W, 600), 0, 30, { layer: 0 });
  right.add(paint(SIDE_W, 600, (ctx) => {
    drawText(ctx, 'How it works', 30, 28, { f: font(800, 28), color: T.tint, lineH: 34, spacing: -0.6 });
    drawText(ctx, 'A calm, step-by-step chat. You stay in control of every answer.', 30, 68, { f: font(400, 16), color: T.label2, maxW: 350, lineH: 23 });
    HOW.forEach(([ic, hue, title, text], i) => {
      const y = 136 + i * 98;
      rr(ctx, 30, y, 42, 42, 12);
      ctx.fillStyle = hue;
      ctx.fill();
      icon(ctx, ic, 51, y + 21, 22, '#ffffff', 2.2);
      drawText(ctx, title, 88, y - 2, { f: font(600, 18), lineH: 24 });
      drawText(ctx, text, 88, y + 24, { f: font(400, 15), color: T.label2, maxW: 300, lineH: 21 });
    });
    ctx.fillStyle = T.edge;
    ctx.fillRect(30, 530, SIDE_W - 60, 1);
    drawText(ctx, 'To choose, point at a button and pinch or pull the trigger.', 30, 542, { f: font(500, 14), color: T.tint, maxW: 360, lineH: 20 });
  }), 0, 30);

  // Pip previews the chat, one message at a time, like the Home page of the 2D site.
  let shown = 0;
  let next = 0.7;
  say([]);
  return {
    main,
    tick(t, dt) {
      if (shown >= DEMO.length) return;
      next -= dt;
      if (next > 0) return;
      shown += 1;
      next = shown < DEMO.length && DEMO[shown].role === 'bot' ? 1.3 : 0.9;
      say(DEMO.slice(0, shown));
    },
    mood: () => (shown < DEMO.length && DEMO[shown].role === 'bot' ? 'typing' : 'idle'),
  };
}

// ---------- Basics: five short form questions before the chat ----------
const QUESTIONS = [
  { id: 'income', type: 'number', money: true, max: 100_000_000, prompt: 'What is your yearly income?', helper: 'Before taxes. A rough number is fine.', why: 'income' },
  { id: 'marital', type: 'options', prompt: 'What is your marital status?', helper: 'Choose Married if you share a household with a partner.', options: [['Single', 'single'], ['Married', 'married']], why: 'household' },
  { id: 'dependents', type: 'number', max: 20, prompt: 'How many dependents do you have?', helper: 'Children, or anyone else who relies on your income. Enter 0 if no one does.', why: 'household' },
  { id: 'debt', type: 'number', money: true, max: 100_000_000, prompt: 'What is your current total debt?', helper: `Include your mortgage, car loans, student loans and credit cards. ${GUIDE_NAME} will ask how much of it is the mortgage.`, why: 'otherDebts' },
  { id: 'coverage', type: 'options', prompt: 'Do you currently have life insurance?', helper: 'Include any coverage through work.', options: [['Yes', true], ['No', false]], why: 'existing' },
];

function prepare() {
  const main = mainPanel();
  let index = 0;
  let cont = null;
  let options = [];
  let input = null;
  const q = () => QUESTIONS[index];
  const answer = () => getState().form[q().id];
  const tooBig = () => q().type === 'number' && typeof answer() === 'number' && answer() > q().max;
  const blocked = () => answer() == null || tooBig();
  const save = (value) => setState((s) => ({ form: { ...s.form, [q().id]: value } }));

  function next() {
    if (index === QUESTIONS.length - 1) {
      setState((s) => ({ ...applyForm(s), started: true }));
      go('chat');
    } else {
      index += 1;
      render();
    }
  }

  const head = main.add(el(MAIN_W, 350, (ctx) => {
    const progress = Math.round(((index + 1) / QUESTIONS.length) * 100);
    drawText(ctx, `Question ${index + 1} of ${QUESTIONS.length}`, M, 32, { f: font(600, 15), color: T.label2, lineH: 20 });
    drawText(ctx, `${progress}% complete`, MAIN_W - M, 32, { f: font(600, 15), color: T.label2, lineH: 20, align: 'right' });
    rr(ctx, M, 62, MAIN_W - M * 2, 6, 3);
    ctx.fillStyle = T.grouped3;
    ctx.fill();
    rr(ctx, M, 62, ((MAIN_W - M * 2) * progress) / 100, 6, 3);
    ctx.fillStyle = T.highlight;
    ctx.fill();
    rr(ctx, M, 104, 46, 46, 12);
    ctx.fillStyle = T.rose;
    ctx.fill();
    drawText(ctx, String(index + 1).padStart(2, '0'), M + 23, 104, { f: font(700, 15), color: T.tint, lineH: 46, align: 'center' });
    const h = drawText(ctx, q().prompt, M, 170, { f: font(800, 38), color: T.tint, maxW: MAIN_W - M * 2, lineH: 44, spacing: -1.1 });
    drawText(ctx, q().helper, M, 180 + h, { f: font(400, 19), color: T.label2, maxW: 620, lineH: 28 });
  }), 0, 0);
  const back = main.add(button(130, 52, { label: 'Back', variant: 'bordered', onSelect: () => { index -= 1; render(); } }), M, 572);

  function render() {
    main.clear('q');
    clearRight();
    head.redraw();
    back.mesh.visible = index > 0;
    options = [];
    input = null;
    const last = index === QUESTIONS.length - 1;
    const w = last ? 290 : 190;
    cont = main.add(button(w, 52, { label: last ? `Start Chat with ${GUIDE_NAME}` : 'Continue', icon: 'chevron-right', onSelect: next, disabled: blocked() }), MAIN_W - M - w, 572, { bucket: 'q' });

    if (q().type === 'options') {
      options = q().options.map(([label, value], i) => main.add(option(MAIN_W - M * 2, 68, { label, on: answer() === value, onSelect: () => save(value) }), M, 360 + i * 80, { bucket: 'q' }));
      options.forEach((o, i) => { o.value = q().options[i][1]; });
    } else {
      input = main.add(el(MAIN_W - M * 2, 110, (ctx) => {
        const v = answer();
        rr(ctx, 1, 1, MAIN_W - M * 2 - 2, 70, 14);
        ctx.fillStyle = T.bg;
        ctx.fill();
        ctx.strokeStyle = tooBig() ? T.danger : T.tint;
        ctx.lineWidth = 2;
        ctx.stroke();
        let x = 22;
        if (q().money) { drawText(ctx, '$', x, 0, { f: font(600, 24), color: T.label2, lineH: 72 }); x += 22; }
        drawText(ctx, typeof v === 'number' ? v.toLocaleString('en-US') : 'Use the number pad on your right', x, 0,
          { f: typeof v === 'number' ? font(600, 28) : font(400, 20), color: typeof v === 'number' ? T.label : T.gray, lineH: 72 });
        if (tooBig()) drawText(ctx, `Please enter a number up to ${q().max.toLocaleString('en-US')}.`, 4, 80, { f: font(600, 15), color: T.danger, lineH: 20 });
      }), M, 360, { bucket: 'q' }).redraw();
      // "Not sure" leaves the answer empty (never zero); Pip asks again in the chat.
      main.add(button(380, 40, { label: `Not sure? Skip, and ${GUIDE_NAME} will ask later`, variant: 'plain', size: 16, onSelect: () => { save(null); next(); } }), M - 8, 476, { bucket: 'q' });
      numberPad({
        title: q().prompt, money: q().money, value: answer(), onChange: save,
        action: { label: last ? `Start Chat with ${GUIDE_NAME}` : 'Continue', icon: 'chevron-right', onSelect: () => { if (!blocked()) next(); }, disabled: blocked },
      });
    }
    say([
      { role: 'bot', text: index === 0 ? 'Five quick questions first, then we’ll chat. A rough number is always fine.' : 'Thanks! Take your time with this one.' },
      { role: 'bot', why: true, text: why(q().why) },
    ]);
  }
  render();

  return {
    main,
    update() {
      for (const o of options) { o.on = answer() === o.value; o.redraw(); }
      input?.redraw();
      cont.set({ disabled: blocked() });
      pad?.refresh();
    },
  };
}

// ---------- Chat with Pip ----------
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const pause = () => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : 450));
const push = (...msgs) => setState((s) => ({ messages: [...s.messages, ...msgs] }));

async function botSay(lines, last) {
  for (let i = 0; i < lines.length; i++) {
    setState({ typing: true });
    await pause();
    push({ role: 'bot', text: lines[i], ...(i === lines.length - 1 ? last : null) });
  }
  setState({ typing: false });
}

async function begin() {
  const s = getState();
  const step = nextStep(s);
  const q = step ? question(step, s) : null;
  await botSay([...intro(s), q ? q.text : CLOSING], q ? { replies: q.replies } : { done: true });
}

async function send(text) {
  const s = getState();
  if (!text.trim() || s.typing) return;
  push({ role: 'user', text: text.trim() });
  const step = nextStep(s);
  if (!step) return botSay([CLOSING], { done: true });

  const res = respond(step, text, s);
  if (res.updates || res.pending !== undefined) {
    setState((st) => ({
      profile: { ...st.profile, ...res.updates },
      pending: res.pending === undefined ? st.pending : res.pending,
    }));
  }

  if (res.why) {
    const replies = question(step, getState()).replies.filter((r) => r !== WHY);
    return botSay(res.say, { replies, why: true });
  }
  if (res.replies) return botSay(res.say, { replies: res.replies });

  const after = getState();
  const next = nextStep(after);
  if (next) {
    const q = question(next, after);
    return botSay([...res.say, q.text], { replies: q.replies });
  }
  return botSay([...res.say, CLOSING], { done: true });
}

function chat() {
  const main = mainPanel();
  const HEAD = 84;
  let composer = 40; // height of the reply area at the bottom of the card
  let chipsKey = null;
  let padKey = null;
  let phase = 0;

  const log = main.add(el(MAIN_W, MAIN_H, (ctx) => {
    const s = getState();
    const msgs = s.messages;
    // Newest at the bottom. Older messages scroll off under the header.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEAD, MAIN_W, MAIN_H - HEAD - composer);
    ctx.clip();
    let y = MAIN_H - composer - 10;
    const maxW = (MAIN_W - 56 - 44) * 0.8;
    if (s.typing) {
      y -= 46;
      rr(ctx, 72, y, 70, 46, [20, 20, 20, 6]);
      ctx.fillStyle = T.grouped;
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(93 + i * 14, y + 23 - (phase === i ? 3 : 0), 4, 0, Math.PI * 2);
        ctx.fillStyle = phase === i ? T.label2 : '#c2c2c7';
        ctx.fill();
      }
      drawPip(ctx, 28, y + 12, 34);
      y -= 8;
    }
    for (let i = msgs.length - 1; i >= 0 && y > HEAD; i--) {
      const m = msgs[i];
      const b = bubbleLayout(m, 20, maxW);
      y -= b.h;
      drawBubble(ctx, b, m.role === 'user' ? MAIN_W - 28 - b.w : 72, y);
      // Pip's face sits beside the last bubble in each run of her messages.
      const face = m.role === 'bot' && (i === msgs.length - 1 ? !s.typing : msgs[i + 1].role !== 'bot');
      if (face) drawPip(ctx, 28, y + b.h - 34, 34);
      y -= i > 0 && msgs[i - 1].role !== m.role ? 14 : 8;
    }
    ctx.restore();

    rr(ctx, 0, 0, MAIN_W, HEAD, [24, 24, 0, 0]);
    ctx.fillStyle = T.bg;
    ctx.fill();
    const fade = ctx.createLinearGradient(0, HEAD, 0, HEAD + 28);
    fade.addColorStop(0, 'rgba(255,255,255,1)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(1, HEAD, MAIN_W - 2, 28);
    ctx.fillStyle = T.edge;
    ctx.fillRect(0, HEAD - 1, MAIN_W, 1);
    ctx.fillRect(0, MAIN_H - composer, MAIN_W, 1);
    drawPip(ctx, 28, 16, 52);
    drawText(ctx, GUIDE_NAME, 94, 18, { f: font(600, 20), lineH: 26 });
    ctx.beginPath();
    ctx.arc(98, 56, 4, 0, Math.PI * 2);
    ctx.fillStyle = T.success;
    ctx.fill();
    drawText(ctx, 'Your guide · Here to help', 108, 46, { f: font(400, 15), color: T.label2, lineH: 20 });
    drawText(ctx, 'Guided mode: questions follow a set script while the AI connection is being built.', MAIN_W / 2, MAIN_H - 30, { f: font(400, 12.5), color: T.label2, lineH: 18, align: 'center' });
  }), 0, 0);

  function update() {
    const s = getState();
    const last = s.messages[s.messages.length - 1];
    const replies = last && last.role === 'bot' && !s.typing ? last.replies : undefined;
    const finished = !!last?.done && !s.typing;

    const nextKey = finished ? 'done' : JSON.stringify(replies ?? null);
    if (nextKey !== chipsKey) {
      chipsKey = nextKey;
      main.clear('chips');
      if (finished) {
        composer = 110;
        main.add(button(300, 54, { label: 'Review My Answers', icon: 'check-circle', iconLeft: true, onSelect: () => go('review') }), (MAIN_W - 300) / 2, MAIN_H - 96, { bucket: 'chips' });
      } else {
        const chips = (replies ?? []).map((r) => chip(r, { why: r === WHY, onSelect: () => void send(r) }));
        const rows = [[]];
        let x = 28;
        for (const c of chips) {
          if (x + c.w > MAIN_W - 28 && rows[rows.length - 1].length) { rows.push([]); x = 28; }
          rows[rows.length - 1].push([c, x]);
          x += c.w + 10;
        }
        const h = chips.length ? rows.length * 58 - 10 : 0;
        composer = h + 54;
        rows.forEach((r, i) => r.forEach(([c, cx]) => main.add(c, cx, MAIN_H - 38 - h + i * 58, { bucket: 'chips' })));
      }
    }

    // A number pad for the questions that take an amount, an age or a number of years.
    const step = nextStep(s);
    const wantsNumber = !!replies && !finished && !s.pending && step && FIELD[step].kind !== 'choice';
    const nextPad = wantsNumber ? step : null;
    if (nextPad !== padKey) {
      padKey = nextPad;
      clearRight();
      if (wantsNumber) {
        const kind = FIELD[step].kind;
        numberPad({
          title: FIELD[step].label, money: kind === 'money',
          hint: kind === 'money' ? 'A rough number is fine. Or point at one of the suggestions.' : kind === 'years' ? 'A number of years, from 1 to 70.' : 'In years. Use 0 for a baby.',
          action: { label: 'Send', icon: 'chevron-right', onSelect: (v) => void send(kind === 'money' ? formatMoney(v) : String(v)), disabled: (v) => v == null },
        });
      }
    }
    log.redraw();
  }

  say([
    { role: 'bot', text: 'Point at a suggestion, or use the number pad on your right.' },
    { role: 'bot', text: 'Ask “why?” any time and I’ll explain. “Not sure” is always an answer.' },
  ]);
  const s = getState();
  if (!s.messages.length && !s.typing) void begin();
  update();

  return {
    main,
    update,
    tick(t) {
      const p = Math.floor(t * 4) % 3;
      if (p !== phase && getState().typing) { phase = p; log.redraw(); }
    },
    mood: () => (getState().typing ? 'typing' : 'idle'),
  };
}

// ---------- Review ----------
const HINT = {
  income: 'Yearly, before taxes.',
  support: 'Yearly amount your family would need. Many people use 70–80% of income.',
  years: 'How long the support should last, from 1 to 70 years.',
  youngestAge: 'In years. Use 0 for a baby.',
  mortgage: 'What’s left to pay. Enter 0 if you don’t have one.',
  otherDebts: 'Car loans, student loans, and credit cards. Enter 0 for none.',
  finalExpenses: 'An amount for funeral costs and final bills.',
  education: 'Education or another big future cost, in total.',
  existing: 'Through work or on your own. Enter 0 for none.',
  savings: 'Savings or investments your family could use.',
};
const COLUMNS = [['household', 'income'], ['debts', 'future', 'resources']];

function review() {
  const main = mainPanel();
  const COL_W = (MAIN_W - M * 2 - 16) / 2;
  let editing = null;

  main.add(paint(MAIN_W, 112, (ctx) => {
    drawText(ctx, 'Check your answers', M, 28, { f: font(700, 34), lineH: 41, spacing: -0.4 });
    drawText(ctx, 'Make sure everything looks right. Point at any answer to change it.', M, 72, { f: font(400, 17), color: T.label2, lineH: 24 });
  }), 0, 0);

  function confirmAll() {
    setState((s) => {
      const next = { ...s.profile };
      FIELDS.forEach((f) => {
        const field = next[f.id];
        if (field.status === 'proposed') next[f.id] = { status: 'confirmed', value: field.value };
        else if (f.role === 'optional' && (field.status === 'empty' || field.status === 'unknown')) next[f.id] = { status: 'skipped', value: null };
      });
      return { profile: next };
    });
    go('results');
  }

  const edit = (id) => { editing = id; side(); rows(); };

  function rows() {
    main.clear('rows');
    const { profile } = getState();
    const missing = missingRequired(profile);
    const showAge = ['kids', 'both'].includes(String(profile.household.value)) || profile.youngestAge.status !== 'empty';
    COLUMNS.forEach((groups, c) => {
      const x = M + c * (COL_W + 16);
      let y = 122;
      for (const g of GROUPS.filter((gr) => groups.includes(gr.id))) {
        const fields = FIELDS.filter((f) => f.group === g.id && (f.id !== 'youngestAge' || showAge));
        main.add(paint(COL_W, 28, (ctx) => drawText(ctx, g.title, 14, 0, { f: font(600, 16), lineH: 24 })), x, y, { bucket: 'rows' });
        y += 28;
        main.add(card(COL_W, fields.length * 56, { r: 16, shadow: false }), x, y, { bucket: 'rows' });
        fields.forEach((f, i) => {
          const field = profile[f.id];
          const flagged = f.role === 'required' && missing.includes(f.id);
          const e = row(COL_W, 56, {
            title: f.label, first: i === 0, chevron: true, selected: editing === f.id,
            value: field.status === 'empty' ? 'Add' : formatField(f.id, field),
            valueColor: flagged ? T.warning : field.status === 'empty' ? T.tint : editing === f.id ? T.tint : T.label2,
            note: f.role === 'optional' ? 'Optional' : undefined,
            onSelect: () => edit(f.id),
          });
          main.add(e, x, y + i * 56, { layer: 2, bucket: 'rows' });
        });
        y += fields.length * 56 + 14;
      }
    });
  }

  function side() {
    clearRight();
    const { profile } = getState();
    if (editing) return editor(editing, profile[editing]);

    const missing = missingRequired(profile);
    const ok = !missing.length;
    const title = ok ? 'Everything we need is here' : missing.length === 1 ? 'One answer still needed' : `${missing.length} answers still needed`;
    const msg = ok
      ? 'Optional answers you leave blank won’t be counted.'
      : `We need ${listJoin(missing.map((id) => FIELD[id].label.toLowerCase()))} before we can do the math. A good guess is fine.`;
    const lines = wrap(msg, font(400, 15), SIDE_W - 76);
    const h = 60 + lines.length * 21 + (ok ? 0 : 44);
    right.add(card(SIDE_W, h, { r: 20 }), 0, 120, { layer: 0 });
    right.add(paint(SIDE_W, h, (ctx) => {
      icon(ctx, ok ? 'check-circle' : 'exclamation', 32, 31, 24, ok ? T.success : T.warning, 2);
      drawText(ctx, title, 56, 20, { f: font(600, 17), lineH: 22 });
      drawText(ctx, lines.join('\n'), 56, 46, { f: font(400, 15), color: T.label2, lineH: 21 });
    }), 0, 120);
    if (!ok) {
      const label = `Fill In ${FIELD[missing[0]].label}`;
      right.add(button(Math.min(SIDE_W - 60, measure(label, font(600, 16)) + 28), 36, { label, variant: 'plain', size: 16, onSelect: () => edit(missing[0]) }), 44, 120 + h - 46);
    }
    right.add(button(SIDE_W, 58, { label: 'Confirm & See Results', size: 20, disabled: !ok, onSelect: confirmAll }), 0, 140 + h);
    right.add(button(SIDE_W, 52, { label: 'Back to Chat', variant: 'inverse', icon: 'chevron-left', iconLeft: true, onSelect: () => go('chat') }), 0, 212 + h);
  }

  function editor(id, field) {
    const def = FIELD[id];
    const close = () => { editing = null; side(); rows(); };
    const save = (next) => { setField(id, next); close(); };
    const alt = (y) => {
      const optional = def.role === 'optional';
      right.add(button(optional ? 130 : 200, 44, { label: 'I’m Not Sure', variant: 'inverse', size: 16, onSelect: () => save({ status: 'unknown', value: null }) }), 0, y);
      if (optional) right.add(button(140, 44, { label: 'Leave It Out', variant: 'inverse', size: 16, onSelect: () => save({ status: 'skipped', value: null }) }), 140, y);
      right.add(button(optional ? 120 : 200, 44, { label: 'Cancel', variant: 'plain', size: 16, onSelect: close }), optional ? 300 : 220, y);
    };

    if (def.kind === 'choice') {
      const entries = Object.entries(HOUSEHOLD);
      right.add(card(SIDE_W, 60 + entries.length * 58 + 12, { r: 20 }), 0, 100, { layer: 0 });
      right.add(paint(SIDE_W, 56, (ctx) => drawText(ctx, def.label, 24, 18, { f: font(600, 19), lineH: 26 })), 0, 100);
      entries.forEach(([v, label], i) => right.add(row(SIDE_W - 16, 58, { title: label, check: field.value === v, onSelect: () => save({ status: 'confirmed', value: v }) }), 8, 156 + i * 58, { layer: 2 }));
      return alt(180 + entries.length * 58);
    }

    const [min, max] = def.kind === 'years' ? [1, 70] : def.kind === 'age' ? [0, 30] : [0, Infinity];
    numberPad({
      title: def.label, money: def.kind === 'money', hint: HINT[id],
      value: typeof field.value === 'number' ? field.value : null,
      action: {
        label: 'Save', disabled: (v) => v == null,
        onSelect(v) {
          if (v < min || v > max) return pad.fail(`Enter a number from ${min} to ${max}.`);
          save({ status: 'confirmed', value: v });
        },
      },
    });
    alt(592);
  }

  say([{ role: 'bot', text: 'Here’s everything you told me. Nothing is final until you confirm it.' }, { role: 'bot', text: 'Only confirmed answers reach the math. Anything marked “not sure” needs a best guess first.' }]);
  rows();
  side();
  return { main, update() { rows(); if (!editing) side(); } };
}

// ---------- Results ----------
// One color per term, shared by the list on the card and the blocks in front of you.
const TERM_COLOR = {
  support: T.tint, mortgage: T.shiraz, otherDebts: T.hue.orange, finalExpenses: T.hue.brown, education: T.hue.indigo,
  existing: T.partner, savings: T.hue.green, gap: T.highlight,
};

function explain(p, r) {
  const years = Number(p.years.value);
  const support = r.needs.find((t) => t.id === 'support');
  const debts = r.needs.filter((t) => t.id !== 'support' && t.included && t.value > 0);
  let text = `You said your family would need ${formatMoney(Number(p.support.value))} a year for ${plural(years, 'year')}, which comes to ${formatMoney(support.value)}.`;
  if (debts.length) text += ` Adding ${listJoin(debts.map((t) => t.label.toLowerCase()))} brings the total to ${formatMoney(r.totalNeeds)}.`;
  if (r.totalResources > 0) {
    text += ` You already have ${formatMoney(r.totalResources)} in coverage and savings, ` +
      (r.additional > 0 ? `so the gap is about ${formatMoney(r.additional)}.` : 'which covers the needs you listed.');
  } else if (r.additional > 0) {
    text += ' You don’t have coverage or savings counted yet, so the full amount is what to consider.';
  }
  if (r.additional === 0) text += ' That doesn’t mean every situation is covered. It’s worth checking again when life changes.';
  return text;
}

// Two stacks on a tray at waist height: what the family would need, and what is already
// there, with the gap as a glowing block that brings the second stack level with the first.
function makeStacks() {
  const group = new THREE.Group();
  group.position.set(0, 0.66, -1.12);
  rig.add(group);
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 64), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.006, 8, 96), new THREE.MeshBasicMaterial({ color: T.highlight }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  group.add(tray, rim);

  const MAX = 0.24;
  const SIDE = 0.15;
  const box = new THREE.BoxGeometry(SIDE, 1, SIDE);
  const blocks = {};
  for (const [id, column] of [['support', 0], ['mortgage', 0], ['otherDebts', 0], ['finalExpenses', 0], ['education', 0], ['existing', 1], ['savings', 1], ['gap', 1]]) {
    const gap = id === 'gap';
    const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: TERM_COLOR[id], transparent: gap, opacity: gap ? 0.38 : 1, emissive: gap ? T.highlight : '#000000', emissiveIntensity: 0.5 }));
    mesh.position.x = column ? 0.12 : -0.12;
    group.add(mesh);
    blocks[id] = { mesh, column, h: 0, target: 0 };
  }

  const sign = (text, x) => {
    const e = el(230, 62, (ctx) => {
      rr(ctx, 0, 0, 230, 62, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fill();
      drawText(ctx, e.title, 115, 8, { f: font(500, 14), color: T.label2, lineH: 18, align: 'center' });
      drawText(ctx, e.value ?? '', 115, 27, { f: font(700, 22, true), color: e.color ?? T.label, lineH: 28, align: 'center' });
    });
    e.title = text;
    e.mesh.scale.setScalar(0.62);
    e.mesh.position.set(x, 0.06, 0.24);
    e.mesh.rotation.x = -0.6;
    e.mesh.renderOrder = 3;
    group.add(e.mesh);
    return e;
  };
  const signs = { needs: sign('Your family would need', -0.125), have: sign('You already have', 0.125), gap: sign('The gap', 0.39) };
  signs.gap.color = T.highlightText;
  signs.gap.mesh.position.z = 0.03;
  signs.gap.mesh.rotation.x = -0.25;

  return {
    set(r) {
      const scale = MAX / Math.max(r.totalNeeds, r.totalResources, 1);
      for (const t of [...r.needs, ...r.resources]) blocks[t.id].target = t.included ? t.value * scale : 0;
      blocks.gap.target = r.additional * scale;
      signs.needs.value = formatMoney(r.totalNeeds);
      signs.have.value = formatMoney(r.totalResources);
      signs.gap.value = formatMoney(r.additional);
      signs.gap.mesh.visible = r.additional > 0;
      Object.values(signs).forEach((e) => e.redraw());
    },
    tick(t, dt) {
      const top = [0.01, 0.01];
      for (const b of Object.values(blocks)) {
        b.h += (b.target - b.h) * Math.min(1, dt * 5);
        b.mesh.visible = b.h > 0.0015;
        b.mesh.scale.y = Math.max(b.h, 0.001);
        b.mesh.position.y = top[b.column] + b.h / 2;
        top[b.column] += b.h;
      }
      const gap = blocks.gap;
      gap.mesh.material.opacity = 0.34 + 0.1 * Math.sin(t * 2.4);
      signs.gap.mesh.position.y = Math.max(0.1, gap.mesh.position.y);
      group.rotation.y = Math.sin(t * 0.3) * 0.12;
    },
    dispose() {
      Object.values(signs).forEach((e) => e.dispose());
      group.traverse((o) => { if (o.isMesh && o.geometry !== box) { o.geometry.dispose(); } o.material?.dispose?.(); });
      box.dispose();
      group.removeFromParent();
    },
  };
}

function results() {
  const main = mainPanel();
  const estimate = () => {
    const p = getState().profile;
    const unconfirmed = FIELDS.some((f) => f.role === 'required' && p[f.id].status !== 'confirmed');
    const r = calculate(p);
    return { p, r, ready: !unconfirmed && r.ready };
  };

  if (!estimate().ready) {
    main.add(paint(MAIN_W, 300, (ctx) => {
      ctx.beginPath();
      ctx.arc(MAIN_W / 2, 60, 36, 0, Math.PI * 2);
      ctx.fillStyle = T.fill3;
      ctx.fill();
      icon(ctx, 'check-circle', MAIN_W / 2, 60, 36, T.tint, 2.2);
      drawText(ctx, 'Let’s check your answers first', MAIN_W / 2, 116, { f: font(600, 24), lineH: 32, align: 'center' });
      drawText(ctx, 'Once you’ve confirmed them, we’ll show your estimate and the math behind it.', MAIN_W / 2, 156, { f: font(400, 17), color: T.label2, maxW: 420, lineH: 24, align: 'center' });
    }), 0, 150);
    main.add(button(240, 52, { label: 'Review Answers', onSelect: () => go('review') }), (MAIN_W - 240) / 2, 400);
    say([{ role: 'bot', text: 'We’re almost there. I just need you to confirm your answers before I do the math.' }]);
    return { main };
  }

  const stacks = makeStacks();
  const COL = 334;
  const X2 = MAIN_W - M - COL;
  let copied = null;

  const sheet = main.add(el(MAIN_W, MAIN_H, (ctx) => {
    const { p, r } = estimate();
    if (!r.ready) return;
    drawText(ctx, 'Your estimate', M, 26, { f: font(700, 34), lineH: 41, spacing: -0.4 });

    // The brand stat card, with the orange arc in its corner.
    ctx.save();
    rr(ctx, M, 84, COL, 152, 20);
    ctx.fillStyle = T.tint;
    ctx.fill();
    ctx.clip();
    ctx.beginPath();
    ctx.arc(M + COL - 6, 84 + 152 + 34, 78, 0, Math.PI * 2);
    ctx.strokeStyle = T.highlight;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, formatMoney(r.additional), M + 20, 102, { f: font(700, 44, true), color: '#ffffff', lineH: 50 });
    drawText(ctx, r.additional > 0 ? 'Estimated additional coverage to consider' : 'No additional coverage needed for what you listed', M + 20, 158,
      { f: font(400, 16), color: T.onBrandMuted, maxW: COL - 110, lineH: 21 });
    drawText(ctx, explain(p, r), M + 2, 254, { f: font(400, 16), maxW: COL - 4, lineH: 23 });

    // How we got there: every term, in the order the math uses it.
    drawText(ctx, 'How we got there', X2 + 14, 84, { f: font(600, 17), lineH: 24 });
    const needs = r.needs.filter((t) => t.included);
    const have = r.resources.filter((t) => t.included);
    const lines = [
      ...needs.map((t) => ({ id: t.id, title: t.label, sub: t.detail, value: `+ ${formatMoney(t.value)}` })),
      { title: 'What your family would need', value: formatMoney(r.totalNeeds), bold: true },
      ...have.map((t) => ({ id: t.id, title: t.label, value: `− ${formatMoney(t.value)}` })),
      { id: 'gap', title: 'Estimated additional coverage', value: formatMoney(r.additional), bold: true, tint: true },
    ].map((l) => {
      const vw = measure(l.value, font(l.bold ? 700 : 500, 16));
      const titleLines = wrap(l.title, font(l.bold ? 700 : 500, 16), COL - 32 - vw - 12 - (l.id ? 18 : 0));
      return { ...l, titleLines, h: Math.max(40, titleLines.length * 20 + (l.sub ? 18 : 0) + 16) };
    });
    const total = lines.reduce((sum, l) => sum + l.h, 0);
    rr(ctx, X2 + 0.5, 114.5, COL - 1, total - 1, 16);
    ctx.fillStyle = T.bg;
    ctx.fill();
    ctx.strokeStyle = T.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    let y = 114;
    lines.forEach((l, i) => {
      if (i) { ctx.fillStyle = T.separator; ctx.fillRect(X2 + 14, y, COL - 14, 1); }
      let x = X2 + 14;
      const th = l.titleLines.length * 20 + (l.sub ? 18 : 0);
      const ty = y + (l.h - th) / 2;
      if (l.id) {
        rr(ctx, x, ty + 5, 10, 10, 3);
        ctx.fillStyle = TERM_COLOR[l.id];
        ctx.fill();
        x += 18;
      }
      drawText(ctx, l.titleLines.join('\n'), x, ty, { f: font(l.bold ? 700 : 500, 16), lineH: 20 });
      if (l.sub) drawText(ctx, l.sub, x, ty + l.titleLines.length * 20, { f: font(400, 13.5), color: T.label2, lineH: 18 });
      drawText(ctx, l.value, X2 + COL - 14, y, { f: font(l.bold ? 700 : 500, 16), color: l.tint ? T.tint : l.bold ? T.label : T.label2, lineH: l.h, align: 'right' });
      y += l.h;
    });
    if (r.leftOut.length) drawText(ctx, `Not included: ${r.leftOut.join(', ').toLowerCase()}.`, X2 + 14, y + 8, { f: font(400, 13), color: T.label2, maxW: COL - 28, lineH: 18 });
  }), 0, 0);

  // What-if controls, summary and the two kinds of insurance, on the right.
  function adjust(id, delta, min, max) {
    const p = getState().profile;
    copied = null;
    setField(id, { status: 'confirmed', value: Math.min(max, Math.max(min, Number(p[id].value) + delta)) });
  }
  right.add(paint(SIDE_W, 30, (ctx) => drawText(ctx, 'Try a different scenario', 16, 0, { f: font(600, 17), lineH: 24 })), 0, 0);
  right.add(card(SIDE_W, 136, { r: 20 }), 0, 30, { layer: 0 });
  const scenario = right.add(el(SIDE_W, 136, (ctx) => {
    const p = getState().profile;
    [['Years of support', plural(Number(p.years.value), 'year')], ['Yearly support', formatMoney(Number(p.support.value))]].forEach(([label, value], i) => {
      if (i) { ctx.fillStyle = T.separator; ctx.fillRect(18, 68, SIDE_W - 18, 1); }
      drawText(ctx, label, 18, 12 + i * 68, { f: font(500, 17), lineH: 22 });
      drawText(ctx, value, 18, 35 + i * 68, { f: font(400, 15), color: T.label2, lineH: 20 });
    });
  }), 0, 30);
  const steppers = [['years', 1, 1, 70], ['support', 5000, 0, 10_000_000]].flatMap(([id, step, min, max], i) => [-1, 1].map((dir) => {
    const b = button(52, 40, { label: dir < 0 ? '−' : '+', variant: 'bordered', size: 22, onSelect: () => adjust(id, dir * step, min, max) });
    b.limit = () => Number(getState().profile[id].value) === (dir < 0 ? min : max);
    return right.add(b, SIDE_W - 16 - (dir < 0 ? 112 : 52), 44 + i * 68, { layer: 2 });
  }));
  right.add(paint(SIDE_W, 24, (ctx) => drawText(ctx, 'Changes here update your answers, the math and the blocks.', 16, 0, { f: font(400, 13), color: T.label2, lineH: 18 })), 0, 174);

  const copy = right.add(button(SIDE_W, 56, {
    label: 'Copy Summary', size: 19,
    async onSelect() {
      const { p, r } = estimate();
      try { await navigator.clipboard.writeText(summaryText(p, r)); copied = 'ok'; } catch { copied = 'fail'; }
      refresh();
    },
  }), 0, 212);
  right.add(button(SIDE_W, 50, { label: 'Change My Answers', variant: 'inverse', onSelect: () => go('review') }), 0, 280);

  right.add(paint(SIDE_W, 30, (ctx) => drawText(ctx, 'Good to know', 16, 0, { f: font(600, 17), lineH: 24 })), 0, 352);
  right.add(card(SIDE_W, 252, { r: 20 }), 0, 382, { layer: 0 });
  right.add(paint(SIDE_W, 252, (ctx) => {
    [['calendar', T.hue.orange, 'Term insurance', 'Covers a set number of years. Often used for needs with an end date, like raising kids or paying off a mortgage.'],
      ['shield', T.hue.teal, 'Permanent insurance', 'Designed to last longer, and may include features beyond the death benefit, depending on the product.']].forEach(([ic, hue, title, text], i) => {
      const y = 16 + i * 122;
      if (i) { ctx.fillStyle = T.separator; ctx.fillRect(62, y - 8, SIDE_W - 62, 1); }
      rr(ctx, 18, y + 2, 32, 32, 8);
      ctx.fillStyle = hue;
      ctx.fill();
      icon(ctx, ic, 34, y + 18, 19, '#ffffff', 2);
      drawText(ctx, title, 62, y, { f: font(500, 17), lineH: 22 });
      drawText(ctx, text, 62, y + 24, { f: font(400, 14.5), color: T.label2, maxW: SIDE_W - 84, lineH: 20 });
    });
  }), 0, 382);

  function refresh() {
    const { p, r, ready } = estimate();
    if (!ready) return null; // answers were just cleared; Start Over is taking us home
    sheet.redraw();
    scenario.redraw();
    steppers.forEach((b) => b.set({ disabled: b.limit() }));
    copy.set({ label: copied === 'ok' ? 'Summary Copied' : copied === 'fail' ? 'Copy Isn’t Available Here' : 'Copy Summary', variant: copied ? 'inverse' : 'filled' });
    stacks.set(r);
    say([
      { role: 'bot', text: r.additional > 0 ? `The glowing block in front of you is the gap: about ${formatMoney(r.additional)}.` : 'For what you listed, your coverage and savings already reach the top of the stack.' },
      { role: 'bot', text: 'Try the + and − on your right and watch it move. It’s a starting point for a conversation with a licensed professional, not a quote.' },
    ]);
    return p;
  }
  refresh();

  return { main, update: refresh, tick: (t, dt) => stacks.tick(t, dt), dispose: () => stacks.dispose() };
}

// ---------- routing ----------
const SCREENS = { home, prepare, chat, review, results };
let current = null;
let appear = 1;

function fade(k) {
  for (const panel of [current.main, right]) {
    for (const list of panel.buckets.values()) for (const e of list) e.mesh.material.opacity = (e.enabled ? 1 : 0.4) * k;
  }
  current.main.group.position.z = FOCUS.z - (1 - k) * 0.12;
}

function show() {
  if (current) {
    current.dispose?.();
    current.main.dispose();
  }
  current = null; // a screen can change state while it builds; the old one must not hear it
  clearRight();
  clearTimeout(confirmTimer);
  startOver.set({ label: 'Start Over', variant: 'plain' });
  const route = readRoute();
  document.body.dataset.route = route;
  startOver.mesh.visible = route !== 'home';
  stepper.redraw();
  current = SCREENS[route]();
  appear = 0;
  fade(0);
}

export function start() {
  if (location.hash.includes('sample')) loadSample();
  window.addEventListener('hashchange', show);
  subscribe(() => current?.update?.());
  show();
  onFrame((t, dt) => {
    if (appear < 1) {
      appear = Math.min(1, appear + dt / 0.32);
      fade(1 - (1 - appear) ** 3);
    }
    current.tick?.(t, dt);
    pip.tick(t, current.mood?.() ?? 'idle');
  });
}
