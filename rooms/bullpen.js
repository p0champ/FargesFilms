// The Bullpen — the paper-company office seen from the back desk clump,
// looking up the room toward reception. The room is modelled and lit in
// Blender (see studio/office_bullpen.py) and shown here as a 3D surround image.
import * as THREE from '../vendor/three.module.js';

export function build(renderer, onReady) {
  const root = new THREE.Group();
  const maxSize = renderer.capabilities.maxTextureSize;
  const suffix = maxSize >= 8192 ? '8k' : '4k';
  const loader = new THREE.TextureLoader();
  const geo = new THREE.SphereGeometry(40, 128, 64);
  geo.scale(-1, 1, 1); // view it from the inside
  const mats = [];
  let pending = 2;
  let level = 1;
  const lit = new THREE.Color(1, 1, 1);
  const dim = new THREE.Color(0.07, 0.085, 0.12); // lights down: dark, slightly blue
  function applyLevel(k) {
    level = k;
    for (const m of mats) if (m.map) m.color.copy(dim).lerp(lit, k * k);
  }
  ['L', 'R'].forEach((eye, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false });
    loader.load(`./assets/bullpen_${eye}_${suffix}.jpg`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      mat.map = tex;
      mat.needsUpdate = true;
      applyLevel(level);
      if (--pending === 0 && onReady) onReady();
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -Math.PI / 2; // image centre straight ahead
    mesh.layers.set(i + 1);         // layer 1 = left eye, layer 2 = right eye
    mesh.frustumCulled = false;
    root.add(mesh);
    mats.push(mat);
  });

  return {
    name: 'The Bullpen',
    root,
    background: new THREE.Color('#000000'),
    surround: true,
    update() {},
    setLightLevel: applyLevel,
    getLightLevel: () => level,
    seatedEye: new THREE.Vector3(0, 1.2, 0),
  };
}
