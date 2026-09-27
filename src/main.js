import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createCar } from './car.js';
import { createControls } from './controls.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

const SKY = 0x9fd3ea;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 140, 520);
scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x5a7a3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(80, 150, 40);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 600);
const world = buildWorld(scene);
const car = createCar();
scene.add(car.root);
car.pos.set(-3.5, 0, -80); // right-hand lane of the highway, facing north into town

const controls = createControls();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 80 : 62;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Chase camera
let camHeading = car.heading;
const camTarget = new THREE.Vector3(), look = new THREE.Vector3();
function updateCamera(dt, snap) {
  let d = car.heading - camHeading;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  camHeading += d * (snap ? 1 : Math.min(1, 4 * dt));
  const fx = Math.sin(camHeading), fz = Math.cos(camHeading);
  const back = 11 + Math.abs(car.speed) * 0.08;
  camTarget.set(car.pos.x - fx * back, car.pos.y + 5.2, car.pos.z - fz * back);
  if (snap) camera.position.copy(camTarget);
  else camera.position.lerp(camTarget, Math.min(1, 6 * dt));
  look.set(car.pos.x + fx * 4, car.pos.y + 1.6, car.pos.z + fz * 4);
  camera.lookAt(look);
}
updateCamera(0, true);

// HUD
const fpsEl = document.getElementById('fps');
const speedEl = document.getElementById('speed');
const hint = document.getElementById('hint');
setTimeout(() => { hint.style.opacity = 0; }, 6000);

let last = performance.now(), frames = 0, fpsTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.05);
  last = now;

  controls.update();
  car.update(dt, controls.input, world);
  updateCamera(dt, false);
  renderer.render(scene, camera);

  speedEl.firstChild.nodeValue = Math.round(Math.abs(car.speed) * 2.237);
  frames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsEl.textContent = `${Math.round(frames / fpsTime)} fps · ${renderer.info.render.calls} draws`;
    frames = 0; fpsTime = 0;
  }
}
requestAnimationFrame(frame);
