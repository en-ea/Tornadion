import * as THREE from 'three';
import { Kit, flatMat, box, cyl, ico, textTexture, fbm, noise, hash, rng, rr, pick, lerp, smooth } from './util.js';

// World units are metres. +z is north, and seen from above +x is west (so east is -x).
export const HALF = 600, WATER = -0.8;
const CELL = 6, N = (HALF * 2) / CELL;

export const ROADS = [
  { v: true, c: 0, w: 14, type: 'highway' },
  { v: false, c: -240, w: 14, type: 'highway' },
  { v: true, c: -420, w: 7, type: 'road' }, { v: true, c: -210, w: 7, type: 'road' },
  { v: true, c: 210, w: 7, type: 'road' }, { v: true, c: 420, w: 7, type: 'road' },
  { v: false, c: -460, w: 7, type: 'road' }, { v: false, c: 30, w: 7, type: 'road' },
  { v: false, c: 250, w: 7, type: 'road' }, { v: false, c: 450, w: 7, type: 'road' },
];
export const TOWNS = [
  { name: 'Dustin', x: 0, z: 30, r: 100, gas: true, repair: true, dealer: true },
  { name: 'Millbrook', x: -420, z: 250, r: 80, gas: true },
  { name: 'Hailey', x: 210, z: -240, r: 85, gas: true, repair: true },
];
const XS = [-HALF, -420, -210, 0, 210, 420, HALF], ZS = [-HALF, -460, -240, 30, 250, 450, HALF];
const FIELD = ['corn', 'wheat', 'plowed', 'pasture', 'soy', 'pasture', 'corn', 'wheat', 'plowed'];

export const riverX = z => -300 + 70 * Math.sin(z * 0.006 + 1) + 25 * Math.sin(z * 0.02);
export const LAKE = { x: riverX(-360), z: -360, r: 75 };

const hills = (x, z) => 1.5 + fbm(x * 0.0035 + 20, z * 0.0035 + 40) * 7.5;
for (const t of TOWNS) t.h = hills(t.x, t.z);

function base(x, z) {
  let h = hills(x, z);
  for (const t of TOWNS) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.r + 60) h = lerp(t.h, h, smooth(t.r - 10, t.r + 60, d));
  }
  return lerp(2.5, h, smooth(0, 40, HALF - Math.max(Math.abs(x), Math.abs(z))));
}
export function waterDist(x, z) {
  const rd = Math.abs(x - riverX(z)) - 9;
  const dx = x - LAKE.x, dz = z - LAKE.z, a = Math.atan2(dz, dx);
  const ld = Math.hypot(dx, dz) - LAKE.r * (0.8 + 0.4 * noise(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6 + 7));
  return Math.min(rd, ld);
}
function natural(x, z) {
  const h = base(x, z), w = waterDist(x, z);
  return w < 16 ? lerp(-2.8, h, smooth(-5, 16, w)) : h;
}
export function heightAt(x, z) {
  let h = natural(x, z);
  for (const R of ROADS) {
    const d = Math.abs((R.v ? x : z) - R.c) - R.w / 2;
    if (d < 12) h = lerp(R.v ? base(R.c, z) : base(x, R.c), h, smooth(1.5, 12, d));
  }
  return h;
}
function roadDist(x, z) {
  let d = 1e9, R = null;
  for (const r of ROADS) { const k = Math.abs((r.v ? x : z) - r.c) - r.w / 2; if (k < d) { d = k; R = r; } }
  return { d, R };
}
function cellIndex(arr, v) { for (let i = 0; i < arr.length - 2; i++) if (v < arr[i + 1]) return i; return arr.length - 2; }
export function fieldAt(x, z) {
  const i = cellIndex(XS, x), j = cellIndex(ZS, z);
  let x0 = XS[i], x1 = XS[i + 1], z0 = ZS[j], z1 = ZS[j + 1], sub = 0, splitX = x1 - x0 > z1 - z0;
  if (splitX) { const m = (x0 + x1) / 2; if (x < m) x1 = m; else { x0 = m; sub = 1; } }
  else { const m = (z0 + z1) / 2; if (z < m) z1 = m; else { z0 = m; sub = 1; } }
  const type = FIELD[Math.floor(hash(i * 7 + sub * 31, j * 13 + 5) * FIELD.length)];
  return { type, x0, x1, z0, z1, sub, splitX };
}
const inTown = (x, z, pad = 0) => TOWNS.some(t => Math.hypot(x - t.x, z - t.z) < t.r + pad);
export function zoneAt(x, z) {
  const { d, R } = roadDist(x, z);
  if (d < 0) return R.type;
  if (inTown(x, z)) return 'town';
  if (d < 8) return 'verge';
  return fieldAt(x, z).type;
}
const SURF = { highway: 'highway', road: 'road', town: 'road', verge: 'grass', pasture: 'grass', wheat: 'field', plowed: 'field', soy: 'field', corn: 'corn' };
export function surfaceAt(x, z) {
  if (heightAt(x, z) < WATER - 0.3) return 'water';
  return SURF[zoneAt(x, z)] || 'grass';
}

const C = h => new THREE.Color(h);
const TC = {
  verge: C(0x7fb54c), pasture: C(0x8dc455), wheat: C(0xe2c15e), plowed: [C(0x8e5c38), C(0x76492a)],
  soy: [C(0x5d9b3b), C(0x71b047)], corn: C(0x6e6233), town: C(0x98c96a), highway: C(0x55575e), road: C(0xb8925f),
  sand: C(0xdccb91), bed: C(0x55756f),
};
function faceColor(x, z, h, out) {
  if (h < WATER + 0.5) return out.copy(h < WATER - 0.6 ? TC.bed : TC.sand);
  const c = TC[zoneAt(x, z)];
  out.copy(Array.isArray(c) ? c[Math.floor(x / 5 + 1000) & 1] : c);
  return out.multiplyScalar(0.92 + noise(x * 0.03, z * 0.03) * 0.16);
}

// ---------- reusable low-poly models ----------
function roundTree() {
  const k = new Kit();
  k.add(cyl(0.22, 0.32, 2.6, 5), 0x7a5230, 0, 1.3, 0);
  const c = ico(2.1); c.scale(1, 0.85, 1);
  k.add(c, 0x4d9a38, 0, 3.9, 0, 0, 0, 0, 0.1);
  k.add(ico(1.4), 0x5aa843, 0.8, 5, 0.3, 0, 0, 0, 0.1);
  k.add(ico(1.3), 0x489033, -0.9, 4.4, -0.4, 0, 0, 0, 0.1);
  return k.geometry();
}
function pineTree() {
  const k = new Kit();
  k.add(cyl(0.2, 0.28, 1.6, 5), 0x6e4a2c, 0, 0.8, 0);
  k.add(new THREE.ConeGeometry(2, 2.8, 7), 0x2f7446, 0, 2.8, 0, 0, 0, 0, 0.08);
  k.add(new THREE.ConeGeometry(1.55, 2.4, 7), 0x327a49, 0, 4.3, 0, 0, 0.4, 0, 0.08);
  k.add(new THREE.ConeGeometry(1.05, 2, 7), 0x357f4d, 0, 5.6, 0, 0, 0.8, 0, 0.08);
  return k.geometry();
}
function houseGeo() {
  const k = new Kit();
  k.add(box(8, 4, 6), 0xffffff, 0, 2, 0);
  const s = new THREE.Shape([new THREE.Vector2(-4.6, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(0, 2.6)]);
  const roof = new THREE.ExtrudeGeometry(s, { depth: 6.8, bevelEnabled: false });
  k.add(roof, 0x6b5048, 0, 4, -3.4);
  k.add(box(1.2, 2.1, 0.12), 0x6a4a35, 1.8, 1.05, 3.02);
  for (const x of [-1.8, 3.2]) k.add(box(1.3, 1.1, 0.12), 0x7ea6c9, x === 3.2 ? -3.2 : x, 2.3, 3.02);
  k.add(box(1.3, 1.1, 0.12), 0x7ea6c9, 0, 2.3, -3.02);
  k.add(box(0.7, 1.8, 0.7), 0x9a5a48, 2.4, 5.4, -1);
  k.add(box(3, 0.3, 1.4), 0xb9b0a3, 1.8, 0.15, 3.6);
  return k.geometry();
}
function barnGeo() {
  const k = new Kit();
  k.add(box(10, 6, 14), 0xb3342b, 0, 3, 0);
  const s = new THREE.Shape([new THREE.Vector2(-5.6, 0), new THREE.Vector2(5.6, 0), new THREE.Vector2(4.2, 2.6), new THREE.Vector2(0, 4.2), new THREE.Vector2(-4.2, 2.6)]);
  k.add(new THREE.ExtrudeGeometry(s, { depth: 14.6, bevelEnabled: false }), 0x5c5c62, 0, 6, -7.3);
  k.add(box(4.2, 4.6, 0.12), 0xf0f0f0, 0, 2.3, 7.02);
  k.add(box(3.6, 3.9, 0.14), 0xa82f27, 0, 2.3, 7.04);
  k.add(box(0.3, 5.3, 0.16), 0xf0f0f0, 0, 2.3, 7.08, 0, 0, 0.75);
  k.add(box(0.3, 5.3, 0.16), 0xf0f0f0, 0, 2.3, 7.08, 0, 0, -0.75);
  k.add(box(1.6, 1.4, 0.12), 0xf0f0f0, 0, 7.4, 7.35);
  return k.geometry();
}
function siloGeo() {
  const k = new Kit();
  k.add(cyl(2.2, 2.2, 13, 10), 0xc9cdd2, 0, 6.5, 0);
  k.add(new THREE.SphereGeometry(2.25, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x8f99a3, 0, 13, 0);
  for (const y of [3, 7, 11]) k.add(cyl(2.28, 2.28, 0.25, 10), 0x9aa2aa, 0, y, 0);
  return k.geometry();
}
function shopGeo() {
  const k = new Kit();
  k.add(box(12, 5, 9), 0xffffff, 0, 2.5, 0);
  k.add(box(12.6, 0.6, 9.6), 0x7a7a80, 0, 5.3, 0);
  k.add(box(8, 2.2, 0.12), 0x8fc0e0, -1, 1.9, 4.52);
  k.add(box(1.6, 2.6, 0.12), 0x4a3a30, 4, 1.3, 4.52);
  k.add(box(12, 0.25, 1.6), 0xd23c3c, 0, 3.5, 5.2);
  return k.geometry();
}
function rubbleGeo() {
  const k = new Kit();
  for (let i = 0; i < 9; i++) k.add(box(rr(1.5, 3.5), rr(0.3, 1), rr(1, 2.5)), pick([0x8a7a66, 0x6b5048, 0xcfc6b8, 0xa37e57]), rr(-3.5, 3.5), rr(0.2, 0.6), rr(-2.5, 2.5), rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3));
  return k.geometry();
}
function fenceGeo() {
  const k = new Kit();
  k.add(box(7, 0.14, 0.1), 0xa37e57, 0, 0.6, 0);
  k.add(box(7, 0.14, 0.1), 0xa37e57, 0, 1.05, 0);
  k.add(box(0.18, 1.3, 0.18), 0x7d5c3c, -3.5, 0.65, 0);
  return k.geometry();
}
function carGeo() {
  const k = new Kit();
  k.add(box(2, 0.75, 4.6), 0xffffff, 0, 0.82, 0);
  k.add(box(1.9, 0.35, 1.9), 0xffffff, 0, 1.36, 0.4);
  k.add(box(1.86, 0.45, 1.8), 0x28323f, 0, 1.76, 0.4);
  k.add(box(1.9, 0.12, 1.9), 0xffffff, 0, 2.04, 0.4);
  for (const z of [2.35, -2.35]) k.add(box(2.05, 0.22, 0.2), 0x9a9a9a, 0, 0.55, z);
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) k.add(cyl(0.45, 0.45, 0.35, 8), 0x1c1c1c, x, 0.45, z, 0, 0, Math.PI / 2);
  for (const x of [-0.65, 0.65]) k.add(box(0.4, 0.2, 0.06), 0xfff4c0, x, 0.95, 2.31);
  return k.geometry();
}
function cowGeo() {
  const k = new Kit();
  k.add(box(1, 1, 2), 0xf4f4f4, 0, 1.25, 0);
  k.add(box(1.04, 0.6, 0.6), 0x262626, 0, 1.4, 0.3);
  k.add(box(1.04, 0.5, 0.5), 0x262626, 0, 1.15, -0.6);
  k.add(box(0.6, 0.6, 0.7), 0xf4f4f4, 0, 1.6, 1.25);
  k.add(box(0.5, 0.3, 0.2), 0xf2a0a8, 0, 1.45, 1.62);
  for (const x of [-0.25, 0.25]) k.add(box(0.1, 0.25, 0.1), 0xe8e0c8, x, 2, 1.1);
  for (const [x, z] of [[-0.35, 0.7], [0.35, 0.7], [-0.35, -0.7], [0.35, -0.7]]) k.add(box(0.22, 0.8, 0.22), 0xf4f4f4, x, 0.4, z);
  return k.geometry();
}
function baleGeo() { const k = new Kit(); k.add(cyl(0.9, 0.9, 1.4, 8), 0xd9b44e, 0, 0.9, 0, 0, 0, Math.PI / 2); return k.geometry(); }
function poleGeo() {
  const k = new Kit();
  k.add(cyl(0.15, 0.2, 9, 5), 0x6e5234, 0, 4.5, 0);
  k.add(box(3, 0.16, 0.16), 0x5d4630, 0, 8.4, 0);
  for (const x of [-1.3, 0, 1.3]) k.add(box(0.12, 0.25, 0.12), 0xd0e0e8, x, 8.6, 0);
  return k.geometry();
}

export function buildWorld(scene) {
  const dummy = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), tmpC = new THREE.Color();

  // ---------- terrain ----------
  const Hs = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) Hs[j * (N + 1) + i] = heightAt(-HALF + i * CELL, -HALF + j * CELL);
  const CH = 5, per = N / CH, col = new THREE.Color();
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
    const pos = new Float32Array(per * per * 18), cols = new Float32Array(per * per * 18);
    let p = 0;
    for (let j = cj * per; j < (cj + 1) * per; j++) for (let i = ci * per; i < (ci + 1) * per; i++) {
      const x0 = -HALF + i * CELL, x1 = x0 + CELL, z0 = -HALF + j * CELL, z1 = z0 + CELL;
      const h00 = Hs[j * (N + 1) + i], h10 = Hs[j * (N + 1) + i + 1], h01 = Hs[(j + 1) * (N + 1) + i], h11 = Hs[(j + 1) * (N + 1) + i + 1];
      for (const t of [[x0, h00, z0, x0, h01, z1, x1, h10, z0], [x1, h10, z0, x0, h01, z1, x1, h11, z1]]) {
        faceColor((t[0] + t[3] + t[6]) / 3, (t[2] + t[5] + t[8]) / 3, (t[1] + t[4] + t[7]) / 3, col);
        const jit = 0.96 + rng() * 0.08;
        for (let k = 0; k < 9; k++) pos[p + k] = t[k];
        for (let k = 0; k < 3; k++) { cols[p + k * 3] = col.r * jit; cols[p + k * 3 + 1] = col.g * jit; cols[p + k * 3 + 2] = col.b * jit; }
        p += 9;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, flatMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Patchwork farmland out to the horizon beyond the playable square.
  {
    const S = 60, R = 3000, pos = [], cols = [];
    const patch = [C(0xe2c15e), C(0x8dc455), C(0x8e5c38), C(0x71b047), C(0x7fb54c), C(0xd3b457)];
    for (let z = -R; z < R; z += S) for (let x = -R; x < R; x += S) {
      if (x + S > -HALF && x < HALF && z + S > -HALF && z < HALF) continue;
      const c = patch[Math.floor(hash(Math.floor(x / 240), Math.floor(z / 240)) * patch.length)];
      pos.push(x, 2.5, z, x, 2.5, z + S, x + S, 2.5, z, x + S, 2.5, z, x, 2.5, z + S, x + S, 2.5, z + S);
      for (let k = 0; k < 6; k++) cols.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, flatMat));
  }

  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x3b8fd4, specular: 0x7fb6e6, shininess: 60 }));
  water.position.y = WATER;
  water.receiveShadow = true;
  scene.add(water);

  // ---------- roads ----------
  {
    const pos = [], cols = [];
    const rect = (x0, x1, z0, z1, y00, y01, y10, y11, c) => {
      pos.push(x0, y00, z0, x0, y01, z1, x1, y10, z0, x1, y10, z0, x0, y01, z1, x1, y11, z1);
      for (let k = 0; k < 6; k++) cols.push(c.r, c.g, c.b);
    };
    const yellow = C(0xf2c230), white = C(0xf2f2f2), rails = new Kit();
    for (const R of ROADS) {
      const hw = R.type === 'highway', off = hw ? 0.09 : 0.06, c = TC[R.type], w = R.w / 2;
      for (let s = -HALF, k = 0; s < HALF; s += CELL, k++) {
        const a = (R.v ? heightAt(R.c, s) : heightAt(s, R.c)) + off, b = (R.v ? heightAt(R.c, s + CELL) : heightAt(s + CELL, R.c)) + off;
        const cc = c.clone().multiplyScalar(0.96 + rng() * 0.06);
        if (R.v) rect(R.c - w, R.c + w, s, s + CELL, a, b, a, b, cc); else rect(s, s + CELL, R.c - w, R.c + w, a, a, b, b, cc);
        if (hw) {
          const l = [[-w + 0.5, -w + 0.75, white], [w - 0.75, w - 0.5, white]];
          if (k % 2 === 0) l.push([-0.15, 0.15, yellow]);
          for (const [u0, u1, lc] of l) {
            if (R.v) rect(R.c + u0, R.c + u1, s, s + CELL, a + 0.03, b + 0.03, a + 0.03, b + 0.03, lc);
            else rect(s, s + CELL, R.c + u0, R.c + u1, a + 0.03, a + 0.03, b + 0.03, b + 0.03, lc);
          }
        }
        // Bridge railings where the road crosses water.
        const cx = R.v ? R.c : s, cz = R.v ? s : R.c;
        if (natural(cx, cz) < WATER + 0.4) for (const side of [-1, 1]) {
          const rx = R.v ? R.c + side * (w + 0.3) : s + CELL / 2, rz = R.v ? s + CELL / 2 : R.c + side * (w + 0.3);
          rails.add(box(R.v ? 0.25 : CELL, 0.25, R.v ? CELL : 0.25), 0xc8c8c8, rx, a + 1, rz);
          rails.add(box(0.25, 1, 0.25), 0x9a9a9a, R.v ? rx : s, a + 0.5, R.v ? s : rz);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(g, roadMat);
    m.receiveShadow = true;
    scene.add(m);
    if (!rails.empty) scene.add(rails.mesh());
  }

  // ---------- colliders & breakables ----------
  const GRID = 20, cgrid = new Map();
  const key = (i, j) => i * 4096 + j;
  const cell = v => Math.floor((v + 4000) / GRID);
  function addCollider(o) {
    const k = key(cell(o.x), cell(o.z));
    if (!cgrid.has(k)) cgrid.set(k, []);
    cgrid.get(k).push(o);
  }
  function each(x, z, rad, fn) {
    const i0 = cell(x - rad), i1 = cell(x + rad), j0 = cell(z - rad), j1 = cell(z + rad);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = cgrid.get(key(i, j));
      if (list) for (const o of list) fn(o);
    }
  }
  function blocked(x, z, r) {
    let hit = false;
    each(x, z, r + 10, o => { if (!hit && Math.hypot(x - o.x, z - o.z) < r + o.r) hit = true; });
    return hit;
  }
  const breakables = [];
  function makeSet(geo, max, shadow = true) {
    const mesh = new THREE.InstancedMesh(geo, flatMat, max);
    mesh.count = 0; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    const set = {
      mesh, mats: [],
      add(x, y, z, ry = 0, s = 1, color = 0xffffff) {
        const i = mesh.count++;
        dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
        set.mats[i] = dummy.matrix.clone();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tmpC.set(color));
        return i;
      },
      show(i, on) { mesh.setMatrixAt(i, on ? set.mats[i] : ZERO); mesh.instanceMatrix.needsUpdate = true; },
    };
    return set;
  }
  function breakable(kind, set, x, z, opts) {
    const y = heightAt(x, z) + (opts.dy || 0);
    const b = { kind, set, x, z, y, alive: true, ry: opts.ry || 0, s: opts.s || 1, color: opts.color ?? 0xffffff, thr: opts.thr, r: opts.r || 0 };
    b.i = set.add(x, y, z, b.ry, b.s, b.color);
    breakables.push(b);
    addCollider({ x, z, r: b.r, b, solid: !!opts.solid });
    return b;
  }

  const geos = { tree: roundTree(), pine: pineTree(), fence: fenceGeo(), car: carGeo(), cow: cowGeo(), bale: baleGeo() };
  const sets = {
    tree: makeSet(geos.tree, 1500), pine: makeSet(geos.pine, 700), house: makeSet(houseGeo(), 260), barn: makeSet(barnGeo(), 40),
    silo: makeSet(siloGeo(), 40), shop: makeSet(shopGeo(), 60), rubble: makeSet(rubbleGeo(), 400, false), fence: makeSet(geos.fence, 2600),
    car: makeSet(geos.car, 120), cow: makeSet(geos.cow, 140), bale: makeSet(geos.bale, 160), pole: makeSet(poleGeo(), 80),
  };
  const HOUSE_COL = [0xfff4e0, 0xdfeaf7, 0xf7e3e3, 0xe8f5dc, 0xfff7c9, 0xe9e0f7, 0xf5e6d3];
  const CAR_COL = [0xd23c3c, 0xf2f2f2, 0x3b6fd8, 0x2f2f33, 0xe8b830, 0x4f8a4a, 0x9aa0a8];
  function building(sub, x, z, ry, color) {
    const spec = { house: [4.6, 52], shop: [6.5, 62], barn: [8, 50], silo: [2.4, 72] }[sub];
    const b = breakable('building', sets[sub], x, z, { ry, color, r: spec[0], thr: spec[1], solid: true });
    b.sub = sub;
    b.ri = sets.rubble.add(x, b.y, z, ry, 1, 0xffffff);
    sets.rubble.show(b.ri, false);
    return b;
  }
  const parkedCar = (x, z, ry) => breakable('car', sets.car, x, z, { ry, color: pick(CAR_COL), r: 2.2, thr: 44, solid: true });

  // ---------- towns ----------
  const town = new Kit(), lamps = new Kit(), places = [], signs = [];
  const sign = (text, x, y, z, ry, w = 5, bg = '#d9362b') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: textTexture(text, { bg }), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry;
    scene.add(m); signs.push(m);
  };
  const solid = (x, z, r) => addCollider({ x, z, r, solid: true });
  for (const t of TOWNS) {
    const y0 = t.h;
    const specials = [];
    if (t.gas) {
      const gx = t.x + 30, gz = t.z + 26;
      town.add(box(16, 0.7, 11), 0xf4f4f4, gx, y0 + 5.5, gz);
      town.add(box(16.3, 0.5, 11.3), 0xd9362b, gx, y0 + 5.05, gz);
      for (const [dx, dz] of [[-6, -3.8], [6, -3.8], [-6, 3.8], [6, 3.8]]) { town.add(cyl(0.3, 0.3, 5, 6), 0xdddddd, gx + dx, y0 + 2.5, gz + dz); solid(gx + dx, gz + dz, 0.4); }
      for (const dx of [-3.5, 3.5]) {
        town.add(box(1.2, 0.3, 6), 0xbfbfbf, gx + dx, y0 + 0.15, gz);
        for (const dz of [-1.4, 1.4]) town.add(box(0.8, 1.6, 0.6), 0xd9362b, gx + dx, y0 + 1, gz + dz);
        solid(gx + dx, gz - 1.4, 0.7); solid(gx + dx, gz + 1.4, 0.7);
      }
      town.add(box(10, 4.5, 8), 0xf1e6cf, gx, y0 + 2.25, gz + 14);
      town.add(box(10.5, 0.5, 8.5), 0x6b6b70, gx, y0 + 4.7, gz + 14);
      town.add(box(6, 2, 0.1), 0x8fc0e0, gx, y0 + 1.8, gz + 9.96);
      solid(gx, gz + 14, 5.5);
      town.add(cyl(0.15, 0.15, 7, 5), 0x888888, gx - 10, y0 + 3.5, gz - 7);
      sign('⛽ GAS', gx - 10, y0 + 7.5, gz - 7, Math.PI);
      specials.push([gx, gz + 5]);
      places.push({ type: 'gas', x: gx, z: gz, r: 8, town: t.name });
    }
    if (t.repair) {
      const rx = t.x - 32, rz = t.z + 28;
      town.add(box(14, 6, 11), 0x7d8fa6, rx, y0 + 3, rz + 8);
      town.add(box(14.6, 0.5, 11.6), 0x4b5563, rx, y0 + 6.25, rz + 8);
      town.add(box(6.4, 4.6, 0.12), 0x33383f, rx, y0 + 2.3, rz + 2.46);
      for (let i = 0; i < 6; i++) town.add(box(6.4, 0.06, 0.14), 0x4a515a, rx, y0 + 0.5 + i * 0.75, rz + 2.42);
      sign('🔧 REPAIR', rx, y0 + 5.2, rz + 2.35, Math.PI, 6, '#2f6fd8');
      solid(rx, rz + 8, 6.8);
      specials.push([rx, rz + 6]);
      places.push({ type: 'repair', x: rx, z: rz, r: 8, town: t.name });
    }
    if (t.dealer) {
      const dx = t.x + 32, dz = t.z - 30;
      town.add(box(16, 5, 10), 0xf5f5f5, dx, y0 + 2.5, dz - 8);
      town.add(box(16.6, 0.6, 10.6), 0x1700eb, dx, y0 + 5.3, dz - 8);
      town.add(box(14, 3.4, 0.12), 0x9ec9e8, dx, y0 + 1.9, dz - 2.96);
      sign('🚗 DEALER', dx, y0 + 6.8, dz - 2.9, 0, 6, '#1700eb');
      solid(dx, dz - 8, 7.5);
      for (const fx of [-9, 9]) { town.add(cyl(0.08, 0.08, 7, 4), 0xcccccc, dx + fx, y0 + 3.5, dz + 2); town.add(box(0.05, 1, 1.6), fx < 0 ? 0xf2c230 : 0x1700eb, dx + fx, y0 + 6.4, dz + 2.8); }
      specials.push([dx, dz - 5]);
      places.push({ type: 'dealer', x: dx, z: dz, r: 9, town: t.name });
    }
    if (t.name === 'Dustin') { // water tower
      const wx = t.x - 45, wz = t.z - 45;
      for (const [a, b] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) town.add(cyl(0.25, 0.25, 14, 5), 0x9aa3ab, wx + a, y0 + 7, wz + b);
      town.add(cyl(5, 5, 5, 12), 0xdfe6ec, wx, y0 + 16.5, wz);
      town.add(new THREE.ConeGeometry(5.3, 2.2, 12), 0xa8b3bd, wx, y0 + 20.1, wz);
      solid(wx, wz, 3.6);
      specials.push([wx, wz]);
    } else if (t.name === 'Millbrook') { // church
      const cx = t.x + 32, cz = t.z - 30;
      town.add(box(8, 6, 14), 0xf7f3ea, cx, y0 + 3, cz);
      const s = new THREE.Shape([new THREE.Vector2(-4.6, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(0, 3.4)]);
      town.add(new THREE.ExtrudeGeometry(s, { depth: 14.6, bevelEnabled: false }), 0x5a4a4a, cx, y0 + 6, cz - 7.3);
      town.add(box(3, 9, 3), 0xf7f3ea, cx, y0 + 4.5, cz + 7.5);
      town.add(new THREE.ConeGeometry(2.3, 6, 4), 0x5a4a4a, cx, y0 + 12, cz + 7.5, 0, Math.PI / 4);
      solid(cx, cz, 7.5);
      specials.push([cx, cz]);
    } else { // grain elevator
      const ex = t.x - 34, ez = t.z - 32;
      town.add(box(8, 24, 8), 0xd8d2c4, ex, y0 + 12, ez);
      town.add(box(4, 5, 6), 0xc9c2b2, ex, y0 + 26.5, ez);
      for (const dz of [-6.5, 6.5]) town.add(cyl(3, 3, 16, 10), 0xcfd3d6, ex - 6, y0 + 8, ez + dz);
      solid(ex, ez, 6); solid(ex - 6, ez - 6.5, 3); solid(ex - 6, ez + 6.5, 3);
      specials.push([ex, ez], [ex - 6, ez - 6.5], [ex - 6, ez + 6.5]);
    }
    // Houses and shops along the two crossing roads, two rows deep.
    const vW = ROADS.find(r => r.v && r.c === t.x).w, hW = ROADS.find(r => !r.v && r.c === t.z).w;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rw = ax ? hW : vW;
      for (let s = 30; s < t.r - 4; s += 17) for (const side of [-1, 1]) for (const row of [0, 1]) {
        const off = side * (rw / 2 + 11 + row * 19);
        const x = ax ? t.x + ax * s : t.x + off, z = ax ? t.z + off : t.z + az * s;
        if (Math.hypot(x - t.x, z - t.z) > t.r + 5 || specials.some(([a, b]) => Math.hypot(x - a, z - b) < 20) || blocked(x, z, 5)) continue;
        const ry = ax ? (side > 0 ? Math.PI : 0) : -side * Math.PI / 2;
        const shop = row === 0 && s < 50 && rng() < 0.6;
        building(shop ? 'shop' : 'house', x, z, ry, pick(HOUSE_COL));
        if (row === 0 && rng() < 0.45) {
          const pOff = side * (rw / 2 + 3.2), along = s + rr(-5, 5);
          const px = ax ? t.x + ax * along : t.x + pOff, pz = ax ? t.z + pOff : t.z + az * along;
          if (!blocked(px, pz, 2.5)) parkedCar(px, pz, ax ? Math.PI / 2 : 0);
        }
        if (row === 1 && rng() < 0.6) {
          const tx = x + rr(-6, 6), tz = z + rr(-6, 6);
          if (!blocked(tx, tz, 2)) breakable('tree', sets.tree, tx, tz, { ry: rng() * 6.3, s: rr(0.8, 1.2), r: 0.7, thr: 40, dy: -0.2, solid: true });
        }
      }
      // Street lamps
      for (let s = 16; s < t.r; s += 26) for (const side of [-1, 1]) {
        const off = side * (rw / 2 + 1.8);
        const x = ax ? t.x + ax * s : t.x + off, z = ax ? t.z + off : t.z + az * s;
        town.add(cyl(0.1, 0.13, 6, 5), 0x6f7478, x, y0 + 3, z);
        lamps.add(box(0.6, 0.2, 0.6), 0xffffff, x, y0 + 6.05, z);
      }
    }
  }
  scene.add(Object.assign(town.mesh(), { castShadow: true, receiveShadow: true }));
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x888877 });
  scene.add(lamps.mesh(lampMat));

  // ---------- farmland ----------
  const SUBS = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const x0 = XS[i], x1 = XS[i + 1], z0 = ZS[j], z1 = ZS[j + 1], cz = (z0 + z1) / 2, cx = (x0 + x1) / 2;
    if (x1 - x0 > z1 - z0) SUBS.push(fieldAt((x0 + cx) / 2, cz), fieldAt((cx + x1) / 2, cz));
    else SUBS.push(fieldAt(cx, (z0 + cz) / 2), fieldAt(cx, (cz + z1) / 2));
  }
  const nearTown = (x, z, pad) => inTown(x, z, pad);
  const clear = (x, z, pad) => Math.abs(x) < HALF - 8 && Math.abs(z) < HALF - 8 && roadDist(x, z).d > pad && waterDist(x, z) > pad && !nearTown(x, z, 12);

  // Farmsteads
  for (const f of SUBS) {
    const cxm = (f.x0 + f.x1) / 2, czm = (f.z0 + f.z1) / 2;
    if (f.type === 'corn' || nearTown(cxm, czm, 120) || hash(f.x0 | 0, f.z0 | 0) > 0.5) continue;
    const sx = XS.includes(f.x0) ? 1 : -1, sz = ZS.includes(f.z0) ? 1 : -1;
    const cx = (sx > 0 ? f.x0 : f.x1) + sx * 30, cz = (sz > 0 ? f.z0 : f.z1) + sz * 26;
    if (!clear(cx, cz, 10) || !clear(cx + sx * 34, cz + sz * 16, 12)) continue;
    const ry = sz > 0 ? Math.PI : 0;
    building('house', cx, cz, ry, pick(HOUSE_COL));
    building('barn', cx + sx * 22, cz + sz * 6, ry, 0xffffff);
    building('silo', cx + sx * 32, cz + sz * 16, 0, 0xffffff);
    parkedCar(cx + sx * 9, cz - sz * 2, Math.PI / 2);
    for (let k = 0; k < 6; k++) {
      const tx = cx - sx * rr(8, 14), tz = cz + sz * rr(-4, 28);
      if (!blocked(tx, tz, 2)) breakable('tree', sets[k % 3 ? 'tree' : 'pine'], tx, tz, { ry: rng() * 6.3, s: rr(0.9, 1.3), r: 0.7, thr: 40, dy: -0.2, solid: true });
    }
  }

  // Corn rows: tent-shaped ribbons so fields read as rows, not a flat colour.
  const cornMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const cLow = C(0x3f7424), cHigh = C(0x86b543), cTas = C(0xd9c35a);
  for (const f of SUBS) {
    if (f.type !== 'corn') continue;
    const pos = [], cols = [];
    const x0 = f.x0 + 10, x1 = f.x1 - 10, z0 = f.z0 + 10, z1 = f.z1 - 10;
    for (let x = x0; x < x1; x += 4) {
      for (let z = z0; z < z1 - 0.5; z += 3.5) {
        const za = z, zb = Math.min(z + 3.5, z1);
        if (nearTown(x, za, 8) || waterDist(x, za) < 4 || blocked(x, za, 1)) continue;
        const ya = heightAt(x, za), yb = heightAt(x, zb);
        const ha = ya + 2 + hash(x * 3, za * 7) * 0.7, hb = yb + 2 + hash(x * 3, zb * 7) * 0.7;
        const top = hash(x, za * 3) < 0.25 ? cTas : cHigh;
        for (const s of [-0.9, 0.9]) {
          pos.push(x + s, ya, za, x + s, yb, zb, x, ha, za, x, ha, za, x + s, yb, zb, x, hb, zb);
          for (const c of [cLow, cLow, top, top, cLow, top]) cols.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, cornMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Fences + cows around pastures, hay bales in wheat.
  for (const f of SUBS) {
    if (f.type === 'pasture') {
      const i0 = f.x0 + 9, i1 = f.x1 - 9, k0 = f.z0 + 9, k1 = f.z1 - 9;
      const sides = [];
      if (XS.includes(f.x0) || !f.splitX) sides.push([i0, k0, i0, k1]);
      if (XS.includes(f.x1) || !f.splitX) sides.push([i1, k0, i1, k1]);
      if (ZS.includes(f.z0) || f.splitX) sides.push([i0, k0, i1, k0]);
      if (ZS.includes(f.z1) || f.splitX) sides.push([i0, k1, i1, k1]);
      for (const [ax, az, bx, bz] of sides) {
        const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 7);
        for (let s = 0; s < n; s++) {
          const u = (s + 0.5) / n, x = lerp(ax, bx, u), z = lerp(az, bz, u);
          if (!clear(x, z, 2) || blocked(x, z, 3)) continue;
          breakable('fence', sets.fence, x, z, { ry: ax === bx ? Math.PI / 2 : 0, thr: 30, r: 0 });
        }
      }
      for (let k = 0; k < 5; k++) {
        const x = rr(i0 + 12, i1 - 12), z = rr(k0 + 12, k1 - 12);
        if (clear(x, z, 4) && !blocked(x, z, 3)) breakable('cow', sets.cow, x, z, { ry: rng() * 6.3, color: pick([0xffffff, 0xffffff, 0xa06a44, 0x55504a]), thr: 38, r: 0 });
      }
    } else if (f.type === 'wheat') {
      for (let k = 0; k < 6; k++) {
        const x = rr(f.x0 + 20, f.x1 - 20), z = rr(f.z0 + 20, f.z1 - 20);
        if (clear(x, z, 4) && !blocked(x, z, 3)) breakable('bale', sets.bale, x, z, { ry: rng() * 6.3, thr: 34, r: 1.1, solid: true });
      }
    }
  }

  // Trees: river banks, lake shore, windbreak rows, scattered.
  const tree = (x, z, kind) => {
    if (!clear(x, z, 3) || blocked(x, z, 1.8)) return;
    const f = fieldAt(x, z);
    if (f.type === 'corn' && x > f.x0 + 8 && x < f.x1 - 8 && z > f.z0 + 8 && z < f.z1 - 8) return;
    const s = rr(0.8, 1.35), set = sets[kind ?? (rng() < 0.3 ? 'pine' : 'tree')];
    const g = rr(0.85, 1.12);
    breakable('tree', set, x, z, { ry: rng() * 6.3, s, color: new THREE.Color(g, g, g), r: 0.7, thr: 34 + s * 6, dy: -0.2, solid: true });
  };
  for (let z = -HALF + 10; z < HALF - 10; z += 7) for (const side of [-1, 1]) if (rng() < 0.75) tree(riverX(z) + side * rr(11, 24), z + rr(-3, 3));
  for (let a = 0; a < Math.PI * 2; a += 0.09) { const r = LAKE.r * rr(1.1, 1.45); tree(LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r); }
  for (const f of SUBS) {
    if (hash((f.x0 | 0) + 3, (f.z1 | 0) + 7) > 0.35) continue;
    const along = hash(f.x1 | 0, f.z0 | 0) < 0.5, kind = rng() < 0.5 ? 'pine' : 'tree';
    if (along) { const z = f.z1 - 6; for (let x = f.x0 + 12; x < f.x1 - 12; x += 8) tree(x + rr(-1, 1), z, kind); }
    else { const x = f.x1 - 6; for (let z = f.z0 + 12; z < f.z1 - 12; z += 8) tree(x, z + rr(-1, 1), kind); }
  }
  for (let k = 0; k < 260; k++) tree(rr(-HALF, HALF), rr(-HALF, HALF));

  // ---------- power lines along both highways ----------
  const poles = [], lines = [];
  {
    const a = [], b = [];
    for (let z = -HALF + 10; z <= HALF - 10; z += 40) a.push([12, z]);
    for (let x = -HALF + 10; x <= HALF - 10; x += 40) if (Math.abs(x) > 24) b.push([x, -228]);
    for (const [list, ry] of [[a, 0], [b, Math.PI / 2]]) {
      const line = list.filter(([x, z]) => waterDist(x, z) > 3).map(([x, z]) => {
        const p = breakable('pole', sets.pole, x, z, { ry, thr: 42, r: 0.4, solid: true });
        p.fall = 0; p.fallDir = new THREE.Vector3(); poles.push(p);
        return p;
      });
      lines.push(line);
    }
  }
  const spans = [];
  for (const line of lines) for (let i = 0; i < line.length - 1; i++) spans.push([line[i], line[i + 1]]);
  const SEG = 6, wirePos = new Float32Array(spans.length * 3 * SEG * 6);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1e1e22 }));
  wires.frustumCulled = false;
  scene.add(wires);
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _m = new THREE.Matrix4();
  function attach(p, arm, out) { return out.set(arm, 8.55, 0).applyMatrix4(p.set.mats[p.i]); }
  function rebuildWires() {
    let o = 0;
    for (const [p, q] of spans) for (const arm of [-1.3, 0, 1.3]) {
      attach(p, arm, _pa); attach(q, arm, _pb);
      const down = p.fall > 0.5 || q.fall > 0.5, sag = down ? 0 : 1.3;
      for (let s = 0; s < SEG; s++) for (const u of [s / SEG, (s + 1) / SEG]) {
        let x = lerp(_pa.x, _pb.x, u), y = lerp(_pa.y, _pb.y, u) - sag * 4 * u * (1 - u), z = lerp(_pa.z, _pb.z, u);
        if (down) y = Math.max(heightAt(x, z) + 0.15, y - 6 * Math.sin(Math.PI * u));
        wirePos[o++] = x; wirePos[o++] = y; wirePos[o++] = z;
      }
    }
    wireGeo.attributes.position.needsUpdate = true;
    wireGeo.computeBoundingSphere();
  }
  rebuildWires();
  const _q = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _axis = new THREE.Vector3(), _v = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
  function poleMatrix(p) {
    _qb.setFromAxisAngle(_axis.set(0, 1, 0), p.ry);
    _axis.set(p.fallDir.z, 0, -p.fallDir.x).normalize();
    _q.setFromAxisAngle(_axis, p.fall * Math.PI * 0.47).multiply(_qb);
    p.set.mats[p.i].compose(_v.set(p.x, p.y, p.z), _q, _s1);
    p.set.mesh.setMatrixAt(p.i, p.set.mats[p.i]);
    p.set.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- mesonet stations ----------
  const mesonets = [];
  {
    const k = new Kit();
    let n = 0;
    for (const x of XS.slice(1, -1)) for (const z of ZS.slice(1, -1)) {
      if (nearTown(x, z, 90) || hash(x + 999, z) > 0.45) continue;
      const mx = x + 11, mz = z + 11, y = heightAt(mx, mz);
      if (waterDist(mx, mz) < 5) continue;
      for (let i = 0; i < 3; i++) { const a = i * 2.09; k.add(cyl(0.05, 0.05, 3.2, 4), 0xbfc5ca, mx + Math.cos(a) * 0.5, y + 1.5, mz + Math.sin(a) * 0.5, Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); }
      k.add(cyl(0.06, 0.06, 5, 5), 0xd5dade, mx, y + 3, mz);
      k.add(box(1.4, 0.06, 0.06), 0xd5dade, mx, y + 5.2, mz);
      for (let i = 0; i < 3; i++) { const a = i * 2.09; k.add(new THREE.ConeGeometry(0.12, 0.2, 5), 0x333333, mx + 0.7 + Math.cos(a) * 0.25, y + 5.35, mz + Math.sin(a) * 0.25, 0, 0, Math.PI / 2); }
      k.add(box(0.05, 0.3, 0.5), 0xd9362b, mx - 0.7, y + 5.35, mz);
      k.add(box(0.8, 0.05, 0.6), 0x22324a, mx, y + 2.6, mz - 0.5, 0.6);
      k.add(box(0.5, 0.6, 0.3), 0xf4f4f4, mx, y + 1.6, mz + 0.3);
      solid(mx, mz, 1.2);
      mesonets.push({ id: 'MS-' + String(++n).padStart(2, '0'), x: mx, z: mz });
    }
    scene.add(Object.assign(k.mesh(), { castShadow: true }));
  }

  for (const s of Object.values(sets)) { s.mesh.instanceMatrix.needsUpdate = true; if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true; }

  // ---------- runtime ----------
  const dead = [];
  const REBUILD = 240;
  return {
    HALF, WATER, heightAt, surfaceAt, zoneAt, fieldAt, waterDist, TOWNS, ROADS, LAKE, riverX, XS, ZS,
    breakables, places, mesonets, poles, geos, lampMat, signs,
    collide(x, z, r) {
      let best = null;
      each(x, z, r + 10, o => {
        if (!o.solid || (o.b && !o.b.alive)) return;
        const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), pen = r + o.r - d;
        if (pen > 0 && (!best || pen > best.pen)) best = { o, pen, nx: d > 0 ? dx / d : 1, nz: d > 0 ? dz / d : 0 };
      });
      return best;
    },
    near(x, z, rad, fn) { each(x, z, rad, o => { if (o.b && o.b.alive && Math.abs(o.x - x) < rad && Math.abs(o.z - z) < rad) fn(o.b); }); },
    kill(b, dx = 1, dz = 0, now = 0) {
      if (!b.alive) return;
      b.alive = false;
      b.rebuildAt = now + REBUILD + rr(0, 60);
      dead.push(b);
      if (b.kind === 'pole') { b.fallDir.set(dx, 0, dz).normalize(); b.falling = true; return; }
      b.set.show(b.i, false);
      if (b.kind === 'building') sets.rubble.show(b.ri, true);
    },
    update(dt, now, carPos) {
      let wiresDirty = false;
      for (const p of poles) if (p.falling) {
        p.fall = Math.min(1, p.fall + dt * (0.4 + p.fall * 2));
        if (p.fall >= 1) p.falling = false;
        poleMatrix(p); wiresDirty = true;
      }
      for (let i = dead.length - 1; i >= 0; i--) {
        const b = dead[i];
        if (now < b.rebuildAt || Math.hypot(b.x - carPos.x, b.z - carPos.z) < 40) continue;
        b.alive = true; dead.splice(i, 1);
        if (b.kind === 'pole') { b.fall = 0; b.falling = false; poleMatrix(b); wiresDirty = true; continue; }
        b.set.show(b.i, true);
        if (b.kind === 'building') sets.rubble.show(b.ri, false);
      }
      if (wiresDirty) rebuildWires();
    },
    // Distance (2D) from a point to the nearest downed power line.
    wireHazard(x, z) {
      let best = Infinity;
      for (const [p, q] of spans) {
        if (p.fall < 0.8 && q.fall < 0.8) continue;
        const ax = p.x, az = p.z, bx = q.x, bz = q.z, vx = bx - ax, vz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        best = Math.min(best, Math.hypot(x - ax - vx * u, z - az - vz * u));
      }
      return best;
    },
    mapColor(x, z) {
      const h = heightAt(x, z);
      if (h < WATER) return [70, 150, 215];
      if (inTown(x, z)) return [150, 160, 140];
      const c = TC[zoneAt(x, z)], cc = Array.isArray(c) ? c[0] : c, hex = cc.getHex();
      return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    },
  };
}
