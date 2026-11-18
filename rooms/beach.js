// Kauai Sunset — a cartoon Hawaiian beach at dusk, seen from the deck of a
// little beach house. The land and props are modelled and lit in Blender
// (studio/beach.py); the sky, the sea and the fire are drawn live here so
// that clouds drift, waves roll in, stars twinkle and the torches flicker.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';

const SHEETS = ['near', 'far', 'ground', 'bg'];
const SEA = -0.8;
// Blender (x, y, z) -> three.js (x, z, -y).
const SUN = new THREE.Vector3(-0.6133, 0.0872, -0.785).normalize();
const FLAMES = [[-1.5, 3.6, 1.493, 0.22], [1.5, 3.6, 1.518, 0.22], [-1.6, 6.6, 1.376, 0.22], [1.7, 6.8, 1.427, 0.22],
  [-1.5, 9.6, 1.343, 0.22], [1.9, 9.8, 1.389, 0.22], [4.4, 8.6, -0.123, 0.5]];

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03+7.1; a *= 0.5; } return s; }
`;

const SKY_FRAG = `
precision highp float;
uniform float uTime, uNight, uReveal; uniform vec3 uSun; varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir); float e = d.y;
  vec3 hor = vec3(1.0,0.60,0.32), mid = vec3(0.88,0.40,0.58), top = vec3(0.17,0.16,0.44);
  vec3 c = mix(hor, mid, smoothstep(-0.02, 0.16, e));
  c = mix(c, top, smoothstep(0.10, 0.65, e));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(1.0,0.55,0.20) * pow(sd, 6.0) * 0.5;
  c += vec3(1.0,0.80,0.50) * pow(sd, 60.0) * 0.6;
  c = mix(c, vec3(1.0,0.94,0.72), smoothstep(0.9988, 0.9993, sd));
  vec2 uv = d.xz / (e + 0.35) * 1.6;
  float n = fbm(uv * 1.3 + vec2(uTime * 0.004, 0.0));
  float cl = smoothstep(0.50, 0.74, n) * smoothstep(0.02, 0.2, e) * (1.0 - smoothstep(0.45, 0.8, e));
  vec3 cc = mix(vec3(0.56,0.30,0.52), vec3(1.0,0.66,0.48), clamp(pow(sd, 2.0) * 0.9 + 0.15, 0.0, 1.0));
  c = mix(c, cc, cl * 0.85);
  vec3 nightC = mix(vec3(0.035,0.045,0.11), vec3(0.01,0.015,0.05), smoothstep(0.0, 0.6, e));
  c = mix(c, nightC + c * 0.06, uNight);
  vec3 q = d * 230.0; vec3 f = floor(q); float h = hash(f.xy + f.z * 17.0);
  float star = step(0.992, h) * smoothstep(0.38, 0.0, length(fract(q) - 0.5)) * (0.5 + 0.5 * fract(h * 57.0));
  star *= (0.6 + 0.4 * sin(uTime * 2.0 + h * 100.0)) * smoothstep(0.04, 0.3, e) * (0.2 + 0.8 * uNight) * (1.0 - cl);
  c += vec3(star);
  gl_FragColor = vec4(c * uReveal, 1.0);
}`;

const SEA_FRAG = `
precision highp float;
uniform float uTime, uNight, uReveal; uniform vec3 uSun, uEye; varying vec3 vWorld;
${NOISE}
void main(){
  vec3 v = normalize(vWorld - uEye);
  float t = clamp(1.0 - abs(v.y) * 5.0, 0.0, 1.0);
  vec3 c = mix(vec3(0.05,0.33,0.45), vec3(0.46,0.30,0.56), smoothstep(0.0, 0.7, t));
  c = mix(c, vec3(0.98,0.56,0.40), pow(t, 4.0));
  float n = fbm(vWorld.xz * vec2(0.22, 0.85) + vec2(uTime * 0.12, uTime * 0.05));
  c += (n - 0.5) * 0.10;
  vec2 sdir = normalize(uSun.xz), vdir = normalize(v.xz);
  float al = max(dot(vdir, sdir), 0.0);
  float sparkle = smoothstep(0.52, 0.78, fbm(vWorld.xz * vec2(0.5, 2.6) + vec2(0.0, uTime * 0.35)));
  c += vec3(1.0,0.76,0.46) * pow(al, 48.0) * sparkle * t * 1.3 * (1.0 - uNight);
  c += vec3(1.0,0.5,0.3) * pow(al, 8.0) * 0.22 * t * (1.0 - uNight);
  float shore = -12.4 + 0.45 * sin(uTime * 0.55) + 0.3 * sin(vWorld.x * 0.45 + uTime * 0.3);
  float dsea = shore - vWorld.z;
  float foam = smoothstep(1.3, 0.0, dsea) * step(-3.0, dsea) * (0.55 + 0.45 * vnoise(vWorld.xz * 3.0 + uTime * 0.2));
  float line2 = smoothstep(0.25, 0.0, abs(dsea - 2.6 - 0.6 * sin(uTime * 0.4 + vWorld.x * 0.3))) * 0.35;
  c = mix(c, vec3(1.0,0.96,0.92), clamp(foam * 0.85 + line2, 0.0, 1.0));
  c = mix(c, vec3(0.012,0.03,0.07) + c * 0.10, uNight);
  gl_FragColor = vec4(c * uReveal, 1.0);
}`;

const VERT = `
varying vec3 vDir; varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vDir = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export function build(renderer, { onProgress, onReady, onError } = {}) {
  const root = new THREE.Group();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mats = {};
  let level = 0, reveal = 0, time = 0;
  const lit = new THREE.Color(1, 1, 1), dim = new THREE.Color(0.10, 0.12, 0.22), black = new THREE.Color(0, 0, 0);
  const uniforms = {
    uTime: { value: 0 }, uNight: { value: 0 }, uReveal: { value: 0 },
    uSun: { value: SUN }, uEye: { value: new THREE.Vector3(0, 1.2, 0) },
  };
  function paint() {
    for (const m of Object.values(mats)) m.color.copy(dim).lerp(lit, level * level).lerp(black, 1 - reveal);
    uniforms.uNight.value = 1 - level * level;
    uniforms.uReveal.value = reveal;
  }

  // Sky dome and sea, drawn live.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  root.add(sky);
  const seaGeo = new THREE.PlaneGeometry(1400, 700);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: SEA_FRAG }));
  sea.position.set(0, SEA, -356);
  sea.frustumCulled = false;
  root.add(sea);

  // Fire: a flickering flame and a soft glow for each torch and the campfire.
  const profile = [[0, 0], [0.42, 0.18], [0.5, 0.42], [0.36, 0.8], [0.14, 1.25], [0, 1.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const flameGeo = new THREE.LatheGeometry(profile, 12);
  const outer = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xffe48f, toneMapped: false });
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const gg = glowCanvas.getContext('2d');
  const grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,190,110,0.9)');
  grad.addColorStop(0.3, 'rgba(255,140,60,0.35)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const flames = FLAMES.map(([x, y, z, size], i) => {
    const g = new THREE.Group();
    g.position.set(x, z - size * 0.5, -y);
    const a = new THREE.Mesh(flameGeo, outer);
    const b = new THREE.Mesh(flameGeo, inner);
    b.scale.setScalar(0.55);
    b.position.y = 0.06;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.y = size * 0.6;
    g.add(a, b, halo);
    root.add(g);
    return { g, a, halo, size, seed: i * 1.7 };
  });

  const total = SHEETS.length + 1;
  let loaded = 0, failed = false;
  const step = () => {
    loaded++;
    if (onProgress) onProgress(loaded / total);
    if (loaded === total && !failed && onReady) onReady();
  };
  const fail = (what) => (err) => {
    if (failed) return;
    failed = true;
    console.error(`Could not load ${what}`, err);
    if (onError) onError(err);
  };
  const bitmapLoader = new THREE.ImageBitmapLoader();
  bitmapLoader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' });
  for (const name of SHEETS) {
    // Leaves, the hammock and the canoe are thin shells seen from both sides.
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, side: THREE.DoubleSide });
    mats[name] = mat;
    bitmapLoader.load(`./assets/beach_${name}.jpg`, (bitmap) => {
      const tex = new THREE.Texture(bitmap);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.anisotropy = aniso;
      tex.needsUpdate = true;
      renderer.initTexture(tex);
      mat.map = tex;
      mat.needsUpdate = true;
      step();
    }, undefined, fail(`the ${name} texture`));
  }
  new GLTFLoader().load('./assets/beach.glb', (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const sheet = SHEETS.find((n) => o.name.endsWith(n));
      o.material = mats[sheet] || mats.far;
      o.frustumCulled = false;
    });
    root.add(gltf.scene);
    step();
  }, undefined, fail('the beach model'));

  return {
    key: 'beach',
    name: 'Kauai Sunset',
    subtitle: 'A beach house at dusk',
    root,
    background: new THREE.Color('#000000'),
    setLightLevel(k) { level = k; paint(); },
    getLightLevel: () => level,
    setReveal(k) { reveal = k; paint(); },
    // Called every frame with the viewer's head position.
    update(dt, eye) {
      time += dt;
      uniforms.uTime.value = time;
      uniforms.uEye.value.copy(eye);
      sky.position.copy(eye);
      for (const f of flames) {
        const t = time * 9 + f.seed;
        const flick = 0.85 + 0.12 * Math.sin(t) + 0.08 * Math.sin(t * 2.3 + 1.0) + 0.05 * Math.sin(t * 5.1);
        f.g.scale.set(f.size * (0.95 + 0.1 * Math.sin(t * 1.7)), f.size * flick, f.size * (0.95 + 0.1 * Math.cos(t * 1.3)));
        f.g.rotation.z = 0.06 * Math.sin(t * 0.7);
        f.halo.scale.setScalar(9 * flick);
        f.halo.material.opacity = (0.55 + 0.25 * flick) * reveal;
      }
    },
    seatedEye: new THREE.Vector3(0, 1.2, 0),
  };
}
