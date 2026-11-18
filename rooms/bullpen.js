// The Bullpen — the paper-company office from the desk in the middle of the
// room. It is modelled and lit in Blender (studio/office_bullpen.py), which
// paints the finished lighting onto the surfaces; here it is drawn as a real
// 3D model, so the room stays still and solid as you move your head.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';

const SHEETS = ['near', 'far', 'shell'];

export function build(renderer, onReady) {
  const root = new THREE.Group();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mats = {};
  let level = 1;
  const lit = new THREE.Color(1, 1, 1);
  const dim = new THREE.Color(0.05, 0.06, 0.09); // lights down: dark, slightly blue
  function applyLevel(k) {
    level = k;
    for (const m of Object.values(mats)) m.color.copy(dim).lerp(lit, k * k);
  }

  let pending = SHEETS.length + 1;
  const done = () => { if (--pending === 0 && onReady) onReady(); };
  const texLoader = new THREE.TextureLoader();
  for (const name of SHEETS) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    mats[name] = mat;
    texLoader.load(`./assets/bullpen_${name}.jpg`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;           // glTF texture coordinates
      tex.anisotropy = aniso;
      mat.map = tex;
      mat.needsUpdate = true;
      applyLevel(level);
      done();
    });
  }
  new GLTFLoader().load('./assets/bullpen.glb', (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const sheet = SHEETS.find((n) => o.name.includes(n));
      o.material = mats[sheet] || mats.far;
      o.frustumCulled = false;
    });
    root.add(gltf.scene);
    done();
  });

  return {
    name: 'The Office',
    root,
    background: new THREE.Color('#000000'),
    update() {},
    setLightLevel: applyLevel,
    getLightLevel: () => level,
    seatedEye: new THREE.Vector3(0, 1.2, 0),
  };
}
