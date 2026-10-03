// LinqLife Advisor3D: the guided life insurance assessment, in a headset.
// Same flow, copy and math as the 2D frontend; see docs/advisor3d.md.
import { enterXR } from './xr/world.js';
import { start } from './screens.js';

start();

// Entry buttons. A headset shows the ones it supports; a desktop browser shows neither
// and the mouse and keyboard work instead.
for (const [id, mode] of [['enter-vr', 'immersive-vr'], ['enter-ar', 'immersive-ar']]) {
  const b = document.getElementById(id);
  navigator.xr?.isSessionSupported(mode).then((ok) => {
    if (!ok) return;
    b.hidden = false;
    document.body.classList.add('has-xr');
    b.addEventListener('click', () => enterXR(mode).catch((err) => console.warn('Could not start the session', err)));
  }).catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
