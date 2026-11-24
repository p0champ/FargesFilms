// Two rooms with no ground and no horizon, drawn entirely live:
//   The Great Beyond — a moving walkway rising through a field of stars
//                      toward a vast white light (Soul).
//   Earth Orbit      — a white deck floating above the Earth, with a wheel
//                      station turning in the distance (2001: A Space Odyssey).
import * as THREE from '../vendor/three.module.js';

function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// Stars as points on a huge sphere. `focus` (a unit vector) gathers a dense
// haze of extra stars around one direction.
function starField(renderer, count, uniforms, focus, spread) {
  const r = rng(99);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let v;
    if (focus && i > count * 0.35) {
      // sample around the focus direction, denser toward it
      const ang = Math.pow(r(), 1.6) * spread, az = r() * Math.PI * 2;
      const t1 = new THREE.Vector3(0, 1, 0).cross(focus).normalize(), t2 = focus.clone().cross(t1);
      v = focus.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t1, Math.sin(ang) * Math.cos(az)).addScaledVector(t2, Math.sin(ang) * Math.sin(az));
    } else {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      v = new THREE.Vector3(q * Math.cos(a), u, q * Math.sin(a));
    }
    pos[i * 3] = v.x * 600; pos[i * 3 + 1] = v.y * 600; pos[i * 3 + 2] = v.z * 600;
    seed[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uScale; attribute float aSeed; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float big = step(0.93, fract(aSeed * 3.7));
        vA = (0.45 + 0.55 * fract(aSeed * 1.9)) * (0.75 + 0.25 * sin(uTime * (1.0 + fract(aSeed) * 2.0) + aSeed * 9.0));
        gl_PointSize = uScale * (2.2 + 2.0 * fract(aSeed * 5.3) + big * 3.2); }`,
    fragmentShader: `precision highp float; uniform float uReveal, uStars; varying float vA;
      void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(1.0) * a * vA * uReveal * uStars, 1.0); }`,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = -3;
  return pts;
}

function common(renderer) {
  const uniforms = { uTime: { value: 0 }, uScale: { value: 1 }, uReveal: { value: 0 }, uStars: { value: 1 }, uLevel: { value: 1 } };
  const size = new THREE.Vector2();
  let level = 0, reveal = 0, time = 0;
  return {
    uniforms,
    api(extra) {
      return {
        background: new THREE.Color('#000000'),
        setLightLevel(k) { level = k; uniforms.uLevel.value = k; if (extra.onLevel) extra.onLevel(k); },
        getLightLevel: () => level,
        setReveal(k) { reveal = k; uniforms.uReveal.value = k; },
        update(dt, head) {
          time += dt;
          uniforms.uTime.value = time;
          uniforms.uScale.value = renderer.getDrawingBufferSize(size).y / 900;
          if (extra.onUpdate) extra.onUpdate(dt, time, head);
        },
        seatedEye: new THREE.Vector3(0, 1.2, 0),
      };
    },
  };
}

export function buildBeyond(renderer, { onProgress, onReady } = {}) {
  const root = new THREE.Group();
  const c = common(renderer);
  const u = c.uniforms;
  // The light sits ahead and above.
  const lightDir = new THREE.Vector3(0, Math.sin(0.42), -Math.cos(0.42)).normalize();
  const stars = starField(renderer, 9000, u, lightDir, 1.25);
  root.add(stars);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uTime, uReveal, uLevel; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0;
        float core = smoothstep(0.42, 0.34, d);
        float halo = pow(max(0.0, 1.0 - d), 2.4) * (0.9 + 0.1 * sin(uTime * 0.7));
        float k = 0.25 + 0.75 * uLevel;
        gl_FragColor = vec4(vec3(1.0, 0.99, 0.97) * (core + halo * 0.9) * uReveal * k, 1.0); }`,
  }));
  glow.scale.setScalar(680);
  glow.position.copy(lightDir).multiplyScalar(560);
  glow.lookAt(0, 1.2, 0);
  glow.renderOrder = -2;
  glow.frustumCulled = false;
  root.add(glow);

  // The walkway: flat under the seat, then rising toward the light.
  const W = 4.2, N = 160, pos = [], uv = [], idx = [];
  const yAt = (z) => (z > -5 ? 0 : Math.pow(-z - 5, 1.35) * 0.115);
  let dist = 0, prev = null;
  for (let i = 0; i <= N; i++) {
    const z = 14 - i * 1.6, y = yAt(z);
    if (prev) dist += Math.hypot(z - prev[0], y - prev[1]);
    prev = [z, y];
    pos.push(-W / 2, y, z, W / 2, y, z);
    uv.push(0, dist, 1, dist);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wg.setIndex(idx);
  const walk = new THREE.Mesh(wg, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uTime, uReveal, uLevel; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.035, 0.0, min(vUv.x, 1.0 - vUv.x));
        float step1 = smoothstep(0.06, 0.0, abs(fract(vUv.y * 0.55 - uTime * 0.16) - 0.5) - 0.44);
        float far = smoothstep(120.0, 20.0, vUv.y);
        vec3 c = vec3(0.07, 0.075, 0.09) + vec3(1.0) * (edge * 0.9 + step1 * 0.22) * (0.35 + 0.65 * uLevel);
        gl_FragColor = vec4(c * uReveal, (0.88 * far + edge * 0.1)); }`,
  }));
  walk.frustumCulled = false;
  root.add(walk);

  setTimeout(() => { if (onProgress) onProgress(1); if (onReady) onReady(); }, 0);
  return { key: 'beyond', name: 'The Great Beyond', subtitle: 'Soul', root, ...c.api({ onLevel: (k) => { u.uStars.value = 0.45 + 0.55 * k; } }) };
}

export function buildOrbit(renderer, { onProgress, onReady } = {}) {
  const root = new THREE.Group();
  const c = common(renderer);
  const u = c.uniforms;
  root.add(starField(renderer, 5000, u, null, 0));

  // The Earth, vast and below-left, with drifting cloud and a thin blue rim.
  const sun = new THREE.Vector3(0.55, 0.45, 0.7).normalize();
  const earthU = { ...u, uSun: { value: sun }, uEye: { value: new THREE.Vector3(0, 1.2, 0) } };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    uniforms: earthU,
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `precision highp float; uniform float uTime, uReveal, uLevel; uniform vec3 uSun, uEye; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*noise(p); p = p*2.02+3.1; a *= 0.5; } return s; }
      void main(){
        vec3 n = normalize(vN);
        vec3 p = vP + vec3(uTime * 0.0015, 0.0, 0.0);
        float land = smoothstep(0.52, 0.58, fbm(p * 2.2));
        vec3 c = mix(vec3(0.10, 0.30, 0.62), vec3(0.30, 0.42, 0.30), land * 0.6);
        float cloud = smoothstep(0.45, 0.72, fbm(p * 5.0 + vec3(0.0, uTime * 0.002, 0.0)) * 0.7 + fbm(p * 14.0) * 0.3);
        c = mix(c, vec3(0.96, 0.97, 1.0), cloud * 0.92);
        float lightAmt = smoothstep(-0.15, 0.5, dot(n, uSun));
        c *= 0.04 + 1.05 * lightAmt;
        float rim = pow(1.0 - max(dot(n, normalize(uEye - vW)), 0.0), 3.0);
        c += vec3(0.35, 0.6, 1.0) * rim * (0.25 + 0.75 * lightAmt);
        gl_FragColor = vec4(c * uReveal * (0.3 + 0.7 * uLevel), 1.0); }`,
  }));
  earth.scale.setScalar(620);
  earth.position.set(-470, -560, -330);
  earth.frustumCulled = false;
  root.add(earth);

  // A double-wheel station, far ahead and to the right, turning slowly.
  const metal = new THREE.ShaderMaterial({
    uniforms: { ...u, uSun: { value: sun } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uReveal, uLevel; uniform vec3 uSun; varying vec3 vN;
      void main(){ float l = max(dot(normalize(vN), uSun), 0.0);
        gl_FragColor = vec4(vec3(0.93, 0.94, 0.97) * (0.06 + 0.94 * l) * uReveal * (0.3 + 0.7 * uLevel), 1.0); }`,
  });
  const station = new THREE.Group();
  for (const zOff of [-9, 9]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(38, 3.2, 14, 96), metal);
    wheel.position.z = zOff;
    station.add(wheel);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(76, 1.8, 1.8), metal);
      spoke.rotation.z = i * Math.PI / 4;
      spoke.position.z = zOff;
      station.add(spoke);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 30, 24), metal);
  hub.rotation.x = Math.PI / 2;
  station.add(hub);
  const tilt = new THREE.Group();
  tilt.add(station);
  tilt.position.set(150, 70, -250);
  tilt.rotation.set(0.5, -0.75, 0.2);
  root.add(tilt);

  // A plain white deck to sit on, so you are not floating.
  const deck = new THREE.Mesh(new THREE.CircleGeometry(3.4, 6), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uReveal, uLevel; varying vec2 vP;
      void main(){ vec2 g = abs(fract(vP * 1.25) - 0.5);
        float line = smoothstep(0.47, 0.5, max(g.x, g.y));
        float rim = smoothstep(3.0, 3.35, length(vP));
        vec3 c = mix(vec3(0.82, 0.83, 0.86), vec3(0.2, 0.21, 0.24), line);
        c = mix(c, vec3(0.75, 0.1, 0.12), rim);
        gl_FragColor = vec4(c * uReveal * (0.12 + 0.88 * uLevel), 1.0); }`,
  }));
  deck.rotation.x = -Math.PI / 2;
  root.add(deck);

  setTimeout(() => { if (onProgress) onProgress(1); if (onReady) onReady(); }, 0);
  return {
    key: 'orbit', name: 'Earth Orbit', subtitle: '2001: A Space Odyssey', root,
    ...c.api({ onUpdate: (dt, t, head) => { station.rotation.z = t * 0.05; if (head) earthU.uEye.value.copy(head); } }),
  };
}
