// The Office — the paper-company bullpen from the desk in the middle of the
// room. It is modelled and lit in Blender (studio/office_bullpen.py), which
// paints the finished lighting onto the surfaces; here it is drawn as a real
// 3D model, so the room stays still and solid as you move your head.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';

const SHEETS = ['near', 'far', 'shell'];

// build(renderer, { onProgress(fraction), onReady(), onError(error) })
export function build(renderer, { onProgress, onReady, onError } = {}) {
  const root = new THREE.Group();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mats = {};
  let level = 0;
  const lit = new THREE.Color(1, 1, 1);
  const dim = new THREE.Color(0.05, 0.06, 0.09); // lights down: dark, slightly blue
  const black = new THREE.Color(0, 0, 0);
  let reveal = 0; // 0 = black (still loading), 1 = fully shown
  function paint() {
    for (const m of Object.values(mats)) m.color.copy(dim).lerp(lit, level * level).lerp(black, 1 - reveal);
  }

  const total = SHEETS.length + 1;
  let loaded = 0;
  let failed = false;
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

  // Textures are decoded off the main thread and uploaded to the graphics
  // chip before the room is offered, so entering VR does not stutter.
  const bitmapLoader = new THREE.ImageBitmapLoader();
  bitmapLoader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' });
  for (const name of SHEETS) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    mats[name] = mat;
    bitmapLoader.load(`./assets/bullpen_${name}.jpg`, (bitmap) => {
      const tex = new THREE.Texture(bitmap);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;           // glTF texture coordinates
      tex.anisotropy = aniso;
      tex.needsUpdate = true;
      renderer.initTexture(tex);
      mat.map = tex;
      mat.needsUpdate = true;
      step();
    }, undefined, fail(`the ${name} texture`));
  }
  new GLTFLoader().load('./assets/bullpen.glb', (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const sheet = SHEETS.find((n) => o.name.includes(n));
      o.material = mats[sheet] || mats.far;
      o.frustumCulled = false;
    });
    root.add(gltf.scene);
    step();
  }, undefined, fail('the room model'));

  return {
    key: 'bullpen',
    name: 'The Office',
    subtitle: 'The bullpen',
    root,
    background: new THREE.Color('#000000'),
    setLightLevel(k) { level = k; paint(); },
    getLightLevel: () => level,
    setReveal(k) { reveal = k; paint(); },
    seatedEye: new THREE.Vector3(0, 1.2, 0),
  };
}
