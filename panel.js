// Floating control panel shown inside the headset. Point a controller at a
// button and pull the trigger. Squeeze the grip to hide or show the panel.
import * as THREE from './vendor/three.module.js';

export const PANEL_W = 1600, PANEL_H = 1000;   // canvas pixels
const METRES = 1.25;                            // panel width in the room

export function createPanel(renderer, scene) {
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_W;
  canvas.height = PANEL_H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(METRES, METRES * PANEL_H / PANEL_W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false }),
  );
  mesh.renderOrder = 10;
  mesh.position.set(0, 1.12, -1.35);
  mesh.rotation.x = -0.12;
  mesh.visible = false;
  scene.add(mesh);

  let regions = [];
  let hover = -1;
  let painter = null;

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  // Drawing helpers handed to the painter.
  const ui = {
    g,
    roundRect,
    card(x, y, w, h, r = 40, fill = 'rgba(18,19,23,0.88)') {
      g.fillStyle = fill;
      roundRect(x, y, w, h, r);
      g.fill();
    },
    text(str, x, y, size = 36, color = '#f2efe8', weight = '500', align = 'center') {
      g.fillStyle = color;
      g.font = `${weight} ${size}px Helvetica, Arial, sans-serif`;
      g.textAlign = align;
      g.textBaseline = 'middle';
      g.fillText(str, x, y);
    },
    // A clickable area. `paint(hovered)` draws it; `onClick` runs on trigger.
    region(x, y, w, h, paint, onClick) {
      const i = regions.length;
      regions.push({ x, y, w, h, onClick });
      paint(i === hover);
    },
    button(x, y, w, h, label, onClick, opts = {}) {
      ui.region(x, y, w, h, (hot) => {
        g.fillStyle = hot ? '#f2efe8' : (opts.selected ? 'rgba(242,239,232,0.28)' : 'rgba(242,239,232,0.10)');
        roundRect(x, y, w, h, opts.radius ?? h / 2);
        g.fill();
        ui.text(label, x + w / 2, y + h / 2 + 2, opts.size ?? 34, hot ? '#101114' : '#f2efe8', '600');
      }, onClick);
    },
  };

  function draw() {
    regions = [];
    g.clearRect(0, 0, PANEL_W, PANEL_H);
    if (painter) painter(ui);
    tex.needsUpdate = true;
  }

  const raycaster = new THREE.Raycaster();
  function regionAt(ray) {
    if (!mesh.visible) return { index: -1, distance: 0 };
    raycaster.ray.copy(ray);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return { index: -1, distance: 0 };
    const px = hits[0].uv.x * PANEL_W, py = (1 - hits[0].uv.y) * PANEL_H;
    let index = -1;
    regions.forEach((r, i) => { if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) index = i; });
    return { index, distance: hits[0].distance };
  }

  // Controller rays.
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const m4 = new THREE.Matrix4();
  const tmpRay = new THREE.Ray();
  function controllerRay(c) {
    m4.identity().extractRotation(c.matrixWorld);
    tmpRay.origin.setFromMatrixPosition(c.matrixWorld);
    tmpRay.direction.set(0, 0, -1).applyMatrix4(m4);
    return tmpRay;
  }
  const controllers = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.55, toneMapped: false }));
    line.scale.z = 2;
    line.visible = false;
    c.add(line);
    c.userData.line = line;
    c.addEventListener('selectstart', () => {
      if (!c.visible) return;
      const { index } = regionAt(controllerRay(c));
      if (index >= 0) { regions[index].onClick(); draw(); }
    });
    c.addEventListener('squeezestart', () => { api.setVisible(!mesh.visible); });
    scene.add(c);
    return c;
  });

  const api = {
    mesh,
    setPainter(fn) { painter = fn; draw(); },
    redraw: draw,
    isVisible: () => mesh.visible,
    setVisible(v) {
      mesh.visible = v;
      controllers.forEach((c) => { c.userData.line.visible = v; });
    },
    // For the flat-screen preview: click with the mouse.
    clickRay(ray) {
      const { index } = regionAt(ray);
      if (index >= 0) { regions[index].onClick(); draw(); return true; }
      return false;
    },
    hoverRay(ray) {
      const { index } = regionAt(ray);
      if (index !== hover) { hover = index; draw(); }
    },
    update(presenting) {
      if (!mesh.visible || !presenting) return;
      let h = -1;
      for (const c of controllers) {
        c.userData.line.scale.z = 2;
        if (!c.visible) continue;
        const { index, distance } = regionAt(controllerRay(c));
        if (distance) c.userData.line.scale.z = distance;
        if (index >= 0) h = index;
      }
      if (h !== hover) { hover = h; draw(); }
    },
  };
  return api;
}
