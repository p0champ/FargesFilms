// Floating control panel shown inside the headset.
// Point a controller (or a pinching hand) at a control and pull the trigger.
// Squeezing the grip hides or shows the panel; when it is hidden, any trigger
// pull brings it back.
import * as THREE from './vendor/three.module.js';

export const PANEL_W = 1600, PANEL_H = 840;   // canvas pixels
export const FONT = 'Inter, system-ui, -apple-system, sans-serif';
const METRES = 0.84;                           // panel width in the room
const DISTANCE = 0.9;                          // metres in front of the head
const DROP = 0.12;                             // metres below eye height
const OVERLAY_SCALE = 0.5;                     // hover layer is drawn at half size

function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function createPanel(renderer, scene) {
  const heightM = METRES * PANEL_H / PANEL_W;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Main layer: everything except hover feedback.
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_W;
  canvas.height = PANEL_H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(METRES, heightM), mat);
  mesh.renderOrder = 10;
  group.add(mesh);

  // Hover layer: a small, cheap canvas so pointing never repaints the main one.
  const oCanvas = document.createElement('canvas');
  oCanvas.width = PANEL_W * OVERLAY_SCALE;
  oCanvas.height = PANEL_H * OVERLAY_SCALE;
  const og = oCanvas.getContext('2d');
  const oTex = new THREE.CanvasTexture(oCanvas);
  oTex.colorSpace = THREE.SRGBColorSpace;
  const oMat = new THREE.MeshBasicMaterial({ map: oTex, transparent: true, toneMapped: false, depthWrite: false, opacity: 0 });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(METRES, heightM), oMat);
  overlay.position.z = 0.002;
  overlay.renderOrder = 11;
  group.add(overlay);

  let regions = [];
  let painter = null;
  let toast = '';
  let toastUntil = 0;
  let target = 0;        // wanted opacity: 0 hidden, 1 shown
  let dim = 1;
  let pressFlash = 0;    // seconds of "pressed" feedback left
  let pressIndex = -1;

  const ui = {
    g,
    roundRect: (x, y, w, h, r) => roundRectPath(g, x, y, w, h, r),
    // The panel's own material: near-opaque dark glass with a lit top edge.
    card(x, y, w, h, r) {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = 28;
      g.shadowOffsetY = 8;
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(40,41,46,0.97)');
      grad.addColorStop(1, 'rgba(23,24,28,0.97)');
      g.fillStyle = grad;
      roundRectPath(g, x, y, w, h, r);
      g.fill();
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 2;
      roundRectPath(g, x + 1, y + 1, w - 2, h - 2, r);
      g.stroke();
    },
    inset(x, y, w, h, r) {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      roundRectPath(g, x, y, w, h, r);
      g.fill();
    },
    text(str, x, y, size = 34, color = '#f2efe8', weight = 500, align = 'center') {
      g.fillStyle = color;
      g.font = `${weight} ${size}px ${FONT}`;
      g.textAlign = align;
      g.textBaseline = 'middle';
      g.fillText(str, x, y);
    },
    // A control. `r` is its corner radius (for the hover highlight);
    // onClick and onDrag receive the pointer position in canvas pixels.
    region(x, y, w, h, r, onClick, onDrag) {
      regions.push({ x, y, w, h, r, onClick, onDrag });
    },
    button(x, y, w, h, label, onClick, opts = {}) {
      if (opts.selected) {
        g.fillStyle = '#f2efe8';
        roundRectPath(g, x, y, w, h, h / 2);
        g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.09)';
        roundRectPath(g, x, y, w, h, h / 2);
        g.fill();
      }
      ui.text(label, x + w / 2, y + h / 2 + 2, opts.size ?? 34, opts.selected ? '#141518' : '#f2efe8', 600);
      if (!opts.selected || opts.clickableWhenSelected) ui.region(x, y, w, h, h / 2, onClick);
    },
  };

  function draw() {
    regions = [];
    g.clearRect(0, 0, PANEL_W, PANEL_H);
    if (painter) painter(ui);
    if (toast) {
      g.font = `600 32px ${FONT}`;
      const w = Math.min(PANEL_W - 200, g.measureText(toast).width + 96);
      const x = (PANEL_W - w) / 2, y = PANEL_H - 262;
      g.fillStyle = '#f2efe8';
      roundRectPath(g, x, y, w, 76, 38);
      g.fill();
      ui.text(toast, PANEL_W / 2, y + 40, 32, '#141518', 600);
    }
    tex.needsUpdate = true;
  }

  // ----- pointing -----
  const inv = new THREE.Matrix4();
  const lo = new THREE.Vector3(), ld = new THREE.Vector3();
  const hit = { x: 0, y: 0, distance: 0, index: -1 };
  // Where does a world-space ray meet the panel? Fills `hit`; no allocations.
  function cast(origin, direction) {
    hit.index = -1;
    hit.distance = 0;
    inv.copy(mesh.matrixWorld).invert();
    lo.copy(origin).applyMatrix4(inv);
    ld.copy(direction).transformDirection(inv);
    if (Math.abs(ld.z) < 1e-5) return hit;
    const t = -lo.z / ld.z;
    if (t <= 0) return hit;
    const lx = lo.x + ld.x * t, ly = lo.y + ld.y * t;
    if (Math.abs(lx) > METRES / 2 || Math.abs(ly) > heightM / 2) return hit;
    hit.distance = t;
    hit.x = (lx / METRES + 0.5) * PANEL_W;
    hit.y = (0.5 - ly / heightM) * PANEL_H;
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (hit.x >= r.x && hit.x <= r.x + r.w && hit.y >= r.y && hit.y <= r.y + r.h) { hit.index = i; break; }
    }
    return hit;
  }

  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
  rayGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0.15, 0.15, 0.15], 3));
  const dotGeo = new THREE.CircleGeometry(0.006, 24);
  const o3 = new THREE.Vector3(), d3 = new THREE.Vector3(), rot = new THREE.Matrix4();
  const pointers = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, toneMapped: false, depthTest: false }));
    line.renderOrder = 12;
    line.visible = false;
    c.add(line);
    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false }));
    dot.renderOrder = 13;
    dot.visible = false;
    group.add(dot);
    const p = { c, line, dot, hover: -1, selecting: false, source: null };
    c.addEventListener('connected', (e) => { p.source = e.data; });
    c.addEventListener('disconnected', () => { p.source = null; p.hover = -1; p.selecting = false; });
    c.addEventListener('selectstart', () => { p.selecting = true; });
    c.addEventListener('selectend', () => { p.selecting = false; });
    // `select` (press and release) is the event that counts as a user
    // gesture, which opening a browser window needs.
    c.addEventListener('select', () => {
      if (target === 0) { api.setVisible(true); return; }
      aim(p);
      if (hit.index >= 0) press(hit.index, hit.x, hit.y, p);
    });
    c.addEventListener('squeeze', () => { api.setVisible(target === 0); });
    scene.add(c);
    return p;
  });
  function aim(p) {
    o3.setFromMatrixPosition(p.c.matrixWorld);
    rot.extractRotation(p.c.matrixWorld);
    d3.set(0, 0, -1).applyMatrix4(rot);
    return cast(o3, d3);
  }
  function pulse(p, strength, ms) {
    const act = p && p.source && p.source.gamepad && p.source.gamepad.hapticActuators && p.source.gamepad.hapticActuators[0];
    if (act && act.pulse) act.pulse(strength, ms).catch(() => {});
  }
  function press(index, x, y, p) {
    pressIndex = index;
    pressFlash = 0.12;
    pulse(p, 0.5, 20);
    regions[index].onClick(x, y);
    draw();
    drawOverlay();
  }

  let lastKey = '';
  let mouseHover = -1;
  function drawOverlay() {
    og.clearRect(0, 0, oCanvas.width, oCanvas.height);
    const seen = new Set([mouseHover, ...pointers.map((p) => p.hover)]);
    og.save();
    og.scale(OVERLAY_SCALE, OVERLAY_SCALE);
    for (const i of seen) {
      const r = regions[i];
      if (!r) continue;
      const pressed = pressFlash > 0 && i === pressIndex;
      og.fillStyle = pressed ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.16)';
      roundRectPath(og, r.x, r.y, r.w, r.h, r.r);
      og.fill();
      og.strokeStyle = 'rgba(255,255,255,0.42)';
      og.lineWidth = 3;
      roundRectPath(og, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, r.r);
      og.stroke();
    }
    og.restore();
    oTex.needsUpdate = true;
  }

  const headPos = new THREE.Vector3(), headDir = new THREE.Vector3();
  const api = {
    setPainter(fn) { painter = fn; draw(); },
    redraw() { draw(); drawOverlay(); },
    isVisible: () => target === 1,
    // Show the panel in front of wherever the viewer is looking (level, never
    // tilted with the head), or fade it away.
    setVisible(v, camera) {
      if (v) {
        const cam = camera || (renderer.xr.isPresenting ? renderer.xr.getCamera() : null);
        if (cam) {
          cam.getWorldPosition(headPos);
          cam.getWorldDirection(headDir);
          headDir.y = 0;
          if (headDir.lengthSq() < 1e-4) headDir.set(0, 0, -1);
          headDir.normalize();
          group.position.copy(headPos).addScaledVector(headDir, DISTANCE);
          group.position.y = headPos.y - DROP;
          group.lookAt(headPos);
        }
        group.visible = true;
        draw();
      }
      target = v ? 1 : 0;
    },
    setDim(k) { dim = k; },
    setRaysEnabled(on) { pointers.forEach((p) => { p.line.visible = on && target === 1; if (!on) p.dot.visible = false; }); },
    toast(text, seconds = 4) {
      toast = text;
      toastUntil = performance.now() + seconds * 1000;
      draw();
    },
    // Flat-screen preview: the mouse stands in for a controller.
    hoverRay(ray) {
      if (target !== 1) return;
      const i = cast(ray.origin, ray.direction).index;
      if (i !== mouseHover) { mouseHover = i; drawOverlay(); }
    },
    clickRay(ray) {
      if (target !== 1) return false;
      cast(ray.origin, ray.direction);
      if (hit.index < 0) return false;
      press(hit.index, hit.x, hit.y, null);
      return true;
    },
    update(dt, presenting) {
      // Fade in and out.
      const speed = target > mat.opacity ? 5 : 8;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * speed * 2);
      if (Math.abs(target - mat.opacity) < 0.01) mat.opacity = target;
      oMat.opacity = mat.opacity;
      mat.color.setScalar(dim);
      group.visible = mat.opacity > 0.01;
      const s = 0.96 + 0.04 * mat.opacity;
      mesh.scale.set(s, s, 1);
      overlay.scale.set(s, s, 1);

      if (toast && performance.now() > toastUntil) { toast = ''; draw(); }
      if (pressFlash > 0) { pressFlash -= dt; if (pressFlash <= 0) drawOverlay(); }

      let key = String(mouseHover);
      for (const p of pointers) {
        const active = presenting && target === 1 && p.c.visible && p.source;
        p.line.visible = !!active;
        p.dot.visible = false;
        let h = -1;
        if (active) {
          aim(p);
          p.line.scale.z = hit.distance || 0.3;
          if (hit.distance) {
            p.dot.visible = true;
            p.dot.position.set((hit.x / PANEL_W - 0.5) * METRES * s, (0.5 - hit.y / PANEL_H) * heightM * s, 0.004);
            h = hit.index;
            if (p.selecting && h >= 0 && regions[h].onDrag) { regions[h].onDrag(hit.x, hit.y); draw(); }
          }
        }
        if (h !== p.hover) {
          if (h >= 0) pulse(p, 0.15, 10);
          p.hover = h;
        }
        key += ',' + h;
      }
      if (key !== lastKey) { lastKey = key; drawOverlay(); }
    },
  };
  return api;
}
