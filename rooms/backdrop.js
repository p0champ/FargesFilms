// A room made from one wide film still.
// The ground patch is kept small (it fades out a few metres from the seat) so
// that the still's own foreground stays visible. The far scenery is a 360-degree
// backdrop (studio/make_pano.py) on a very large sphere that is fixed in the
// world: everything on it is distant, so it needs no stereo and stays put as
// you move your head. Under the seat is a real 3D patch of ground, coloured
// from the still, that fades out into the backdrop.
import * as THREE from '../vendor/three.module.js';

const VERT = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FRAG = `
precision highp float;
uniform vec3 uDark, uMid, uLight, uTint; uniform float uFade0, uFade1, uReveal, uGrain;
varying vec3 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  float broad = vnoise(vW.xz * 0.35) * 0.6 + vnoise(vW.xz * 1.3 + 9.0) * 0.4;
  float fine = vnoise(vW.xz * 14.0) * 0.6 + vnoise(vW.xz * 41.0) * 0.4;
  vec3 c = mix(uDark, uMid, smoothstep(0.2, 0.8, broad));
  c = mix(c, uLight, smoothstep(0.55, 1.0, fine) * uGrain);
  float a = 1.0 - smoothstep(uFade0, uFade1, length(vW.xz));
  gl_FragColor = vec4(c * uTint * uReveal, a);
}`;

// config: { key, name, subtitle, pano, ground: [dark, mid, light], grain, rise, motes?: colour, night?: [r,g,b] }
export function makeBackdropRoom(config) {
  return function build(renderer, { onProgress, onReady, onError } = {}) {
    const root = new THREE.Group();
    let level = 0, reveal = 0, time = 0;
    const lit = new THREE.Color(1, 1, 1), dim = new THREE.Color(...(config.night || [0.10, 0.11, 0.16]));
    const tint = new THREE.Color(1, 1, 1);
    const shared = { uTint: { value: tint }, uReveal: { value: 0 } };

    const big = renderer.capabilities.maxTextureSize >= 8192;
    const skyGeo = new THREE.SphereGeometry(500, 96, 48);
    skyGeo.scale(-1, 1, 1);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.rotation.y = -Math.PI / 2;   // the still itself is straight ahead
    sky.position.y = 1.2;            // horizon at seated eye level
    sky.renderOrder = -2;
    sky.frustumCulled = false;
    root.add(sky);
    const loader = new THREE.ImageBitmapLoader();
    loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });
    loader.load(`./assets/${config.pano}_${big ? '8k' : '4k'}.jpg`, (bitmap) => {
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

    // Ground: a wide, gently falling disc.
    const rise = config.rise ?? 1.6;
    const height = (x, z) => -rise * (1 - Math.exp(-(x * x + z * z) / 120));
    const rings = 40, segs = 96, R = 12, pos = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const rad = R * Math.pow(i / rings, 1.5);
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * Math.PI * 2;
        pos.push(Math.cos(a) * rad, height(Math.cos(a) * rad, Math.sin(a) * rad), Math.sin(a) * rad);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const [dark, mid, light] = config.ground;
    const ground = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GROUND_FRAG, transparent: true,
      uniforms: {
        ...shared,
        uDark: { value: new THREE.Color(dark) }, uMid: { value: new THREE.Color(mid) }, uLight: { value: new THREE.Color(light) },
        uFade0: { value: config.fade?.[0] ?? 3.5 }, uFade1: { value: config.fade?.[1] ?? 9 }, uGrain: { value: config.grain ?? 0.5 },
      },
    }));
    ground.frustumCulled = false;
    root.add(ground);

    // Optional drifting motes (pollen, dust, mist flecks).
    let moteUniforms = null;
    if (config.motes) {
      const N = 180, p = new Float32Array(N * 3), seed = new Float32Array(N);
      let s = 7;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < N; i++) {
        const a = r() * Math.PI * 2, d = 2.5 + r() * 16;
        p[i * 3] = Math.cos(a) * d; p[i * 3 + 1] = -0.5 + r() * 5; p[i * 3 + 2] = Math.sin(a) * d;
        seed[i] = r() * 100;
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(p, 3));
      mg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      moteUniforms = { uTime: { value: 0 }, uReveal: shared.uReveal, uScale: { value: 1 }, uColor: { value: new THREE.Color(config.motes) } };
      const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
        uniforms: moteUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime, uScale; attribute float aSeed; varying float vA;
          void main(){ vec3 p = position; p.y += mod(uTime * (0.03 + fract(aSeed) * 0.05) + aSeed, 5.5) - 0.5;
            p.x += sin(uTime * 0.22 + aSeed) * 0.5; p.z += cos(uTime * 0.18 + aSeed * 1.7) * 0.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            vA = 0.3 + 0.7 * abs(sin(uTime * 0.6 + aSeed * 3.0));
            gl_PointSize = uScale * (16.0 + 14.0 * fract(aSeed * 7.0)) / max(1.0, -mv.z); }`,
        fragmentShader: `precision highp float; uniform float uReveal; uniform vec3 uColor; varying float vA;
          void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
            gl_FragColor = vec4(uColor * a * a * vA * uReveal * 0.7, 1.0); }`,
      }));
      motes.frustumCulled = false;
      root.add(motes);
    }

    function paint() {
      tint.copy(dim).lerp(lit, level * level);
      skyMat.color.copy(tint).multiplyScalar(reveal);
      shared.uReveal.value = reveal;
    }
    const size = new THREE.Vector2();
    return {
      key: config.key, name: config.name, subtitle: config.subtitle, root,
      background: new THREE.Color('#000000'),
      setLightLevel(k) { level = k; paint(); },
      getLightLevel: () => level,
      setReveal(k) { reveal = k; paint(); },
      update(dt) {
        if (!moteUniforms) return;
        time += dt;
        moteUniforms.uTime.value = time;
        moteUniforms.uScale.value = renderer.getDrawingBufferSize(size).y / 900;
      },
      seatedEye: new THREE.Vector3(0, 1.2, 0),
    };
  };
}
