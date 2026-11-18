import * as THREE from './vendor/three.module.js';
import { build as buildOffice } from './rooms/office.js';

const ROOMS = { office: buildOffice };
const params = new URLSearchParams(location.search);
const roomKey = ROOMS[params.get('room')] ? params.get('room') : 'office';

const statusEl = document.getElementById('status');
const enterBtn = document.getElementById('enter');
const lightsBtn = document.getElementById('lights');
const say = (t) => { statusEl.textContent = t; };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // the room is static: draw shadows once
renderer.shadowMap.needsUpdate = true;
// Sharpness in the headset: render above the default eye-buffer size and
// keep full resolution right out to the edges of the view.
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(Number(params.get('scale')) || 1.4);
renderer.xr.setFoveation(0);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const room = ROOMS[roomKey](renderer);
scene.add(room.root);
scene.background = room.background;
document.getElementById('room-name').textContent = room.name;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.copy(room.seatedEye);
camera.rotation.order = 'YXZ';

// ----- preview on a flat screen: drag to look around -----
let yaw = Number(params.get('yaw')) || 0;
let pitch = Number(params.get('pitch')) || 0;
let dragging = false, lastX = 0, lastY = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointerup', () => { dragging = false; });
el.addEventListener('pointermove', (e) => {
  if (!dragging) return;
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
function toggleLights() {
  lightTarget = lightTarget > 0.5 ? 0 : 1;
  lightsBtn.textContent = lightTarget > 0.5 ? 'Lights down' : 'Lights up';
}
lightsBtn.addEventListener('click', toggleLights);
window.addEventListener('keydown', (e) => { if (e.key === 'l' || e.key === 'L') toggleLights(); });

// In the headset: point a controller (or a pinching hand) at the light
// switch on the right-hand wall and pull the trigger. Grip also toggles.
const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  c.addEventListener('selectstart', () => { if (pointsAtSwitch(c)) toggleLights(); });
  c.addEventListener('squeezestart', toggleLights);
  scene.add(c);
  return c;
});
const _pos = new THREE.Vector3(), _dir = new THREE.Vector3(), _to = new THREE.Vector3();
function pointsAtSwitch(c) {
  if (!c.visible) return false;
  c.getWorldPosition(_pos);
  _dir.set(0, 0, -1).transformDirection(c.matrixWorld);
  _to.copy(room.switchPosition).sub(_pos).normalize();
  return _dir.dot(_to) > Math.cos(THREE.MathUtils.degToRad(9));
}

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
        camera.position.copy(room.seatedEye);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
      await renderer.xr.setSession(session);
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
  if (renderer.xr.isPresenting) room.setSwitchHighlight(controllers.some(pointsAtSwitch));

  clockTimer += dt;
  if (clockTimer > 5) { clockTimer = 0; room.update(); }
  renderer.render(scene, camera);
});

window.__ready = true;
