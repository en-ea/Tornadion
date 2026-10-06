import * as THREE from 'three';
import { Kit, box, cyl, clamp, rr, hash } from './util.js';

// "Dionado" custom SUV in the friend's colours from the wishlist.
const COL = { body: 0x1700eb, cabin: 0x3220a7, trim: 0x3c392f, rims: 0xb3b3b3, glass: 0x3c568b, lights: 0xfff9b3, armor: 0x6c7080, metal: 0x9aa0a8 };
// Top-speed multiplier per ground type.
const GRIP = { highway: 1, road: 0.9, grass: 0.72, field: 0.62, corn: 0.5, water: 0.28 };

function shape(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); return s; }
// Extrude a side profile (x = forward, y = up) across the car's width.
function extrudeX(s, width, bevel = 0.08, steps = 1) {
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

function logoTexture(withText) {
  const c = document.createElement('canvas');
  c.width = withText ? 256 : 128; c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    g.lineWidth = 8 - i * 0.6;
    g.beginPath();
    g.ellipse(64 + Math.sin(i * 0.9) * 8, 16 + i * 15, 50 - i * 6.5, 6, 0, 0, Math.PI * 2);
    g.stroke();
  }
  if (withText) {
    g.fillStyle = '#fff'; g.font = 'bold 34px "Lilita One", Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('DIONADO', 118, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(235,245,255,.95)'; g.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const cx = 40 + Math.random() * 176, cy = 40 + Math.random() * 176;
    for (let i = 0; i < 9; i++) {
      let x = cx, y = cy, a = Math.random() * 6.28;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 0.8; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
      g.stroke();
    }
    for (let r = 8; r < 30; r += 10) { g.beginPath(); g.arc(cx, cy, r, 0, 6.28); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildModel() {
  const k = new Kit();
  // Lower body with wheel arches.
  const b = new THREE.Shape();
  b.moveTo(-2.45, 0.62); b.lineTo(-2.38, 0.5); b.lineTo(-2.24, 0.5);
  b.absarc(-1.5, 0.6, 0.74, Math.PI, 0, true);
  b.lineTo(0.76, 0.5);
  b.absarc(1.5, 0.6, 0.74, Math.PI, 0, true);
  b.lineTo(2.38, 0.5); b.lineTo(2.5, 0.72); b.lineTo(2.5, 1.15); b.lineTo(2.3, 1.38); b.lineTo(1.05, 1.52);
  b.lineTo(-2.4, 1.55); b.lineTo(-2.5, 1.35); b.lineTo(-2.45, 0.62);
  k.add(extrudeX(b, 2.0, 0.08, 3), COL.body, 0, 0, 0, 0, 0, 0, 0.03);
  // Greenhouse (windows), roof and pillars.
  const gh = shape([[1.05, 1.5], [0.15, 2.28], [-2.05, 2.3], [-2.35, 1.52]]);
  k.add(extrudeX(gh, 1.8, 0.05), COL.glass, 0, 0, 0, 0, 0, 0, 0.02);
  k.add(box(1.96, 0.14, 2.3), COL.cabin, 0, 2.36, -0.95);
  k.add(box(1.98, 0.08, 3.4), COL.cabin, 0, 1.56, -0.6);
  for (const s of [-1, 1]) {
    k.add(box(0.1, 0.1, 1.2), COL.cabin, s * 0.93, 1.89, 0.6, 0.714);
    k.add(box(0.08, 0.72, 0.14), COL.cabin, s * 0.93, 1.9, -0.55);
    k.add(box(0.08, 0.72, 0.14), COL.cabin, s * 0.93, 1.9, -1.45);
    k.add(box(0.1, 0.84, 0.1), COL.cabin, s * 0.93, 1.91, -2.2, 0.367);
    // Stripe, rocker trim, fender flares, heavy armour plates with bolts.
    k.add(box(0.05, 0.14, 3.7), COL.trim, s * 1.09, 1.3, 0);
    k.add(box(0.1, 0.16, 1.4), COL.trim, s * 1.1, 0.6, 0);
    for (const z of [-1.5, 1.5]) k.add(new THREE.TorusGeometry(0.8, 0.08, 4, 8, Math.PI), COL.trim, s * 1.1, 0.6, z, 0, Math.PI / 2);
    k.add(box(0.1, 0.46, 1.25), COL.armor, s * 1.15, 0.98, 0);
    for (const z of [-0.5, 0.5]) for (const y of [0.82, 1.14]) k.add(box(0.06, 0.07, 0.07), 0x3a3d45, s * 1.21, y, z);
  }
  // Front: grille, bumper, bull bar, skid plate.
  k.add(box(1.2, 0.35, 0.05), 0x1e1e24, 0, 0.98, 2.51);
  k.add(box(2.1, 0.22, 0.28), COL.trim, 0, 0.66, 2.5);
  k.add(box(2.1, 0.22, 0.28), COL.trim, 0, 0.66, -2.5);
  for (const x of [-0.55, 0.55]) k.add(cyl(0.06, 0.06, 0.8, 5), 0x2a2a2e, x, 0.98, 2.64);
  for (const y of [0.72, 1.32]) k.add(cyl(0.06, 0.06, 1.5, 5), 0x2a2a2e, 0, y, 2.64, 0, 0, Math.PI / 2);
  k.add(box(1.6, 0.12, 0.5), COL.metal, 0, 0.52, 2.35);
  // Roof gear: rack, weather sensors, radar dome, light bar.
  for (const x of [-0.8, 0.8]) k.add(box(0.06, 0.08, 2.0), 0x2a2a2e, x, 2.47, -0.95);
  for (const z of [-0.2, -1.7]) k.add(box(1.7, 0.06, 0.06), 0x2a2a2e, 0, 2.5, z);
  k.add(cyl(0.04, 0.04, 1.0, 5), COL.metal, 0.6, 2.95, -1.7);
  k.add(box(0.04, 0.2, 0.4), 0xd9362b, 0.6, 3.3, -1.95);
  k.add(new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2f2f2, -0.5, 2.44, -1.5);
  k.add(box(0.5, 0.22, 0.4), 0xf2f2f2, -0.4, 2.55, -0.4);
  k.add(box(1.4, 0.12, 0.18), COL.trim, 0, 2.52, 0.05);
  // Jet booster.
  k.add(box(0.5, 0.4, 0.4), COL.trim, 0, 1.0, -2.6);
  k.add(cyl(0.3, 0.38, 1.1, 10), COL.metal, 0, 1.35, -2.8, Math.PI / 2);
  k.add(cyl(0.42, 0.34, 0.25, 10), COL.trim, 0, 1.35, -3.4, Math.PI / 2);
  k.add(box(0.05, 0.35, 0.5), COL.body, 0, 1.75, -2.9);
  for (const s of [-1, 1]) k.add(box(0.35, 0.05, 0.5), COL.body, s * 0.45, 1.35, -2.9);
  return k.geometry();
}
function lightsGeo() {
  const k = new Kit();
  for (const s of [-1, 1]) {
    k.add(box(0.46, 0.24, 0.06), COL.lights, s * 0.66, 1.18, 2.52, 0, 0, 0, 0);
    k.add(box(0.3, 0.3, 0.06), 0xff2a2a, s * 0.8, 1.25, -2.52, 0, 0, 0, 0);
    k.add(box(0.26, 0.1, 0.1), 0xffa51f, s * 0.45, 2.6, 0.05, 0, 0, 0, 0);
  }
  return k.geometry();
}
function wheelGeo() {
  const k = new Kit();
  // Tyre with a bulged sidewall and staggered chunky tread.
  k.add(cyl(0.6, 0.6, 0.46, 18), 0x1b1b20, 0, 0, 0, 0, 0, Math.PI / 2);
  k.add(cyl(0.54, 0.54, 0.52, 18), 0x26262b, 0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI / 9;
    for (const x of [-0.12, 0.12]) { const b = a + (x > 0 ? Math.PI / 18 : 0); k.add(box(0.22, 0.09, 0.17), 0x202024, x, Math.cos(b) * 0.61, Math.sin(b) * 0.61, b); }
  }
  // Dished rims with five spokes and a hub, on both faces.
  for (const s of [-1, 1]) {
    k.add(cyl(0.38, 0.38, 0.04, 14), COL.rims, s * 0.25, 0, 0, 0, 0, Math.PI / 2);
    k.add(cyl(0.3, 0.3, 0.05, 14), 0x6d7078, s * 0.26, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) k.add(box(0.04, 0.08, 0.56), 0xc8cacf, s * 0.275, 0, 0, i * Math.PI * 0.4);
    k.add(cyl(0.11, 0.13, 0.06, 8), COL.trim, s * 0.29, 0, 0, 0, 0, Math.PI / 2);
  }
  return k.geometry();
}
// Swap a vehicle's factory body colours for a custom paint (keeps the per-face shading jitter).
const _src = new THREE.Color(), _dst = new THREE.Color();
function repaint(geo, from, to) {
  const c = geo.attributes.color.array;
  from.forEach((hex, n) => {
    _src.set(hex); _dst.set(to).multiplyScalar(n ? 0.72 : 1);
    const sum = _src.r + _src.g + _src.b;
    for (let i = 0; i < c.length; i += 9) {
      const j = (c[i] + c[i + 1] + c[i + 2]) / sum;
      if (j < 0.93 || j > 1.07 || Math.abs(c[i] - _src.r * j) > 0.012 || Math.abs(c[i + 1] - _src.g * j) > 0.012 || Math.abs(c[i + 2] - _src.b * j) > 0.012) continue;
      for (let v = 0; v < 9; v += 3) { c[i + v] = _dst.r * j; c[i + v + 1] = _dst.g * j; c[i + v + 2] = _dst.b * j; }
    }
  });
  geo.attributes.color.needsUpdate = true;
}
function decalTexture(id) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  if (id === 'stripes') { g.fillStyle = '#fff'; g.fillRect(0, 30, 512, 20); g.fillRect(0, 78, 512, 20); }
  else if (id === 'flames') {
    for (const [col, sc] of [['#e8261a', 1], ['#ff8a1a', 0.75], ['#ffe14a', 0.45]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 8);
      const n = 5, h = 112 / n;
      for (let i = 0; i < n; i++) {
        const y0 = 8 + i * h, L = (230 + [90, 220, 40, 170, 10][i]) * sc;
        g.quadraticCurveTo(L * 0.55, y0 - 6, L, y0 + h * 0.35);
        g.quadraticCurveTo(L * 0.45, y0 + h * 0.95, 40 * sc, y0 + h);
      }
      g.lineTo(0, 120); g.closePath(); g.fill();
    }
  } else if (id === 'bolt') {
    g.fillStyle = '#ffd21a'; g.strokeStyle = '#1b1b1f'; g.lineWidth = 6;
    g.beginPath();
    for (const [x, y] of [[4, 50], [220, 34], [196, 62], [508, 44], [292, 96], [314, 66], [4, 84]]) g.lineTo(x, y);
    g.closePath(); g.fill(); g.stroke();
  } else if (id === 'chaser') {
    g.font = 'bold 66px "Lilita One", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeText('STORM CHASER', 256, 66);
    g.fillStyle = '#fff'; g.fillText('STORM CHASER', 256, 66);
  } else if (id === 'number') {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(256, 64, 58, 0, 7); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 76px "Lilita One", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('13', 256, 68);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCar(scene) {
  let def = { id: 'dionado', len: 4.9 };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  scene.add(root);

  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  let bodyGeo = buildModel();
  let orig = bodyGeo.attributes.position.array.slice();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  const lightsMesh = new THREE.Mesh(lightsGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  body.add(bodyMesh, lightsMesh);

  // Decals
  const sideMat = new THREE.MeshLambertMaterial({ map: logoTexture(true), transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), sideMat);
    p.position.set(s * 1.23, 0.98, 0.0); p.rotation.y = s * Math.PI / 2;
    body.add(p);
  }
  const hood = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshLambertMaterial({ map: logoTexture(false), transparent: true, depthWrite: false }));
  hood.rotation.x = -Math.PI / 2 - 0.11; hood.position.set(0, 1.49, 1.7);
  body.add(hood);

  // Cracked-glass overlays (opacity follows window damage).
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.18), crackMat);
  ws.position.set(0, 1.9, 0.62); ws.rotation.x = -0.857;
  body.add(ws);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.6), crackMat);
    p.position.set(s * 0.97, 1.9, -0.95); p.rotation.y = s * Math.PI / 2;
    body.add(p);
  }

  // Metal shutters roll down over the windows when anchored.
  const shut = new THREE.Group();
  shut.position.y = 2.31;
  const shK = new Kit();
  const sg = extrudeX(shape([[1.1, 1.48], [0.17, 2.3], [-2.08, 2.32], [-2.4, 1.5]]), 1.88, 0.05);
  sg.translate(0, -2.31, 0);
  shK.add(sg, COL.trim, 0, 0, 0, 0, 0, 0, 0.18);
  shut.add(new THREE.Mesh(shK.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  shut.visible = false;
  body.add(shut);

  // Spinning anemometer cups.
  const spinner = new THREE.Group();
  spinner.position.set(0.6, 3.48, -1.7);
  const spK = new Kit();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    spK.add(box(0.4, 0.03, 0.03), COL.metal, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0, -a);
    spK.add(new THREE.SphereGeometry(0.08, 6, 3), 0xf2f2f2, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
  }
  spinner.add(spK.mesh());
  body.add(spinner);

  // Jet flame.
  const flame = new THREE.Group();
  const fOuter = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  const fInner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  fOuter.position.y = 0.9; fInner.position.y = 0.55;
  flame.add(fOuter, fInner);
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, 1.35, -3.5);
  flame.visible = false;
  body.add(flame);
  let flameS = 1;

  // Ground anchor spikes.
  const spikes = new THREE.Group();
  const skK = new Kit();
  for (const [x, z] of [[-0.75, 2.05], [0.75, 2.05], [-0.75, -2.1], [0.75, -2.1]]) {
    skK.add(cyl(0.09, 0.09, 0.7, 6), COL.metal, x, 0.35, z);
    skK.add(new THREE.ConeGeometry(0.14, 0.55, 6), 0x2a2a2e, x, -0.27, z, Math.PI);
  }
  spikes.add(skK.mesh());
  spikes.position.y = 0.55;
  body.add(spikes);

  // Dionado-only parts (decals, cracks overlay, shutters, sensors) get hidden on other vehicles.
  const extras = body.children.filter(o => ![bodyMesh, lightsMesh, flame, spikes].includes(o));
  const logoSides = extras.filter(o => o.material === sideMat);

  // Custom side decals (placed on the body by raycasting its side).
  const decals = [-1, 1].map(s => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.y = s * Math.PI / 2; m.visible = false; m.userData.s = s;
    body.add(m);
    return m;
  });
  const decalTex = {};
  const ray = new THREE.Raycaster(), rayMesh = new THREE.Mesh(undefined, bodyMat), rO = new THREE.Vector3(), rD = new THREE.Vector3(-1, 0, 0);
  const sideX = (y, z) => { ray.set(rO.set(8, y, z), rD); const h = ray.intersectObject(rayMesh)[0]; return h ? h.point.x : 0.9; };

  // Roof light bar (red/blue strobes).
  const bar = new THREE.Group();
  const barK = new Kit();
  barK.add(box(1.34, 0.08, 0.28), 0x1b1b1f, 0, 0, 0);
  for (const x of [-0.5, 0.5]) barK.add(box(0.08, 0.12, 0.22), 0x2a2a2e, x, -0.08, 0);
  bar.add(barK.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const redM = new THREE.MeshBasicMaterial({ color: 0xff2020 }), blueM = new THREE.MeshBasicMaterial({ color: 0x2060ff }), lensG = new THREE.BoxGeometry(0.26, 0.13, 0.24);
  for (const [x, m] of [[-0.46, redM], [-0.17, redM], [0.17, blueM], [0.46, blueM]]) { const l = new THREE.Mesh(lensG, m); l.position.set(x, 0.1, 0); bar.add(l); }
  bar.visible = false;
  body.add(bar);

  // Off-road wheels.
  const wg = wheelGeo(), wMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const fronts = [], spins = [], pivots = [];
  for (const [x, z] of [[-1.08, 1.5], [1.08, 1.5], [-1.08, -1.5], [1.08, -1.5]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.62, z);
    const spin = new THREE.Mesh(wg, wMat);
    spin.castShadow = true;
    pivot.add(spin);
    root.add(pivot);
    pivots.push(pivot);
    spins.push(spin);
    if (z > 0) fronts.push(pivot);
  }

  // Headlights (switched on at night by the weather system).
  const spot = new THREE.SpotLight(0xfff4c8, 0, 80, 0.55, 0.5, 1);
  spot.position.set(0, 1.3, 2.4);
  spot.target.position.set(0, 0, 20);
  root.add(spot, spot.target);

  // Damage smoke.
  const SMOKE = 28;
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: 0x55585c, transparent: true, opacity: 0.7, flatShading: true, depthWrite: false }), SMOKE);
  smoke.frustumCulled = false;
  scene.add(smoke);
  const puffs = Array.from({ length: SMOKE }, () => ({ p: new THREE.Vector3(), t: 9 }));
  let smokeIdx = 0, smokeAcc = 0;
  const dummy = new THREE.Object3D();

  const dents = [];
  function deform(crumple) {
    const a = bodyGeo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = orig[i], y = orig[i + 1], z = orig[i + 2];
      const n = hash(Math.round(x * 7), Math.round(y * 7) * 131 + Math.round(z * 7)) - 0.5;
      let dx = n * crumple, dy = n * crumple * 0.6, dz = -n * crumple;
      for (const d of dents) {
        const dd = Math.hypot(x - d.x, y - d.y, z - d.z);
        if (dd < 1) { const f = d.depth * (1 - dd) * (1 - dd); dx -= d.nx * f; dy -= 0.3 * f; dz -= d.nz * f; }
      }
      a[i] = x + dx; a[i + 1] = y + dy; a[i + 2] = z + dz;
    }
    bodyGeo.attributes.position.needsUpdate = true;
    bodyGeo.computeVertexNormals();
  }

  const tmpV = new THREE.Vector3();
  const car = {
    root, pos: root.position, heading: 0, speed: 0, steer: 0, surface: 'road',
    vel: new THREE.Vector3(), spin: new THREE.Vector3(), tilt: new THREE.Vector2(),
    airborne: false, anchored: false, anchorT: 0, dead: false, relaxed: false,
    health: 100, maxHealth: 140, fuel: 100, maxFuel: 100, windows: 0,
    accMul: 1, offroad: 0, nitro: 0, mass: 1.25, armor: 1.3, hailproof: false, top: 34, jet: true, canAnchor: true, shutters: true, perk: null, onEvent: null, headlights: spot, wind: { x: 0, z: 0, up: 0, speed: 0 }, airTime: 0,

    setVehicle(d, up = {}, cust = {}) {
      def = d;
      const g = d.build ? d.build() : { body: buildModel(), lights: lightsGeo() };
      if (cust.paint != null && d.paint) repaint(g.body, d.paint, cust.paint);
      bodyGeo.dispose(); lightsMesh.geometry.dispose();
      bodyGeo = g.body; orig = bodyGeo.attributes.position.array.slice();
      bodyMesh.geometry = bodyGeo; lightsMesh.geometry = g.lights;
      dents.length = 0;
      const dion = d.id === 'dionado';
      for (const o of extras) o.visible = dion && o !== shut;
      const dec = !!cust.decal && cust.decal !== 'none';
      if (dion && dec) for (const o of logoSides) o.visible = false;
      rayMesh.geometry = bodyGeo;
      const dy = (d.wr || 0.62) + 0.42, dl = Math.min(d.len * 0.5, 2.6), dx = Math.max(sideX(dy, 0), sideX(dy, dl * 0.35), sideX(dy, -dl * 0.35)) + 0.02;
      for (const m of decals) {
        m.visible = dec;
        if (!dec) continue;
        const flip = m.userData.s < 0 && cust.decal !== 'chaser' && cust.decal !== 'number', key = cust.decal + (flip ? '-f' : '');
        if (!decalTex[key]) { const t = decalTex[key] = decalTexture(cust.decal); if (flip) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; } }
        m.material.map = decalTex[key]; m.material.needsUpdate = true;
        m.scale.set(dl, Math.min(0.62, dl / 4), 1);
        m.position.set(m.userData.s * dx, dy, 0);
      }
      bar.visible = !!cust.bar && !!d.bar;
      if (d.bar) bar.position.set(0, d.bar[0], d.bar[1]);
      shut.visible = false;
      this.shutters = dion;
      this.maxHealth = d.hp; this.health = d.hp; this.windows = 0;
      this.mass = d.mass + (up.weight || 0) * 0.25;
      this.armor = d.armor + (up.armor || 0) * 0.2;
      this.top = d.top * (1 + 0.06 * (up.engine || 0)); this.accMul = 1 + 0.12 * (up.engine || 0);
      this.offroad = 0.15 * (up.tyres || 0) + (d.offroad || 0); this.nitro = up.nitro || 0;
      this.jet = !!d.jet; this.canAnchor = !!d.anchor; this.perk = d.perk || null;
      this.hailproof = !!up.windows || !!d.hailproof;
      this.maxFuel = (d.fuel || 100) * (1 + 0.25 * (up.tank || 0)); this.fuel = Math.min(this.fuel, this.maxFuel);
      const wr = d.wr || 0.62, wb = d.wb || 1.5, tr = d.track || 1.08;
      pivots.forEach((p, i) => { p.position.set(i % 2 ? tr : -tr, wr, i < 2 ? wb : -wb); p.children[0].scale.setScalar(wr / 0.62); });
      // Jet vehicles get the big orange jet; anything else with nitro gets a small blue exhaust flame.
      if (this.jet) { flame.position.set(0, d.jetY || 1.35, -(d.len / 2 + 1.05)); flameS = 1; fOuter.material.color.setHex(0xff7a1a); fInner.material.color.setHex(0xffe066); }
      else { flame.position.set(0.55, 0.5, -(d.len / 2 + 0.25)); flameS = 0.45; fOuter.material.color.setHex(0x2a8cff); fInner.material.color.setHex(0xbfe8ff); }
      spikes.scale.set(1, 1, d.len / 4.9);
      spot.position.set(0, 1.3, d.len / 2);
      bodyMat.color.setHex(0xffffff);
      this.anchored = false; this.anchorT = 0;
    },
    reset(x, z, heading) {
      this.pos.set(x, 0, z); this.heading = heading; this.speed = 0; this.vel.set(0, 0, 0);
      this.airborne = false; this.anchored = false; this.anchorT = 0; this.dead = false;
      root.rotation.set(0, heading, 0);
    },
    velocity(out = tmpV) {
      return out.set(Math.sin(this.heading) * this.speed + this.vel.x, this.vel.y, Math.cos(this.heading) * this.speed + this.vel.z);
    },
    toggleAnchor() {
      if (this.airborne || this.dead) return 'no';
      if (!this.canAnchor) return 'none';
      if (!this.anchored && Math.abs(this.speed) > 4) return 'fast';
      this.anchored = !this.anchored;
      return this.anchored ? 'on' : 'off';
    },
    damage(amount, dirX = 0, dirZ = 0) {
      if (this.relaxed || this.dead || !(amount > 0)) return;
      amount /= this.armor;
      this.health = Math.max(0, this.health - amount);
      if (amount > 2 && (dirX || dirZ)) {
        const c = Math.cos(this.heading), s = Math.sin(this.heading);
        const lx = -(dirX * c - dirZ * s), lz = -(dirX * s + dirZ * c), l = Math.hypot(lx, lz) || 1;
        dents.push({ x: lx / l * 1.1, y: 1 + Math.random() * 0.5, z: lz / l * 2.4, nx: lx / l, nz: lz / l, depth: Math.min(0.28, amount * 0.012) });
        if (dents.length > 14) dents.shift();
      }
      deform((1 - this.health / this.maxHealth) * 0.07);
      this.onEvent?.('hit', amount);
      if (this.health <= 0) {
        this.dead = true; this.anchored = false;
        bodyMat.color.setHex(0x3a3a3a);
        this.onEvent?.('dead');
      }
    },
    hail(rate, dt) {
      if (this.hailproof || (this.shutters && this.anchorT > 0.6) || this.relaxed) return;
      this.windows = Math.min(1, this.windows + rate * dt * 0.035);
      if (this.windows >= 1) this.damage(rate * dt * 2);
    },
    repair(amount) {
      this.health = Math.min(this.maxHealth, this.health + amount);
      this.windows = Math.max(0, this.windows - amount / 40);
      if (this.health >= this.maxHealth) dents.length = 0;
      deform((1 - this.health / this.maxHealth) * 0.07);
    },
    fullRepair() { dents.length = 0; this.health = this.maxHealth; this.windows = 0; this.dead = false; bodyMat.color.setHex(0xffffff); deform(0); },

    update(dt, input, world, weather) {
      const w = weather.windAt(this.pos.x, this.pos.z, this.wind);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const before = this.speed;
      this.anchorT = clamp(this.anchorT + (this.anchored ? 1.6 : -2) * dt, 0, 1);
      const anchored = this.anchorT > 0.05;

      if (this.airborne) {
        this.airTime += dt;
        const k = 0.45 / this.mass;
        this.vel.x += (w.x - this.vel.x) * k * dt;
        this.vel.z += (w.z - this.vel.z) * k * dt;
        this.vel.y = Math.min(25, this.vel.y + (w.up * 0.55 / this.mass - 17) * dt);
        this.pos.addScaledVector(this.vel, dt);
        this.pos.y = Math.min(this.pos.y, 120);
        this.heading += this.spin.y * dt;
        this.tilt.x += this.spin.x * dt; this.tilt.y += this.spin.z * dt;
        const g = Math.max(world.heightAt(this.pos.x, this.pos.z), world.WATER - 0.9);
        if (this.pos.y <= g && this.vel.y < 0) {
          const impact = -this.vel.y, hor = Math.hypot(this.vel.x, this.vel.z);
          const dmg = Math.max(0, impact - 6) * 3 + Math.max(0, hor - 12) * 0.8;
          this.airborne = false;
          this.pos.y = g;
          this.speed = (this.vel.x * fx + this.vel.z * fz) * 0.3;
          this.vel.set(this.vel.x * 0.25, 0, this.vel.z * 0.25);
          this.tilt.set(0, 0);
          this.damage(dmg, 0, 0);
          this.onEvent?.('land', { dmg, air: this.airTime });
        }
      } else {
        const s = world.surfaceAt(this.pos.x, this.pos.z);
        this.surface = s;
        const grip = GRIP[s] + (1 - GRIP[s]) * Math.min(0.6, this.offroad);
        const fuel = this.fuel > 0 && !this.dead;
        const boost = input.boost && fuel && !anchored;
        const thr = anchored || !fuel ? 0 : boost ? 1 : input.throttle;
        this.boosting = boost;
        const top = boost ? this.top * grip * ((this.jet ? 1.55 : 1.2) + 0.08 * this.nitro) + 6 : this.top * grip * (this.health < this.maxHealth * 0.25 ? 0.7 : 1);
        const acc = boost ? (this.jet ? 30 : 22) + 4 * this.nitro : 15 * Math.min(1.3, 1.6 / this.mass + 0.3) * this.accMul;
        if (thr > 0.05) this.speed += (this.speed < -0.5 ? 30 : acc) * thr * dt;
        else if (thr < -0.05) this.speed += (this.speed > 0.5 ? 30 : 8) * thr * dt;
        else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (anchored ? 30 : 4) * dt);
        if (input.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 36 * dt);
        if (this.speed > top) this.speed += (top - this.speed) * Math.min(1, 1.5 * dt);
        if (this.speed < -10) this.speed = -10;
        if (fuel) this.fuel = Math.max(0, this.fuel - (0.03 + Math.abs(thr) * 0.09 + (boost ? 0.5 : 0)) * dt);

        const target = anchored || this.dead ? 0 : input.steer * 0.6 / (1 + Math.abs(this.speed) / 22);
        this.steer += (target - this.steer) * Math.min(1, 10 * dt);
        const yaw = -this.steer * this.speed / 2.9;
        this.heading += yaw * dt;
        this.yaw = yaw;

        // Wind pushes the car sideways; anchored cars barely move.
        const push = w.speed * 0.0022 / this.mass * (anchored ? 0.1 : 1);
        this.vel.x += w.x * push * dt; this.vel.z += w.z * push * dt;
        const fr = Math.exp(-(anchored ? 12 : 2.6) * dt);
        this.vel.x *= fr; this.vel.z *= fr; this.vel.y = 0;
        this.pos.x += fx * this.speed * dt + this.vel.x * dt;
        this.pos.z += fz * this.speed * dt + this.vel.z * dt;

        // Strong enough wind picks the car up.
        const flingV = (46 + 14 * (this.mass - 1)) * (anchored ? 1.8 : 1);
        if (w.speed > flingV) {
          const wasAnchored = anchored;
          this.airborne = true; this.anchored = false; this.airTime = 0;
          const extra = w.speed - flingV;
          this.vel.set(w.x * 0.4 + fx * this.speed, 7 + extra * 0.35 + w.up * 0.3, w.z * 0.4 + fz * this.speed);
          this.spin.set(rr(-3, 3), rr(-4, 4), rr(-3, 3));
          this.speed = 0;
          this.onEvent?.('fling', { wasAnchored });
        }

        const hit = world.collide(this.pos.x, this.pos.z, 1.9);
        if (hit) {
          this.pos.x += hit.nx * hit.pen; this.pos.z += hit.nz * hit.pen;
          const into = -(fx * hit.nx + fz * hit.nz) * this.speed;
          if (into > 8) this.damage((into - 8) * 2.2, -hit.nx, -hit.nz);
          if (into > 8) this.onEvent?.('crash', into);
          this.speed *= into > 3 ? -0.25 : 0.6;
        }
        const g = world.heightAt(this.pos.x, this.pos.z);
        this.pos.y = s === 'water' ? Math.max(g, world.WATER - 0.9) : g;

        // Tilt to follow the ground.
        const hf = world.heightAt(this.pos.x + fx * 2, this.pos.z + fz * 2), hb = world.heightAt(this.pos.x - fx * 2, this.pos.z - fz * 2);
        const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
        const hl = world.heightAt(this.pos.x + lx, this.pos.z + lz), hr = world.heightAt(this.pos.x - lx, this.pos.z - lz);
        const k = Math.min(1, 10 * dt);
        this.tilt.x += (-Math.atan((hf - hb) / 4) - this.tilt.x) * k;
        this.tilt.y += (Math.atan((hl - hr) / 2) - this.tilt.y) * k;
      }
      const lim = world.HALF - 10;
      this.pos.x = clamp(this.pos.x, -lim, lim);
      this.pos.z = clamp(this.pos.z, -lim, lim);
      root.rotation.set(this.tilt.x, this.heading, this.tilt.y);

      // Visuals
      for (const f of fronts) f.rotation.y = -this.steer;
      for (const s of spins) s.rotation.x += this.speed / 0.62 * dt;
      const k = Math.min(1, 8 * dt);
      if (!this.airborne) {
        const roll = clamp((this.yaw || 0) * this.speed * 0.004, -0.1, 0.1);
        const pitch = clamp(-(this.speed - before) / dt * 0.004, -0.06, 0.06);
        body.rotation.z += (roll - body.rotation.z) * k;
        body.rotation.x += (pitch - body.rotation.x) * k;
        const rough = this.surface === 'highway' || this.surface === 'road' ? 0 : 0.05;
        body.position.y = Math.sin(performance.now() * 0.03) * rough * Math.min(1, Math.abs(this.speed) / 15);
      }
      spinner.rotation.y += (3 + w.speed * 0.5) * dt;
      flame.visible = !!this.boosting && !this.airborne && (this.jet || this.nitro > 0);
      if (flame.visible) flame.scale.set(flameS, flameS * (0.8 + Math.random() * 0.5), flameS);
      if (bar.visible) { const ph = (performance.now() / 110 | 0) % 8; redM.color.setHex(ph === 0 || ph === 2 ? 0xff3030 : 0x4a0d0d); blueM.color.setHex(ph === 4 || ph === 6 ? 0x3a7cff : 0x0d1a4a); }
      spikes.position.y = 0.55 - this.anchorT * 0.85;
      shut.visible = this.shutters && this.anchorT > 0.01;
      shut.scale.y = Math.max(0.01, this.anchorT);
      crackMat.opacity = this.windows * 0.9;

      // Smoke when badly damaged.
      const hurt = 1 - this.health / this.maxHealth;
      if (hurt > 0.55) {
        smokeAcc += dt * (this.dead ? 20 : 4 + hurt * 8);
        while (smokeAcc > 1) {
          smokeAcc--;
          const p = puffs[smokeIdx++ % SMOKE];
          p.t = 0; p.p.set(this.pos.x + Math.sin(this.heading) * 1.8, this.pos.y + 1.6, this.pos.z + Math.cos(this.heading) * 1.8);
        }
      }
      for (let i = 0; i < SMOKE; i++) {
        const p = puffs[i];
        p.t += dt;
        const alive = p.t < 2.5;
        if (alive) { p.p.y += dt * 2.5; p.p.x += w.x * 0.08 * dt; p.p.z += w.z * 0.08 * dt; }
        dummy.position.copy(p.p);
        dummy.scale.setScalar(alive ? 0.5 + p.t * 0.9 : 0);
        dummy.updateMatrix();
        smoke.setMatrixAt(i, dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
    },
  };
  return car;
}
