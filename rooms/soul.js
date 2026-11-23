// The Hills — the soft pastel hills of a dreamlike "great before".
// The far landscape is a 360-degree backdrop made from a single wide film
// still (studio/make_pano.py); because everything in it is far away, it sits
// on a very large sphere and stays put as you move your head. Around the seat
// is real 3D: the grassy rise you sit on, soft mounds, slender trees and
// drifting motes of light, all drawn with the same glowing-edge look.
import * as THREE from '../vendor/three.module.js';

const SOFT_VERT = `
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){
  vL = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// One shader for every soft shape: a vertical colour blend, fine grass
// speckle, and a pale glow where the surface turns away from the eye.
const SOFT_FRAG = `
precision highp float;
uniform vec3 uLow, uHigh, uRim, uEye, uTint; uniform float uY0, uY1, uSpeckle, uFade0, uFade1, uReveal;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 n = normalize(vN), v = normalize(uEye - vW);
  vec3 c = mix(uLow, uHigh, smoothstep(uY0, uY1, vL.y));
  if (uSpeckle > 0.0) {
    // Broad drifts of turquoise, then two sizes of fine grass fleck.
    float drift = vnoise(vW.xz * 0.22) * 0.6 + vnoise(vW.xz * 0.6 + 4.0) * 0.4;
    c = mix(c, vec3(0.12, 0.62, 0.95), smoothstep(0.45, 0.85, drift) * 0.55);
    float dist = length(vW.xz - uEye.xz);
    float fleck = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 g = vW.xz * (k == 0 ? 34.0 : 15.0); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
      vec2 o = vec2(hash(id), hash(id + 7.3)) - 0.5;
      fleck += smoothstep(0.30, 0.08, length(f - o * 0.5)) * hash(id + 3.1) * (k == 0 ? 0.7 : 0.5);
    }
    c += vec3(0.10, 0.30, 0.26) * fleck * uSpeckle * smoothstep(16.0, 1.0, dist);
  }
  float rim = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.2);
  c = mix(c, uRim, rim * 0.75);
  float a = 1.0;
  if (uFade1 > 0.0) a = 1.0 - smoothstep(uFade0, uFade1, length(vW.xz));
  gl_FragColor = vec4(c * uTint * uReveal, a);
}`;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function build(renderer, { onProgress, onReady, onError } = {}) {
  const root = new THREE.Group();
  const r = rng(21);
  let level = 0, reveal = 0, time = 0;
  const lit = new THREE.Color(1, 1, 1), dim = new THREE.Color(0.10, 0.10, 0.22);
  const tint = new THREE.Color(1, 1, 1);
  const eye = new THREE.Vector3(0, 1.2, 0);
  const shared = { uEye: { value: eye }, uTint: { value: tint }, uReveal: { value: 0 } };
  const soft = (low, high, rim, y0, y1, extra = {}) => new THREE.ShaderMaterial({
    vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG,
    transparent: !!extra.fade1,
    uniforms: {
      ...shared,
      uLow: { value: new THREE.Color(low) }, uHigh: { value: new THREE.Color(high) }, uRim: { value: new THREE.Color(rim) },
      uY0: { value: y0 }, uY1: { value: y1 }, uSpeckle: { value: extra.speckle || 0 },
      uFade0: { value: extra.fade0 || 0 }, uFade1: { value: extra.fade1 || 0 },
    },
  });

  // Far backdrop.
  const big = renderer.capabilities.maxTextureSize >= 8192;
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, side: THREE.BackSide, depthWrite: false });
  const skyGeo = new THREE.SphereGeometry(500, 96, 48);
  skyGeo.scale(-1, 1, 1);
  skyMat.side = THREE.FrontSide;
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.rotation.y = -Math.PI / 2;
  sky.position.y = 1.2;          // horizon at seated eye level
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  root.add(sky);
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });
  loader.load(`./assets/soul_pano_${big ? '8k' : '4k'}.jpg`, (bitmap) => {
    const tex = new THREE.Texture(bitmap);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    renderer.initTexture(tex);
    skyMat.map = tex;
    skyMat.needsUpdate = true;
    if (onProgress) onProgress(1);
    if (onReady) onReady();
  }, undefined, (err) => { console.error('Could not load the backdrop', err); if (onError) onError(err); });

  // The rise you sit on: a wide, gently falling disc that fades into the backdrop.
  const height = (x, z) => {
    const d2 = x * x + z * z;
    return -2.6 * (1 - Math.exp(-d2 / 110)) + 0.10 * Math.sin(x * 0.45 + 1.0) * Math.cos(z * 0.38) * Math.min(1, d2 / 30);
  };
  {
    const rings = 56, segs = 120, R = 30;
    const pos = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const rad = R * Math.pow(i / rings, 1.5);
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * Math.PI * 2;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        pos.push(x, height(x, z), z);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, soft('#0d4fe6', '#3f7bfb', '#86b6ff', -2.6, 0.0, { speckle: 1, fade0: 17, fade1: 29 }));
    ground.frustumCulled = false;
    root.add(ground);
  }

  // Soft mounds scattered over the rise.
  const moundGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const moundMat = soft('#3a6cf7', '#7f9cff', '#c9d6ff', 0.0, 1.0);
  [[-6.5, -9.5, 2.6, 0.7], [7.5, -11.0, 3.2, 0.85], [-11, -2.0, 2.2, 0.6], [10.5, -1.5, 2.0, 0.55], [-8.5, 6.5, 2.8, 0.8],
    [7.0, 8.0, 2.4, 0.7], [0.5, 12.5, 3.0, 0.85], [-14, -11, 3.6, 1.1], [14.5, -12, 3.4, 1.0], [1.5, -15.5, 3.8, 1.0]].forEach(([x, z, rad, h]) => {
    const m = new THREE.Mesh(moundGeo, moundMat);
    m.scale.set(rad, h, rad);
    m.position.set(x, height(x, z) - 0.06, z);
    root.add(m);
  });

  // Slender trees.
  const prof = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; prof.push(new THREE.Vector2(Math.max(0.0005, 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 1.25)), t)); }
  const treeGeo = new THREE.LatheGeometry(prof, 20);
  const treeMat = soft('#8a5ae6', '#a068ee', '#e9c2ff', 0.0, 1.0);
  const trunkMat = soft('#5a3fc8', '#6f4bdc', '#b79af0', -0.5, 0.5);
  const trunkGeo = new THREE.CylinderGeometry(0.03, 0.045, 1, 8);
  // The view straight ahead (-Z) is kept open for the film window.
  [[-7.8, -8.6, 3.6], [8.4, -9.4, 4.2], [-11.5, -5.0, 5.0], [12.0, -6.5, 5.4], [-15.5, -12.5, 6.0], [16.0, -13.5, 6.4],
    [-8.4, 3.2, 4.2], [9.2, 3.8, 4.6], [-5.6, 9.5, 5.0], [4.8, 10.5, 5.4], [-13, 3.0, 5.6], [13.5, 2.5, 5.8], [-17, -3, 6.5], [17.5, -4, 6.8], [0.0, 16, 6.0]].forEach(([x, z, h]) => {
    const y = height(x, z);
    const w = h * (0.10 + r() * 0.03);
    const t = new THREE.Mesh(treeGeo, treeMat);
    t.scale.set(w, h, w);
    t.position.set(x, y + 0.5, z);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.set(1, 0.7, 1);
    trunk.position.set(x, y + 0.3, z);
    root.add(t, trunk);
  });

  // Drifting motes of light.
  const N = 260;
  const mote = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = 3 + r() * 22;
    mote[i * 3] = Math.cos(a) * d; mote[i * 3 + 1] = -1 + r() * 7; mote[i * 3 + 2] = Math.sin(a) * d;
    seed[i] = r() * 100;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mote, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const moteUniforms = { uTime: { value: 0 }, uReveal: shared.uReveal, uScale: { value: 1 } };
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
    uniforms: moteUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uScale; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position; p.y += mod(uTime * (0.05 + fract(aSeed) * 0.08) + aSeed, 8.0) - 1.0;
        p.x += sin(uTime * 0.3 + aSeed) * 0.4; p.z += cos(uTime * 0.25 + aSeed * 1.7) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vA = 0.35 + 0.65 * abs(sin(uTime * 0.8 + aSeed * 3.0));
        gl_PointSize = uScale * (26.0 + 22.0 * fract(aSeed * 7.0)) / max(1.0, -mv.z); }`,
    fragmentShader: `precision highp float; uniform float uReveal; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * a * a * vA * uReveal * 0.9, 1.0); }`,
  }));
  motes.frustumCulled = false;
  root.add(motes);

  function paint() {
    tint.copy(dim).lerp(lit, level * level);
    skyMat.color.copy(tint).multiplyScalar(reveal);
    shared.uReveal.value = reveal;
  }

  return {
    key: 'soul',
    name: 'The Hills',
    subtitle: 'Pastel hills at first light',
    root,
    background: new THREE.Color('#000000'),
    setLightLevel(k) { level = k; paint(); },
    getLightLevel: () => level,
    setReveal(k) { reveal = k; paint(); },
    update(dt, head) {
      time += dt;
      eye.copy(head);
      moteUniforms.uTime.value = time;
      moteUniforms.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 900;
    },
    seatedEye: new THREE.Vector3(0, 1.2, 0),
  };
}
