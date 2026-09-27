import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Seeded RNG so the map is the same every visit.
let seed = 20260927;
export function rng() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + rng() * (b - a);
export const pick = arr => arr[Math.floor(rng() * arr.length)];

export function hash(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.1 + 5, z * 2.1 + 9) * 0.28 + noise(x * 4.3 + 11, z * 4.3 + 3) * 0.12;

// Low-poly look: every model is non-indexed geometry with a per-face vertex colour,
// merged into as few meshes as possible and drawn with one flat-shaded material.
export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _c = new THREE.Color();

export function paint(geo, color, jitter = 0.05) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (rng() - 0.5) * jitter * 2;
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = _c.r * j; col[(i + k) * 3 + 1] = _c.g * j; col[(i + k) * 3 + 2] = _c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Kit {
  constructor() { this.parts = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, jitter = 0.05) {
    const g = paint(geo, color, jitter);
    if (rz) g.rotateZ(rz);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.parts.push(g);
    return g;
  }
  addMatrix(geo, color, m, jitter = 0.05) { const g = paint(geo, color, jitter); g.applyMatrix4(m); this.parts.push(g); return g; }
  get empty() { return this.parts.length === 0; }
  geometry() { const g = mergeGeometries(this.parts); this.parts = []; return g; }
  mesh(mat = flatMat) { const m = new THREE.Mesh(this.geometry(), mat); return m; }
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
export const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

// Canvas texture with centred text, used for shop signs and decals.
export function textTexture(text, { w = 256, h = 64, bg = '#1700eb', fg = '#fff', font = 40 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${font}px "Lilita One", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
