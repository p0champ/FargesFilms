// The Conference Room — an original mid-2000s paper-company conference room,
// built entirely from code. No external models or images.
import * as THREE from '../vendor/three.module.js';

// Room dimensions (metres). The viewer sits at the origin, facing -Z.
const W = 5.4;          // 9 ceiling tiles wide
const Z_FRONT = -4.6;   // screen wall
const Z_BACK = 2.0;     // 11 ceiling tiles long
const H = 2.7;
const HW = W / 2;
const WALL_T = 0.12;

// Small deterministic random generator so the room looks the same every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw, maxAniso, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = size[0];
  c.height = size[1];
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = maxAniso;
  return t;
}

function carpetTexture(aniso) {
  const r = rng(11);
  return canvasTexture([1024, 1024], (g, w, h) => {
    g.fillStyle = '#56606c';
    g.fillRect(0, 0, w, h);
    const tones = ['#4a535e', '#626d7a', '#505a66', '#6b7582', '#444c57', '#5d6570'];
    for (let i = 0; i < 90000; i++) {
      g.fillStyle = tones[(r() * tones.length) | 0];
      g.globalAlpha = 0.35 + r() * 0.5;
      g.fillRect(r() * w, r() * h, 1 + r() * 2.2, 1 + r() * 2.2);
    }
    g.globalAlpha = 1;
  }, aniso, W / 1.2, (Z_BACK - Z_FRONT) / 1.2);
}

function ceilingTexture(aniso) {
  const r = rng(23);
  return canvasTexture([512, 512], (g, w, h) => {
    g.fillStyle = '#e9e7e0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? '#cfccc3' : '#dcd9d0';
      const s = 1 + r() * 2.5;
      g.fillRect(r() * w, r() * h, s, s * (0.6 + r()));
    }
    // Suspended grid rails around each tile.
    g.fillStyle = '#f6f5f1';
    const b = 11;
    g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b);
    g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(b, b, w - 2 * b, 3); g.fillRect(b, b, 3, h - 2 * b);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(b, h - b - 3, w - 2 * b, 3); g.fillRect(w - b - 3, b, 3, h - 2 * b);
  }, aniso, W / 0.6, (Z_BACK - Z_FRONT) / 0.6);
}

function woodTexture(aniso) {
  const r = rng(37);
  return canvasTexture([512, 2048], (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#8c5a3a');
    grad.addColorStop(0.5, '#96623f');
    grad.addColorStop(1, '#895638');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Long grain lines running the length of the table.
    for (let i = 0; i < 520; i++) {
      const x = r() * w;
      g.strokeStyle = r() > 0.5 ? 'rgba(70,36,14,1)' : 'rgba(214,150,96,1)';
      g.globalAlpha = 0.03 + r() * 0.08;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath();
      g.moveTo(x, 0);
      let cx = x;
      for (let y = 0; y <= h; y += 64) {
        cx += (r() - 0.5) * 2.2;
        g.lineTo(cx, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }, aniso, 1 / 1.4, 1 / 3.4);
}

function lensTexture(aniso) {
  // Prismatic diffuser of a fluorescent ceiling light.
  return canvasTexture([256, 512], (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,196,205,0.55)';
    g.lineWidth = 1;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // Soft brighter bands where the tubes sit.
    for (const cx of [w * 0.3, w * 0.7]) {
      const gr = g.createLinearGradient(cx - 50, 0, cx + 50, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(cx - 50, 0, 100, h);
    }
  }, aniso);
}

function outsideTexture(aniso) {
  // Overcast daylight with a hint of a car park and trees beyond the blinds.
  return canvasTexture([256, 512], (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#dfe8f2');
    gr.addColorStop(0.55, '#eef2f4');
    gr.addColorStop(0.62, '#9fae9a');
    gr.addColorStop(0.75, '#8a9186');
    gr.addColorStop(1, '#777b78');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, aniso);
}

function bullpenTexture(aniso) {
  // What you glimpse through the interior blinds: a warm, lit open office.
  const r = rng(51);
  return canvasTexture([512, 256], (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#d8d2c2');
    gr.addColorStop(0.5, '#c9c1ae');
    gr.addColorStop(1, '#6f6a62');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(${60 + r() * 60},${55 + r() * 50},${50 + r() * 40},0.55)`;
      const bw = 30 + r() * 60;
      g.fillRect(r() * w, h * (0.45 + r() * 0.2), bw, h * 0.5);
    }
    g.filter = 'blur(6px)';
    g.drawImage(g.canvas, 0, 0);
    g.filter = 'none';
  }, aniso);
}

function whiteboardTexture(aniso) {
  const r = rng(77);
  return canvasTexture([1024, 512], (g, w, h) => {
    g.fillStyle = '#f7f8f8';
    g.fillRect(0, 0, w, h);
    // Faint ghosting of old, wiped-off marker.
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = ['rgba(40,60,140,0.05)', 'rgba(150,40,40,0.04)', 'rgba(30,30,30,0.04)'][i % 3];
      g.lineWidth = 6 + r() * 16;
      g.beginPath();
      const x = r() * w, y = r() * h;
      g.moveTo(x, y);
      g.bezierCurveTo(x + r() * 200 - 100, y + r() * 80 - 40, x + r() * 300 - 150, y + r() * 80 - 40, x + r() * 400 - 200, y + r() * 60 - 30);
      g.stroke();
    }
  }, aniso);
}

function clockFaceTexture(aniso) {
  return canvasTexture([512, 512], (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f8f7f2';
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1a1a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 58px Helvetica, Arial, sans-serif';
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      g.fillText(String(n), c + Math.sin(a) * c * 0.74, c - Math.cos(a) * c * 0.74 + 3);
    }
    for (let m = 0; m < 60; m++) {
      const a = (m / 60) * Math.PI * 2;
      const long = m % 5 === 0;
      g.lineWidth = long ? 6 : 2.5;
      g.strokeStyle = '#1a1a1a';
      g.beginPath();
      g.moveTo(c + Math.sin(a) * c * (long ? 0.9 : 0.93), c - Math.cos(a) * c * (long ? 0.9 : 0.93));
      g.lineTo(c + Math.sin(a) * c * 0.97, c - Math.cos(a) * c * 0.97);
      g.stroke();
    }
  }, aniso);
}

function vignetteTexture() {
  // Soft darkening toward the edges of a surface, standing in for the way
  // real rooms get dimmer in their corners.
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const edge = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,0.34)');
    gr.addColorStop(0.35, 'rgba(0,0,0,0.1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  };
  edge(0, 0, 0, 60); edge(0, 256, 0, 196); edge(0, 0, 40, 0); edge(256, 0, 216, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundedBox(w, h, d, rad) {
  const b = Math.min(0.012, d / 3);
  const hx = w / 2 - b, hy = h / 2 - b, q = Math.max(0.001, rad - b);
  const s = new THREE.Shape();
  s.moveTo(-hx + q, -hy);
  s.lineTo(hx - q, -hy); s.quadraticCurveTo(hx, -hy, hx, -hy + q);
  s.lineTo(hx, hy - q); s.quadraticCurveTo(hx, hy, hx - q, hy);
  s.lineTo(-hx + q, hy); s.quadraticCurveTo(-hx, hy, -hx, hy - q);
  s.lineTo(-hx, -hy + q); s.quadraticCurveTo(-hx, -hy, -hx + q, -hy);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 8 });
  geo.center();
  return geo;
}

export function build(renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const root = new THREE.Group();
  const r = rng(5);

  // ---------- materials ----------
  const std = (color, roughness = 0.9, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const M = {
    wall: std('#d8cfb9', 0.96),
    trim: std('#3d3a36', 0.8),
    frame: std('#8d9094', 0.55, { metalness: 0.35 }),
    carpet: std('#ffffff', 1, { map: carpetTexture(aniso) }),
    ceiling: std('#ffffff', 1, { map: ceilingTexture(aniso), emissive: '#ffffff', emissiveIntensity: 0.3 }),
    wood: std('#ffffff', 0.42, { map: woodTexture(aniso) }),
    edge: std('#2b2a29', 0.6),
    chair: std('#474c56', 0.95),
    plastic: std('#232326', 0.6),
    chrome: std('#a9adb2', 0.3, { metalness: 0.6 }),
    blind: std('#ece8dc', 0.75),
    door: std('#b0794b', 0.6),
    white: std('#f4f3ee', 0.6),
    paper: std('#fbfbf7', 0.9),
    pot: std('#b9b3a6', 0.85),
    leaf: std('#3f6b3a', 0.7, { side: THREE.DoubleSide }),
    leafDark: std('#2f5630', 0.7, { side: THREE.DoubleSide }),
    screen: new THREE.MeshBasicMaterial({ color: '#020203' }),
    bezel: std('#151517', 0.5),
  };
  const lens = new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#fff8ea', emissiveMap: lensTexture(aniso), emissiveIntensity: 1.6, roughness: 0.6,
  });
  const outside = new THREE.MeshBasicMaterial({ map: outsideTexture(aniso) });
  const bullpen = new THREE.MeshBasicMaterial({ map: bullpenTexture(aniso) });
  const switchLed = new THREE.MeshBasicMaterial({ color: '#ffb347' });

  M.ceiling.emissiveMap = M.ceiling.map;
  const add = (mesh, cast = true, receive = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return add(m, cast, mat !== M.wall);
  };

  // ---------- floor and ceiling ----------
  const depth = Z_BACK - Z_FRONT;
  const zMid = (Z_BACK + Z_FRONT) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), M.carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zMid);
  add(floor, false);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), M.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, zMid);
  add(ceiling, false, false);

  // Ceiling lights, aligned to the tile grid (each is one tile wide, two long).
  const troffers = [];
  for (const tz of [-2.8, -0.4, 1.4]) {
    for (const tx of [-0.6, 0.6]) {
      box(0.6, 0.02, 1.2, M.white, tx, H - 0.004, tz, false);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 1.14), lens);
      p.rotation.x = Math.PI / 2;
      p.position.set(tx, H - 0.016, tz);
      root.add(p);
      troffers.push(p);
    }
  }

  // ---------- walls ----------
  // A wall running along Z at a fixed X, with rectangular openings cut out.
  function sideWall(x, openings) {
    let cursor = Z_FRONT;
    const sorted = [...openings].sort((a, b) => a.z0 - b.z0);
    for (const o of sorted) {
      if (o.z0 > cursor) box(WALL_T, H, o.z0 - cursor, M.wall, x, H / 2, (o.z0 + cursor) / 2, false);
      const len = o.z1 - o.z0, mid = (o.z0 + o.z1) / 2;
      if (o.y0 > 0) box(WALL_T, o.y0, len, M.wall, x, o.y0 / 2, mid, false);
      if (o.y1 < H) box(WALL_T, H - o.y1, len, M.wall, x, (H + o.y1) / 2, mid, false);
      cursor = o.z1;
    }
    if (cursor < Z_BACK) box(WALL_T, H, Z_BACK - cursor, M.wall, x, H / 2, (Z_BACK + cursor) / 2, false);
  }
  const leftX = -HW - WALL_T / 2, rightX = HW + WALL_T / 2;
  const extWindows = [
    { z0: -4.0, z1: -2.35, y0: 0.9, y1: 2.25 },
    { z0: -1.95, z1: -0.3, y0: 0.9, y1: 2.25 },
    { z0: 0.1, z1: 1.6, y0: 0.9, y1: 2.25 },
  ];
  const intWindow = { z0: -3.9, z1: -0.75, y0: 0.95, y1: 2.15 };
  const doorway = { z0: 0.55, z1: 1.5, y0: 0, y1: 2.1 };
  sideWall(leftX, extWindows);
  sideWall(rightX, [intWindow, doorway]);
  box(W + 2 * WALL_T, H, WALL_T, M.wall, 0, H / 2, Z_FRONT - WALL_T / 2, false);
  box(W + 2 * WALL_T, H, WALL_T, M.wall, 0, H / 2, Z_BACK + WALL_T / 2, false);

  // Baseboards.
  const bb = 0.1, bt = 0.015;
  box(W, bb, bt, M.trim, 0, bb / 2, Z_FRONT + bt / 2, false);
  box(W, bb, bt, M.trim, 0, bb / 2, Z_BACK - bt / 2, false);
  box(bt, bb, depth, M.trim, -HW + bt / 2, bb / 2, zMid, false);
  box(bt, bb, doorway.z0 - Z_FRONT, M.trim, HW - bt / 2, bb / 2, (doorway.z0 + Z_FRONT) / 2, false);
  box(bt, bb, Z_BACK - doorway.z1, M.trim, HW - bt / 2, bb / 2, (Z_BACK + doorway.z1) / 2, false);

  // Corner shading on every large surface.
  const vig = new THREE.MeshBasicMaterial({ map: vignetteTexture(), transparent: true, depthWrite: false });
  const shade = (w, h, x, y, z, rx, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vig);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.renderOrder = 1;
    root.add(m);
  };
  const e = 0.004;
  shade(W, H, 0, H / 2, Z_FRONT + e, 0, 0);
  shade(W, H, 0, H / 2, Z_BACK - e, 0, Math.PI);
  shade(depth, H, -HW + e, H / 2, zMid, 0, Math.PI / 2);
  shade(depth, H, HW - e, H / 2, zMid, 0, -Math.PI / 2);
  shade(W, depth, 0, e, zMid, -Math.PI / 2, 0);
  shade(W, depth, 0, H - 0.03, zMid, Math.PI / 2, 0);

  // ---------- windows and blinds ----------
  const slatGeo = new THREE.BoxGeometry(0.048, 0.0025, 1);
  const slats = [];
  function windowUnit(o, side, backdrop, tilt) {
    // side: -1 = left wall, +1 = right wall
    const xIn = side * HW;
    const len = o.z1 - o.z0, mid = (o.z0 + o.z1) / 2, hgt = o.y1 - o.y0, yMid = (o.y0 + o.y1) / 2;
    const f = 0.045;
    // Frame.
    box(0.16, f, len, M.frame, xIn + side * 0.05, o.y0 + f / 2, mid, false);
    box(0.16, f, len, M.frame, xIn + side * 0.05, o.y1 - f / 2, mid, false);
    box(0.16, hgt, f, M.frame, xIn + side * 0.05, yMid, o.z0 + f / 2, false);
    box(0.16, hgt, f, M.frame, xIn + side * 0.05, yMid, o.z1 - f / 2, false);
    box(0.16, hgt, f * 0.7, M.frame, xIn + side * 0.05, yMid, mid, false);
    // Sill.
    box(0.09, 0.03, len + 0.08, M.white, xIn - side * 0.03, o.y0 - 0.015, mid, false);
    // What is seen beyond the glass.
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(len, hgt), backdrop);
    bd.rotation.y = -side * Math.PI / 2;
    bd.position.set(xIn + side * 0.115, yMid, mid);
    root.add(bd);
    // Blinds: head rail plus tilted slats.
    box(0.05, 0.04, len - 2 * f, M.white, xIn + side * 0.02, o.y1 - f - 0.02, mid, false);
    const spacing = 0.04;
    const count = Math.floor((hgt - 2 * f - 0.05) / spacing);
    for (let i = 0; i < count; i++) {
      slats.push({ x: xIn + side * 0.02, y: o.y1 - f - 0.06 - i * spacing, z: mid, len: len - 2 * f - 0.01, tilt: side * tilt });
    }
  }
  for (const o of extWindows) windowUnit(o, -1, outside, 0.95);
  windowUnit(intWindow, 1, bullpen, -0.8);
  const slatMesh = new THREE.InstancedMesh(slatGeo, M.blind, slats.length);
  const dummy = new THREE.Object3D();
  slats.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, 0, s.tilt);
    dummy.scale.set(1, 1, s.len);
    dummy.updateMatrix();
    slatMesh.setMatrixAt(i, dummy.matrix);
  });
  slatMesh.frustumCulled = false;
  add(slatMesh, false, false);

  // ---------- door ----------
  {
    const len = doorway.z1 - doorway.z0, mid = (doorway.z0 + doorway.z1) / 2;
    box(0.045, doorway.y1 - 0.02, len - 0.04, M.door, HW + 0.05, (doorway.y1 - 0.02) / 2, mid, false);
    box(0.17, doorway.y1, 0.05, M.frame, HW + 0.05, doorway.y1 / 2, doorway.z0 + 0.025, false);
    box(0.17, doorway.y1, 0.05, M.frame, HW + 0.05, doorway.y1 / 2, doorway.z1 - 0.025, false);
    box(0.17, 0.05, len, M.frame, HW + 0.05, doorway.y1 - 0.025, mid, false);
    box(0.02, 0.14, 0.045, M.chrome, HW + 0.02, 1.0, doorway.z0 + 0.12, false);
    box(0.05, 0.02, 0.12, M.chrome, HW - 0.01, 1.0, doorway.z0 + 0.16, false);
  }

  // ---------- light switch (point at it and pull the trigger to dim the lights) ----------
  const switchPos = new THREE.Vector3(HW - 0.012, 1.25, -0.25);
  box(0.012, 0.13, 0.085, M.white, HW - 0.006, switchPos.y, switchPos.z, false);
  const rocker = box(0.012, 0.055, 0.03, M.white, HW - 0.014, switchPos.y, switchPos.z, false);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.008), switchLed);
  led.position.set(HW - 0.014, switchPos.y - 0.048, switchPos.z);
  root.add(led);

  // ---------- screen wall ----------
  const SCREEN_W = 3.2, SCREEN_H = 1.8, SCREEN_Y = 1.5;
  box(SCREEN_W + 0.07, SCREEN_H + 0.07, 0.05, M.bezel, 0, SCREEN_Y, Z_FRONT + 0.03, false);
  box(SCREEN_W, SCREEN_H, 0.01, M.screen, 0, SCREEN_Y, Z_FRONT + 0.058, false);

  // Wall clock, right of the screen. It shows the real time.
  const clock = new THREE.Group();
  clock.position.set(2.2, 2.25, Z_FRONT + 0.02);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 48), M.plastic);
  rim.rotation.x = Math.PI / 2;
  clock.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 48), std('#ffffff', 0.7, { map: clockFaceTexture(aniso) }));
  face.position.z = 0.0185;
  clock.add(face);
  const hand = (len, wid, zOff) => {
    const pivot = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.003), M.plastic);
    h.position.y = len / 2 - 0.015;
    pivot.add(h);
    pivot.position.z = zOff;
    clock.add(pivot);
    return pivot;
  };
  const hourHand = hand(0.085, 0.012, 0.021);
  const minuteHand = hand(0.125, 0.008, 0.025);
  root.add(clock);

  // ---------- conference table ----------
  {
    const tw = 1.3, tl = 3.2, th = 0.045, rad = 0.16, topY = 0.74;
    const s = new THREE.Shape();
    const hx = tw / 2, hy = tl / 2;
    s.moveTo(-hx + rad, -hy);
    s.lineTo(hx - rad, -hy); s.quadraticCurveTo(hx, -hy, hx, -hy + rad);
    s.lineTo(hx, hy - rad); s.quadraticCurveTo(hx, hy, hx - rad, hy);
    s.lineTo(-hx + rad, hy); s.quadraticCurveTo(-hx, hy, -hx, hy - rad);
    s.lineTo(-hx, -hy + rad); s.quadraticCurveTo(-hx, -hy, -hx + rad, -hy);
    const geo = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 12 });
    const top = new THREE.Mesh(geo, [M.wood, M.edge]);
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, topY - th, -2.4);
    add(top);
    for (const z of [-3.35, -1.45]) {
      box(0.7, topY - th - 0.03, 0.09, M.edge, 0, (topY - th - 0.03) / 2 + 0.03, z);
      box(0.8, 0.03, 0.45, M.edge, 0, 0.015, z);
    }
    box(0.05, 0.3, 1.9, M.edge, 0, 0.5, -2.4);

    // Things left on the table.
    const y = topY + 0.006;
    const phone = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.045, 3, 1), M.plastic);
    phone.position.set(0, y + 0.022, -2.5);
    phone.rotation.y = Math.PI;
    add(phone);
    const key = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 24), M.chair);
    key.position.set(0, y + 0.047, -2.5);
    root.add(key);
    // Paper stacks and a pen.
    const paper = (x, z, rot, n) => {
      for (let i = 0; i < n; i++) {
        const p = box(0.216, 0.0012, 0.279, M.paper, x + (r() - 0.5) * 0.012, y + i * 0.0013, z + (r() - 0.5) * 0.012);
        p.rotation.y = rot + (r() - 0.5) * 0.12;
      }
    };
    paper(-0.36, -1.35, 0.12, 5);
    paper(0.33, -3.15, -0.3, 3);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 8), M.plastic);
    pen.rotation.set(Math.PI / 2, 0, 1.0);
    pen.position.set(-0.19, y + 0.005, -1.3);
    add(pen);
    // Mugs.
    const mug = (x, z, mat) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.095, 24), mat);
      m.position.set(x, y + 0.0475, z);
      add(m);
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), std('#2a1a10', 0.3));
      coffee.rotation.x = -Math.PI / 2;
      coffee.position.set(x, y + 0.088, z);
      root.add(coffee);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 20, Math.PI), mat);
      handle.rotation.z = -Math.PI / 2;
      handle.rotation.y = 0.6;
      handle.position.set(x + 0.038 * Math.cos(-0.6), y + 0.05, z + 0.038 * Math.sin(-0.6) * -1);
      add(handle);
    };
    mug(0.42, -1.2, M.white);
    mug(-0.4, -2.95, std('#2f4f7a', 0.5));
  }

  // ---------- chairs ----------
  const G = {
    seat: roundedBox(0.5, 0.48, 0.085, 0.09).rotateX(Math.PI / 2),
    back: roundedBox(0.45, 0.54, 0.07, 0.11),
    spine: new THREE.BoxGeometry(0.07, 0.36, 0.03),
    post: new THREE.CylinderGeometry(0.026, 0.026, 0.3, 12),
    hub: new THREE.CylinderGeometry(0.045, 0.05, 0.06, 12),
    spoke: new THREE.BoxGeometry(0.045, 0.03, 0.3),
    caster: new THREE.SphereGeometry(0.03, 12, 8),
    armPost: new THREE.BoxGeometry(0.03, 0.2, 0.04),
    armPad: new THREE.BoxGeometry(0.05, 0.025, 0.26),
  };
  function chair(x, z, yaw) {
    const c = new THREE.Group();
    const part = (geo, mat, px, py, pz, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      c.add(m);
      return m;
    };
    part(G.seat, M.chair, 0, 0.46, 0);
    part(G.back, M.chair, 0, 0.83, 0.235, 0.12);
    part(G.spine, M.plastic, 0, 0.6, 0.262, 0.12);
    part(G.post, M.chrome, 0, 0.27, 0);
    part(G.hub, M.plastic, 0, 0.1, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      part(G.spoke, M.plastic, Math.sin(a) * 0.15, 0.085, Math.cos(a) * 0.15, 0, a);
      part(G.caster, M.plastic, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
    }
    for (const s of [-1, 1]) {
      part(G.armPost, M.plastic, s * 0.26, 0.58, 0.05);
      part(G.armPad, M.plastic, s * 0.26, 0.69, 0.02);
    }
    c.position.set(x, 0, z);
    c.rotation.y = yaw;
    root.add(c);
  }
  for (const z of [-1.5, -2.4, -3.3]) {
    chair(-1.02 - r() * 0.1, z + (r() - 0.5) * 0.15, -Math.PI / 2 + (r() - 0.5) * 0.36);
    chair(1.02 + r() * 0.1, z + (r() - 0.5) * 0.15, Math.PI / 2 + (r() - 0.5) * 0.36);
  }

  // ---------- whiteboard (behind the viewer) ----------
  {
    const z = Z_BACK - 0.02;
    box(2.46, 1.26, 0.025, M.frame, 0, 1.5, z, false);
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), std('#ffffff', 0.6, { map: whiteboardTexture(aniso) }));
    wb.rotation.y = Math.PI;
    wb.position.set(0, 1.5, z - 0.0135);
    root.add(wb);
    box(2.0, 0.015, 0.07, M.frame, 0, 0.87, z - 0.04, false);
    const colors = ['#1a1a1a', '#1e3fa0', '#b02a2a'];
    colors.forEach((col, i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 10), std(col, 0.5));
      m.rotation.z = Math.PI / 2;
      m.position.set(-0.5 + i * 0.16, 0.886, z - 0.045);
      root.add(m);
    });
  }

  // ---------- plant in the front-left corner ----------
  {
    const px = -HW + 0.42, pz = Z_FRONT + 0.42;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.36, 28), M.pot);
    pot.position.set(px, 0.18, pz);
    add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.175, 28), std('#2b2119', 1));
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(px, 0.345, pz);
    root.add(soil);
    // Upright sword-shaped leaves.
    const leafShape = new THREE.Shape();
    leafShape.moveTo(-0.035, 0);
    leafShape.bezierCurveTo(-0.06, 0.35, -0.04, 0.75, 0, 1);
    leafShape.bezierCurveTo(0.04, 0.75, 0.06, 0.35, 0.035, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 10);
    for (let i = 0; i < 13; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.1;
      const leaf = new THREE.Mesh(leafGeo, i % 3 ? M.leaf : M.leafDark);
      leaf.position.set(px + Math.cos(a) * d, 0.34, pz + Math.sin(a) * d);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = r() * Math.PI * 2;
      leaf.rotation.x = (r() - 0.5) * 0.4 + (d * 2.2);
      const sc = 0.75 + r() * 0.6;
      leaf.scale.set(1 + r() * 0.5, sc, 1);
      add(leaf);
    }
  }

  // ---------- lighting ----------
  const hemi = new THREE.HemisphereLight('#fff7e8', '#8c8478', 1.25);
  root.add(hemi);
  // One soft overhead light gives everything a grounded shadow. The shadow
  // map is drawn once and reused, so it costs almost nothing per frame.
  const key = new THREE.DirectionalLight('#fff4e0', 1.5);
  key.position.set(0.5, 7, -0.6);
  key.target.position.set(0, 0, -1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  const sc = key.shadow.camera;
  sc.left = -3.4; sc.right = 3.4; sc.top = 4.2; sc.bottom = -4.2; sc.near = 1; sc.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 5;
  root.add(key, key.target);
  // Cool daylight spilling in from the exterior windows.
  const day = new THREE.PointLight('#dbe8ff', 5, 9, 1.6);
  day.position.set(-HW + 0.5, 1.7, -1.6);
  root.add(day);
  // Glow from the screen, only present once the room lights are down.
  const screenGlow = new THREE.PointLight('#9fb6e8', 0, 9, 1.5);
  screenGlow.position.set(0, SCREEN_Y, Z_FRONT + 1.0);
  root.add(screenGlow);

  // ---------- lights-down ("movie mode") ----------
  let level = 1; // 1 = lights on, 0 = lights down
  function applyLevel(k) {
    level = k;
    hemi.intensity = 0.07 + 1.18 * k;
    key.intensity = 1.5 * k;
    day.intensity = 0.35 + 4.65 * k;
    lens.emissiveIntensity = 1.6 * k;
    M.ceiling.emissiveIntensity = 0.3 * k;
    lens.color.setScalar(0.12 + 0.88 * k);
    outside.color.setScalar(0.06 + 0.94 * k);
    bullpen.color.setScalar(0.1 + 0.9 * k);
    screenGlow.intensity = 2.2 * (1 - k);
    rocker.rotation.z = (k > 0.5 ? 1 : -1) * 0.12;
  }
  applyLevel(1);

  function update() {
    const now = new Date();
    const m = now.getMinutes() + now.getSeconds() / 60;
    minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(((now.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
  }
  update();

  return {
    name: 'The Conference Room',
    root,
    background: new THREE.Color('#0b0b0c'),
    update,
    setLightLevel: applyLevel,
    getLightLevel: () => level,
    switchPosition: switchPos,
    setSwitchHighlight: (on) => switchLed.color.set(on ? '#ffffff' : '#ffb347'),
    seatedEye: new THREE.Vector3(0, 1.18, 0),
  };
}
