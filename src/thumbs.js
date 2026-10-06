import * as THREE from 'three';
import { vehicleModel } from './car.js';

// Studio renders of vehicles for the dealership and menus (rendered once, cached as images).
let renderer, scene, cam;
const cache = new Map(), box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();

function setup() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 270;
  renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x3a4058, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(6, 9, 7);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4);
  rim.position.set(-6, 4, -8);
  scene.add(key, rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
  floor.position.y = 0.01;
  scene.add(floor);
  cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 200);
}

export function vehicleThumb(def, cust = {}) {
  const key = `${def.id}:${cust.paint ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  try {
    if (!renderer) setup();
    const m = vehicleModel(def, cust);
    scene.add(m);
    box.setFromObject(m); box.getSize(size); box.getCenter(mid);
    const dist = Math.max(size.x, size.y * 1.6, size.z) * 2.15;
    cam.position.set(mid.x + dist * 0.62, mid.y + dist * 0.32, mid.z + dist * 0.72);
    cam.lookAt(mid.x, mid.y - size.y * 0.08, mid.z);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(m);
    const wheels = new Set(m.userData.wheels);
    m.traverse(o => { if (o.geometry && !wheels.has(o)) o.geometry.dispose(); });
    cache.set(key, url);
    return url;
  } catch { return ''; }
}
