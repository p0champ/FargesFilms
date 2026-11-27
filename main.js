import * as THREE from './vendor/three.module.js';
import { build as buildBullpen } from './rooms/bullpen.js';
import { build as buildSoul } from './rooms/soul.js';
import { createPanel, PANEL_W, PANEL_H, FONT } from './panel.js';
import { LOGOS } from './logos.js';

const ROOMS = { soul: buildSoul, bullpen: buildBullpen };
// What the Rooms tab lists, in order.
const card = (key, title, subtitle) => ({ key, title, subtitle, thumb: `./assets/${key}_thumb.jpg` });
const ROOM_CARDS = [
  card('soul', 'The You Seminar', 'Soul'),
  card('bullpen', 'Dunder Mifflin', 'The Office'),
];
const params = new URLSearchParams(location.search);
// The room in the address wins; otherwise the one chosen last time.
function savedRoom() { try { return localStorage.getItem('room'); } catch { return null; } }
const roomKey = ROOMS[params.get('room')] ? params.get('room') : (ROOMS[savedRoom()] ? savedRoom() : 'soul');
function switchRoom(key) {
  try { localStorage.setItem('room', key); } catch { /* private browsing: the address still carries it */ }
  location.search = `?room=${key}`;
}

const statusEl = document.getElementById('status');
const enterBtn = document.getElementById('enter');
const lightsBtn = document.getElementById('lights');
const retryBtn = document.getElementById('retry');
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
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1500);
camera.rotation.order = 'YXZ';

// ----- the room, with loading and failure states -----
let roomReady = false;
let xrSupported = false;
let reveal = 0;
const room = ROOMS[roomKey](renderer, {
  onProgress: (f) => { if (!roomReady) say(`Loading the room… ${Math.round(f * 100)}%`); },
  onReady: () => { roomReady = true; refreshStartPage(); },
  onError: () => {
    say('The room could not be loaded. Check your connection and try again.');
    retryBtn.hidden = false;
    enterBtn.hidden = true;
  },
});
retryBtn.addEventListener('click', () => location.reload());
scene.add(room.root);
scene.background = room.background;
document.getElementById('room-name').textContent = room.name;
camera.position.copy(room.seatedEye);
say('Loading the room… 0%');

function refreshStartPage() {
  if (!roomReady) return;
  if (xrSupported) {
    enterBtn.hidden = false;
    enterBtn.disabled = false;
    say('');
  } else {
    say('Open this page on a Meta Quest to step inside. Drag to look around.');
  }
}

// ----- preview on a flat screen: drag or use the arrow keys to look around -----
let yaw = Number(params.get('yaw')) || 0;
let pitch = Number(params.get('pitch')) || 0;
let dragging = false, lastX = 0, lastY = 0, moved = 0;
const el = renderer.domElement;
const _ndc = new THREE.Vector2(), _mouseRay = new THREE.Raycaster();
function mouseRay(e) {
  _ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  _mouseRay.setFromCamera(_ndc, camera);
  return _mouseRay.ray;
}
el.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
el.addEventListener('pointerup', (e) => {
  dragging = false;
  el.style.cursor = 'grab';
  if (moved < 6 && !renderer.xr.isPresenting) panel.clickRay(mouseRay(e));
});
el.addEventListener('pointermove', (e) => {
  if (!dragging) { if (!renderer.xr.isPresenting) panel.hoverRay(mouseRay(e)); return; }
  moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  yaw -= (e.clientX - lastX) * 0.004;
  pitch = Math.max(-1.3, Math.min(1.3, pitch - (e.clientY - lastY) * 0.004));
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
function syncLightsButton() { lightsBtn.textContent = lightTarget > 0.5 ? 'Dim the lights' : 'Raise the lights'; }
function setLights(v) {
  lightTarget = Math.max(0, Math.min(1, v));
  syncLightsButton();
}
syncLightsButton();
lightsBtn.addEventListener('click', () => { setLights(lightTarget > 0.5 ? 0 : 1); panel.redraw(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') { setLights(lightTarget > 0.5 ? 0 : 1); panel.redraw(); }
  if (e.key === 'ArrowLeft') yaw += 0.12;
  if (e.key === 'ArrowRight') yaw -= 0.12;
  if (e.key === 'ArrowUp') pitch = Math.min(1.3, pitch + 0.1);
  if (e.key === 'ArrowDown') pitch = Math.max(-1.3, pitch - 0.1);
});

// ----- streaming services -----
// They open in an ordinary browser window, which the Quest lets you float
// inside the room. `ink` is the logo colour, `fill` the tile behind it.
const SERVICES = [
  { name: 'Netflix', url: 'https://www.netflix.com/', fill: '#000000', ink: '#e50914' },
  { name: 'Disney+', url: 'https://www.disneyplus.com/', fill: '#ffffff', image: './assets/logo_disneyplus.png' },
  { name: 'Prime Video', url: 'https://www.primevideo.com/', fill: '#1a98ff', ink: '#ffffff' },
  { name: 'YouTube', url: 'https://www.youtube.com/', fill: '#ffffff', ink: '#ff0000' },
  { name: 'HBO Max', url: 'https://www.hbomax.com/', fill: '#000000', image: './assets/logo_hbomax.png' },
  { name: 'Hulu', url: 'https://www.hulu.com/', fill: '#1ce783', ink: '#0b0c0f' },
  { name: 'Apple TV', url: 'https://tv.apple.com/', fill: '#1c1c1e', ink: '#ffffff', logo: 'Apple TV+' },
  { name: 'Paramount+', url: 'https://www.paramountplus.com/', fill: '#0064ff', ink: '#ffffff' },
  { name: 'Twitch', url: 'https://www.twitch.tv/', fill: '#9146ff', ink: '#ffffff' },
  { name: 'Plex', url: 'https://app.plex.tv/', fill: '#1f2326', ink: '#ebaf00' },
];
const logoPaths = {};
const images = {};
function loadImage(key, src) {
  const img = new Image();
  img.onload = () => { images[key] = img; panel.redraw(); };
  img.src = src;
}
SERVICES.forEach((s) => {
  const path = LOGOS[s.logo || s.name];
  if (path) logoPaths[s.name] = new Path2D(path.path);
  if (s.image) loadImage(s.name, s.image);
});
ROOM_CARDS.forEach((r) => loadImage(`room:${r.key}`, r.thumb));

function openService(service) {
  const win = window.open(service.url, '_blank');
  if (win) {
    try { win.opener = null; } catch { /* cross-origin windows may refuse; harmless */ }
    panel.toast(`${service.name} is open. Drag its window where you like.`, 3);
    setTimeout(() => { if (renderer.xr.isPresenting) panel.setVisible(false); }, 1800);
  } else {
    panel.toast(`Press the Meta button and open ${service.name} in the Browser.`, 6);
  }
}

// ----- the headset panel -----
const TABS = [['rooms', 'Rooms'], ['streaming', 'Streaming'], ['settings', 'Settings']];
let tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'streaming';
const panel = createPanel(renderer, scene);

// Layout, on an 8-pixel grid.
const L = {
  pad: 64, cardRadius: 64, bodyX: 60, bodyH: 648,
  dockH: 112, dockGap: 24, dockPad: 16, tabW: 230, tabGap: 14, hideW: 150,
  title: 48, body: 34, small: 30,
  ink: '#f2efe8', dimInk: 'rgba(242,239,232,0.7)',
};

panel.setPainter((ui) => {
  const { g } = ui;
  const W = PANEL_W, H = PANEL_H;

  // Dock.
  const dockW = L.dockPad * 2 + TABS.length * L.tabW + TABS.length * L.tabGap + L.hideW;
  const dx = (W - dockW) / 2, dy = H - L.dockGap - L.dockH;
  ui.card(dx, dy, dockW, L.dockH, L.dockH / 2);
  let x = dx + L.dockPad;
  const bh2 = L.dockH - L.dockPad * 2;
  TABS.forEach(([key, label]) => {
    ui.button(x, dy + L.dockPad, L.tabW, bh2, label, () => { tab = key; }, { selected: tab === key });
    x += L.tabW + L.tabGap;
  });
  ui.button(x, dy + L.dockPad, L.hideW, bh2, 'Hide', () => panel.setVisible(false));

  // Body card, sitting just above the dock.
  const bx = L.bodyX, bw = W - 2 * L.bodyX, bh = L.bodyH, by = dy - L.dockGap - bh;
  ui.card(bx, by, bw, bh, L.cardRadius);
  const cx = bx + L.pad, cw = bw - 2 * L.pad;
  const titleY = by + L.pad + L.title / 2;
  const top = by + L.pad + L.title + 40;   // where the tab's content starts
  const title = TABS.find(([k]) => k === tab)[1];
  ui.text(title, cx, titleY, L.title, L.ink, 700, 'left');

  if (tab === 'streaming') {
    ui.text('Opens in a window you can place and resize', cx + cw, titleY + 4, L.small, L.dimInk, 400, 'right');
    const cols = 5, tw = 236, th = 150, gapX = (cw - cols * tw) / (cols - 1), rowH = th + 16 + 34 + 30;
    SERVICES.forEach((s, i) => {
      const tx = cx + (i % cols) * (tw + gapX), ty = top + Math.floor(i / cols) * rowH;
      g.fillStyle = s.fill;
      ui.roundRect(tx, ty, tw, th, 28);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 2;
      ui.roundRect(tx + 1, ty + 1, tw - 2, th - 2, 28);
      g.stroke();
      const pic = images[s.name], path = logoPaths[s.name];
      if (pic) {
        const fit = Math.min((tw * 0.62) / pic.width, (th * 0.62) / pic.height);
        g.drawImage(pic, tx + tw / 2 - pic.width * fit / 2, ty + th / 2 - pic.height * fit / 2, pic.width * fit, pic.height * fit);
      } else if (path) {
        const size = 108, k = size / 24;
        g.save();
        g.translate(tx + tw / 2 - size / 2, ty + th / 2 - size / 2);
        g.scale(k, k);
        g.fillStyle = s.ink;
        g.fill(path);
        g.restore();
      } else {
        ui.text(s.name, tx + tw / 2, ty + th / 2, 36, s.ink || '#ffffff', 700);
      }
      ui.text(s.name, tx + tw / 2, ty + th + 16 + 17, L.small, L.ink, 500);
      ui.region(tx, ty, tw, th, 28, () => openService(s));
    });
  } else if (tab === 'rooms') {
    ui.text('Choosing another room reloads the page', cx + cw, titleY + 4, L.small, L.dimInk, 400, 'right');
    const cols = Math.max(3, Math.min(5, ROOM_CARDS.length)), gap = 28, tw = (cw - gap * (cols - 1)) / cols, th = Math.round(tw * 9 / 16), rowH = th + 96;
    ROOM_CARDS.forEach((card, i) => {
      const tx = cx + (i % cols) * (tw + gap), ty = top - 8 + Math.floor(i / cols) * rowH;
      const current = card.key === room.key;
      const pic = images[`room:${card.key}`];
      g.save();
      ui.roundRect(tx, ty, tw, th, 22);
      g.clip();
      if (pic) {
        const k = Math.max(tw / pic.width, th / pic.height);
        g.drawImage(pic, tx + tw / 2 - pic.width * k / 2, ty + th / 2 - pic.height * k / 2, pic.width * k, pic.height * k);
      } else {
        g.fillStyle = '#2a2c31';
        g.fillRect(tx, ty, tw, th);
      }
      g.restore();
      g.strokeStyle = current ? '#f2efe8' : 'rgba(255,255,255,0.14)';
      g.lineWidth = current ? 5 : 2;
      ui.roundRect(tx + 2, ty + 2, tw - 4, th - 4, 22);
      g.stroke();
      ui.text(card.title, tx + 2, ty + th + 30, 26, L.ink, 700, 'left');
      ui.text(current ? 'You are here' : card.subtitle, tx + 2, ty + th + 64, 22, current ? L.ink : L.dimInk, current ? 600 : 400, 'left');
      if (!current) ui.region(tx, ty, tw, th, 22, () => switchRoom(card.key));
    });
  } else {
    ui.text(room.name, cx + cw, titleY + 4, L.small, L.dimInk, 400, 'right');
    // Lighting: a real slider. Click anywhere on the track, or hold and drag.
    const rowH = 150;
    ui.inset(cx, top, cw, rowH, 32);
    ui.text('Lighting', cx + 36, top + rowH / 2 + 2, L.body, L.ink, 600, 'left');
    const sx0 = cx + 300, sx1 = cx + cw - 110, sy = top + rowH / 2;
    const sun = (px, rad, rays) => {
      g.fillStyle = L.dimInk;
      g.beginPath(); g.arc(px, sy, rad, 0, Math.PI * 2); g.fill();
      g.strokeStyle = L.dimInk; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.beginPath();
        g.moveTo(px + Math.cos(a) * (rad + 7), sy + Math.sin(a) * (rad + 7));
        g.lineTo(px + Math.cos(a) * (rad + 7 + rays), sy + Math.sin(a) * (rad + 7 + rays));
        g.stroke();
      }
    };
    sun(sx0 - 52, 8, 4);
    sun(sx1 + 56, 13, 9);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    ui.roundRect(sx0, sy - 6, sx1 - sx0, 12, 6);
    g.fill();
    const kx = sx0 + (sx1 - sx0) * lightTarget;
    g.fillStyle = '#f2efe8';
    ui.roundRect(sx0, sy - 6, Math.max(12, kx - sx0), 12, 6);
    g.fill();
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 12; g.shadowOffsetY = 3;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(kx, sy, 22, 0, Math.PI * 2); g.fill();
    g.restore();
    const slide = (px) => setLights((px - sx0) / (sx1 - sx0));
    ui.region(sx0 - 30, sy - 44, sx1 - sx0 + 60, 88, 44, slide, slide);

    // Tips.
    const tipY = top + rowH + 20, tipH = 150;
    ui.inset(cx, tipY, cw, tipH, 32);
    ui.text('Squeeze the grip to hide or show these controls.', cx + 36, tipY + 48, L.small, L.dimInk, 400, 'left');
    ui.text('Film windows are Quest windows: drag the bar to move, a corner to resize.', cx + 36, tipY + 102, L.small, L.dimInk, 400, 'left');

    ui.button(cx, tipY + tipH + 20, 330, 88, 'Leave the room', () => { const s = renderer.xr.getSession(); if (s) s.end(); });
  }
});
// The panel is drawn on a canvas, which never repaints by itself when a web
// font arrives, so repaint once the typeface is ready.
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load(`600 34px ${FONT}`), document.fonts.load(`400 30px ${FONT}`), document.fonts.load(`700 48px ${FONT}`)])
    .then(() => panel.redraw()).catch(() => {});
}
// Preview the headset panel on a flat screen with ?panel=1.
if (params.get('panel')) {
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld(true);
  panel.setVisible(true, camera);
}

// ----- entering VR -----
async function setupXR() {
  if (navigator.xr) {
    try { xrSupported = await navigator.xr.isSessionSupported('immersive-vr'); } catch { xrSupported = false; }
  }
  refreshStartPage();
}
enterBtn.addEventListener('click', async () => {
  if (enterBtn.disabled) return;
  enterBtn.disabled = true;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking'],
    });
    session.addEventListener('end', () => {
      panel.setVisible(false);
      enterBtn.disabled = false;
      say('You left the room. Enter again whenever you like.');
      camera.position.copy(room.seatedEye);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    // When a system menu or window takes focus, put the pointer rays away.
    session.addEventListener('visibilitychange', () => panel.setRaysEnabled(session.visibilityState === 'visible'));
    await renderer.xr.setSession(session);
    say('');
    reveal = 0; // fade the room up from black
    setTimeout(() => panel.setVisible(true), 700);
  } catch (err) {
    console.error(err);
    enterBtn.disabled = false;
    say('Couldn’t enter the room. Try again.');
  }
});
setupXR();

// ----- frame loop -----
const _eye = new THREE.Vector3();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const presenting = renderer.xr.isPresenting;
  if (!presenting) camera.rotation.set(pitch, yaw, 0);

  // Ease the lights and the fade-in.
  const level = room.getLightLevel();
  if (Math.abs(level - lightTarget) > 0.002) room.setLightLevel(level + (lightTarget - level) * (1 - Math.exp(-dt * 5)));
  else if (level !== lightTarget) room.setLightLevel(lightTarget);
  if (roomReady && reveal < 1) { reveal = Math.min(1, reveal + dt / 0.6); room.setReveal(reveal); }
  panel.setDim(0.6 + 0.4 * Math.min(1, level / 0.3));

  if (room.update) room.update(dt, presenting ? renderer.xr.getCamera().getWorldPosition(_eye) : camera.position);
  panel.update(dt, presenting);
  renderer.render(scene, camera);
});

window.__ready = true;
