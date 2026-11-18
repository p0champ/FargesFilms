import * as THREE from './vendor/three.module.js';
import { build as buildBullpen } from './rooms/bullpen.js';
import { createPanel, PANEL_W, PANEL_H } from './panel.js';
import { LOGOS } from './logos.js';

const ROOMS = { bullpen: buildBullpen };
const params = new URLSearchParams(location.search);
const roomKey = ROOMS[params.get('room')] ? params.get('room') : 'bullpen';

const statusEl = document.getElementById('status');
const enterBtn = document.getElementById('enter');
const lightsBtn = document.getElementById('lights');
const say = (t) => { statusEl.textContent = t; };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Sharpness in the headset: render above the default eye-buffer size and
// keep full resolution right out to the edges of the view.
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(Number(params.get('scale')) || 1.4);
renderer.xr.setFoveation(0);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const room = ROOMS[roomKey](renderer, () => { window.__loaded = true; });
scene.add(room.root);
scene.background = room.background;
document.getElementById('room-name').textContent = room.name;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.copy(room.seatedEye);
camera.rotation.order = 'YXZ';
camera.layers.enable(1); // flat preview shows the left-eye image

// ----- preview on a flat screen: drag to look around -----
let yaw = Number(params.get('yaw')) || 0;
let pitch = Number(params.get('pitch')) || 0;
let dragging = false, lastX = 0, lastY = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); });
const _ndc = new THREE.Vector2(), _mouseRay = new THREE.Raycaster();
function mouseRay(e) {
  _ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  _mouseRay.setFromCamera(_ndc, camera);
  return _mouseRay.ray;
}
let moved = 0;
el.addEventListener('pointerup', (e) => { dragging = false; if (moved < 6 && !renderer.xr.isPresenting) panel.clickRay(mouseRay(e)); moved = 0; });
el.addEventListener('pointermove', (e) => {
  if (!dragging) { if (!renderer.xr.isPresenting) panel.hoverRay(mouseRay(e)); return; }
  moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  yaw += (e.clientX - lastX) * 0.004;
  pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - lastY) * 0.004));
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- lights -----
let lightTarget = params.get('lights') === 'off' ? 0 : 1;
if (lightTarget === 0) room.setLightLevel(0);
function syncLightsButton() { lightsBtn.textContent = lightTarget > 0.5 ? 'Lights down' : 'Lights up'; }
function toggleLights() {
  lightTarget = lightTarget > 0.5 ? 0 : 1;
  syncLightsButton();
  panel.redraw();
}
lightsBtn.addEventListener('click', toggleLights);
window.addEventListener('keydown', (e) => { if (e.key === 'l' || e.key === 'L') toggleLights(); });

// Streaming services open in an ordinary browser window, which the Quest
// lets you float inside the room. Each tile shows the service's own mark.
const SERVICES = [
  ['Netflix', 'https://www.netflix.com/', '#141414'],
  ['Disney+', 'https://www.disneyplus.com/', '#ffffff'],
  ['Prime Video', 'https://www.primevideo.com/', '#1a98ff'],
  ['YouTube', 'https://www.youtube.com/', '#ff0000'],
  ['HBO Max', 'https://www.hbomax.com/', '#000000'],
  ['Hulu', 'https://www.hulu.com/', '#1ce783'],
  ['Apple TV+', 'https://tv.apple.com/', '#1c1c1e'],
  ['Paramount+', 'https://www.paramountplus.com/', '#0a64ff'],
  ['Twitch', 'https://www.twitch.tv/', '#9146ff'],
  ['Plex', 'https://app.plex.tv/', '#282a2d'],
];
let note = '';
const LOGO_INK = { Netflix: '#e50914', Plex: '#ebaf00', Hulu: '#0b0c0f' };
// Logos supplied as images (the rest are vector paths in logos.js).
const LOGO_IMAGES = {};
Object.entries({ 'Disney+': './assets/logo_disneyplus.png', 'HBO Max': './assets/logo_hbomax.png' }).forEach(([name, src]) => {
  const img = new Image();
  img.onload = () => { LOGO_IMAGES[name] = img; panel.redraw(); };
  img.src = src;
});
const logoPaths = {};
function logoPath(name) { return logoPaths[name] || (logoPaths[name] = new Path2D(LOGOS[name].path)); }
function openService(name) {
  const entry = SERVICES.find((s) => s[0] === name);
  const win = window.open(entry[1], '_blank');
  note = win ? `${name} opened in a browser window. Drag it where you like.` : `Press the Meta button and open ${name} in the Browser.`;
}
document.querySelectorAll('[data-service]').forEach((b) => b.addEventListener('click', () => openService(b.dataset.service)));

// The rooms on offer. More are added here as they are built.
const ROOM_CARDS = [
  { key: 'bullpen', title: 'The Office', subtitle: 'The bullpen', thumb: './assets/bullpen_thumb.jpg' },
];
const thumbs = {};
ROOM_CARDS.forEach((r) => {
  const img = new Image();
  img.onload = () => { thumbs[r.key] = img; panel.redraw(); };
  img.src = r.thumb;
});

// In the headset: a floating panel with three tabs and a dock.
const LIGHT_STEPS = 7;
let tab = params.get('tab') || 'streaming';
const panel = createPanel(renderer, scene);
panel.setPainter((ui) => {
  const { g } = ui;
  const W = PANEL_W, H = PANEL_H;
  // Dock.
  const dockW = 1040, dockH = 110, dx = (W - dockW) / 2, dy = H - dockH - 10;
  ui.card(dx, dy, dockW, dockH, dockH / 2);
  const tabs = [['rooms', 'Rooms'], ['streaming', 'Streaming'], ['settings', 'Settings']];
  let x = dx + 16;
  tabs.forEach(([key, label]) => {
    ui.button(x, dy + 16, 230, dockH - 32, label, () => { tab = key; note = ''; }, { selected: tab === key });
    x += 244;
  });
  ui.button(x + 20, dy + 16, 130, dockH - 32, 'Hide', () => panel.setVisible(false));
  ui.button(x + 164, dy + 16, 130, dockH - 32, 'Exit', () => { const s = renderer.xr.getSession(); if (s) s.end(); });

  // Body.
  const bx = 60, by = 20, bw = W - 120, bh = dy - 50;
  ui.card(bx, by, bw, bh, 56);
  if (tab === 'streaming') {
    ui.text('Streaming', bx + 60, by + 70, 46, '#f2efe8', '600', 'left');
    ui.text(note || 'Opens in a browser window you can place and resize.', bx + bw - 60, by + 72, 28, 'rgba(242,239,232,0.6)', '400', 'right');
    const cols = 5, tw = 230, th = 270, gx = (bw - 120 - cols * tw) / (cols - 1);
    SERVICES.forEach(([name, , color], i) => {
      const tx = bx + 60 + (i % cols) * (tw + gx), ty = by + 140 + Math.floor(i / cols) * (th + 24);
      ui.region(tx, ty, tw, th, (hot) => {
        g.fillStyle = hot ? 'rgba(242,239,232,0.16)' : 'rgba(242,239,232,0.05)';
        ui.roundRect(tx, ty, tw, th, 36);
        g.fill();
        g.fillStyle = color;
        g.beginPath();
        g.arc(tx + tw / 2, ty + 108, 78, 0, Math.PI * 2);
        g.fill();
        const logo = LOGOS[name];
        const pic = LOGO_IMAGES[name];
        if (pic) {
          const fit = Math.min(108 / pic.width, 108 / pic.height);
          const pw = pic.width * fit, ph = pic.height * fit;
          g.drawImage(pic, tx + tw / 2 - pw / 2, ty + 108 - ph / 2, pw, ph);
        } else if (logo) {
          const k = 86 / 24;
          g.save();
          g.translate(tx + tw / 2 - 43, ty + 108 - 43);
          g.scale(k, k);
          g.fillStyle = LOGO_INK[name] || '#ffffff';
          g.fill(logoPath(name));
          g.restore();
        } else {
          ui.text(name, tx + tw / 2, ty + 110, name.length > 4 ? 34 : 48, '#ffffff', '700');
        }
        ui.text(name, tx + tw / 2, ty + 228, 32, '#f2efe8', '600');
      }, () => openService(name));
    });
  } else if (tab === 'rooms') {
    ui.text('Rooms', bx + 60, by + 70, 46, '#f2efe8', '600', 'left');
    const tw = 420, th = 560;
    for (let i = 0; i < 3; i++) {
      const card = ROOM_CARDS[i];
      const tx = bx + 60 + i * (tw + 30), ty = by + 140;
      if (!card) {
        g.strokeStyle = 'rgba(242,239,232,0.18)';
        g.lineWidth = 3;
        g.setLineDash([14, 12]);
        ui.roundRect(tx, ty, tw, th, 40);
        g.stroke();
        g.setLineDash([]);
        ui.text('Coming next', tx + tw / 2, ty + th / 2, 32, 'rgba(242,239,232,0.45)');
        continue;
      }
      ui.region(tx, ty, tw, th, (hot) => {
        g.fillStyle = hot ? 'rgba(242,239,232,0.2)' : 'rgba(242,239,232,0.08)';
        ui.roundRect(tx, ty, tw, th, 40);
        g.fill();
        g.save();
        ui.roundRect(tx + 16, ty + 16, tw - 32, tw - 32, 28);
        g.clip();
        if (thumbs[card.key]) g.drawImage(thumbs[card.key], tx + 16, ty + 16, tw - 32, tw - 32);
        else { g.fillStyle = '#22252b'; g.fillRect(tx + 16, ty + 16, tw - 32, tw - 32); }
        g.restore();
        ui.text(card.title, tx + 28, ty + tw + 36, 40, '#f2efe8', '600', 'left');
        ui.text(card.key === roomKey ? `${card.subtitle} · you are here` : card.subtitle, tx + 28, ty + tw + 90, 28, 'rgba(242,239,232,0.6)', '400', 'left');
      }, () => { if (card.key !== roomKey) location.search = `?room=${card.key}`; });
    }
  } else {
    ui.text('Settings', bx + 60, by + 70, 46, '#f2efe8', '600', 'left');
    ui.text(room.name, bx + bw - 60, by + 72, 28, 'rgba(242,239,232,0.6)', '400', 'right');
    ui.card(bx + 60, by + 150, bw - 120, 230, 40, 'rgba(242,239,232,0.06)');
    ui.text('Lighting', bx + 100, by + 205, 36, '#f2efe8', '600', 'left');
    ui.text('Dark', bx + 100, by + 300, 26, 'rgba(242,239,232,0.55)', '400', 'left');
    ui.text('Bright', bx + bw - 100, by + 300, 26, 'rgba(242,239,232,0.55)', '400', 'right');
    const sx0 = bx + 220, sx1 = bx + bw - 240, sy = by + 300;
    const current = Math.round(lightTarget * (LIGHT_STEPS - 1));
    for (let i = 0; i < LIGHT_STEPS; i++) {
      const cx = sx0 + (sx1 - sx0) * i / (LIGHT_STEPS - 1);
      ui.region(cx - 60, sy - 50, 120, 100, (hot) => {
        g.fillStyle = i === current ? '#5aa2ff' : (hot ? '#f2efe8' : 'rgba(242,239,232,0.35)');
        g.beginPath();
        g.arc(cx, sy, i === current ? 26 : (hot ? 18 : 10), 0, Math.PI * 2);
        g.fill();
      }, () => { lightTarget = i / (LIGHT_STEPS - 1); syncLightsButton(); });
    }
    ui.text('Squeeze the grip button to hide or show this panel.', bx + 100, by + 450, 28, 'rgba(242,239,232,0.6)', '400', 'left');
    ui.text('The film window belongs to the Quest: grab its bar to move it, its corner to resize it.', bx + 100, by + 500, 28, 'rgba(242,239,232,0.6)', '400', 'left');
  }
});
if (params.get('panel')) panel.setVisible(true); // preview the headset panel on a flat screen
const _head = new THREE.Vector3();

// ----- entering VR -----
async function setupXR() {
  if (!navigator.xr) { say('Open this page in the Quest Browser to step inside. You can drag to look around here.'); return; }
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* treated as unsupported */ }
  if (!ok) { say('This device cannot enter VR. You can drag to look around here.'); return; }
  enterBtn.hidden = false;
  say('Ready.');
  enterBtn.addEventListener('click', async () => {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking'],
      });
      session.addEventListener('end', () => {
        say('Ready.');
        panel.setVisible(false);
        camera.position.copy(room.seatedEye);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
      await renderer.xr.setSession(session);
      panel.setVisible(true);
      say('In VR.');
    } catch (err) {
      say(`Could not enter VR: ${err.message}`);
    }
  });
}
setupXR();

// ----- frame loop -----
let last = performance.now();
let clockTimer = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!renderer.xr.isPresenting) camera.rotation.set(-pitch, -yaw, 0);

  const level = room.getLightLevel();
  if (Math.abs(level - lightTarget) > 0.001) {
    const step = dt / 1.6;
    room.setLightLevel(level < lightTarget ? Math.min(lightTarget, level + step) : Math.max(lightTarget, level - step));
  }

  clockTimer += dt;
  if (clockTimer > 5) { clockTimer = 0; room.update(); }
  // A surround image has no position: keep it centred on the viewer's head.
  if (room.surround) {
    if (renderer.xr.isPresenting) room.root.position.copy(renderer.xr.getCamera().getWorldPosition(_head));
    else room.root.position.copy(camera.position);
  }
  panel.update(renderer.xr.isPresenting);
  renderer.render(scene, camera);
});

window.__ready = true;
