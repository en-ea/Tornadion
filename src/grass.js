import * as THREE from 'three';
import { hash } from './util.js';

// Swaying grass tufts and wildflowers, scattered on grassy ground around the player and re-laid as they move.
const GRASSY = new Set(['verge', 'pasture', 'town', 'wheat', 'soy']);
const CELL = 6;

function tuftGeo() {
  const pos = [], col = [], base = new THREE.Color(0x2f5a1e), tip = new THREE.Color(0x9cc65a);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.18 * (i % 3), cx = Math.cos(a) * r, cz = Math.sin(a) * r, h = 0.45 + ((i * 37) % 10) / 22, w = 0.06;
    const lean = 0.18, lx = Math.cos(a + 1) * lean, lz = Math.sin(a + 1) * lean, px = Math.cos(a + 1.57) * w, pz = Math.sin(a + 1.57) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + lx, h, cz + lz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function flowerGeo() {
  const pos = [], col = [], stem = new THREE.Color(0x3d6b25), white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1, x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.15, h = 0.45 + i * 0.08;
    pos.push(x - 0.02, 0, z, x + 0.02, 0, z, x, h, z);
    col.push(stem.r, stem.g, stem.b, stem.r, stem.g, stem.b, stem.r, stem.g, stem.b);
    for (let p = 0; p < 4; p++) { // little 4-petal head (white so the instance colour tints it)
      const b = p * Math.PI / 2;
      pos.push(x, h, z, x + Math.cos(b) * 0.09, h + 0.03, z + Math.sin(b) * 0.09, x + Math.cos(b + 0.8) * 0.09, h + 0.03, z + Math.sin(b + 0.8) * 0.09);
      col.push(white.r, white.g, white.b, white.r, white.g, white.b, white.r, white.g, white.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function createGrass(scene, world) {
  const uni = { uTime: { value: 0 }, uWind: { value: 1 } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'uniform float uTime, uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 2.2 + wp.x * 0.35 + wp.z * 0.25) * 0.5 + sin(uTime * 3.7 + wp.x * 0.9) * 0.2;
      transformed.x += sway * position.y * 0.25 * uWind;
      transformed.z += sway * position.y * 0.12 * uWind;`);
  };
  const MAX = 3800, FMAX = 600;
  let RADIUS = 60;
  const tufts = new THREE.InstancedMesh(tuftGeo(), mat, MAX), flowers = new THREE.InstancedMesh(flowerGeo(), mat, FMAX);
  for (const m of [tufts, flowers]) { m.frustumCulled = false; m.receiveShadow = true; m.count = 0; scene.add(m); }
  const d = new THREE.Object3D(), c = new THREE.Color(), FLOWER = [0xffffff, 0xffd94a, 0xc77dff, 0xff7aa8, 0xffffff];
  let cx = 1e9, cz = 1e9;

  // Each ground cell's tufts are worked out once and cached; moving just re-copies cached matrices.
  const cache = new Map();
  function cellItems(i, j) {
    const key = i * 100003 + j;
    let items = cache.get(key);
    if (items) return items;
    items = [];
    for (let k = 0; k < 7; k++) {
      const x = (i + hash(i * 7 + k, j * 3)) * CELL, z = (j + hash(i * 5, j * 11 + k)) * CELL;
      const zone = world.zoneAt(x, z);
      if (!GRASSY.has(zone) || ((zone === 'wheat' || zone === 'soy') && k > 1)) continue;
      const y = world.heightAt(x, z);
      if (y < world.WATER + 0.2) continue;
      const r = hash(i * 13 + k, j * 17 + k);
      d.position.set(x, y - 0.05, z); d.rotation.set(0, r * 6.28, 0); d.scale.set(0.8 + r * 0.6, 0.55 + r * 0.55, 0.8 + r * 0.6); d.updateMatrix();
      const fl = zone === 'pasture' && r > 0.9, g = 0.75 + hash(i + k * 3, j - k) * 0.4;
      const col = fl ? new THREE.Color(FLOWER[Math.floor(r * 50) % FLOWER.length]) : zone === 'wheat' ? new THREE.Color(1.25 * g, 1.1 * g, 0.55 * g) : new THREE.Color(g, g, g * 0.9);
      items.push({ m: d.matrix.clone(), c: col, fl });
    }
    if (cache.size > 8000) cache.clear();
    cache.set(key, items);
    return items;
  }
  function rebuild(px, pz) {
    cx = px; cz = pz;
    let n = 0, f = 0;
    const i0 = Math.floor((px - RADIUS) / CELL), i1 = Math.floor((px + RADIUS) / CELL), j0 = Math.floor((pz - RADIUS) / CELL), j1 = Math.floor((pz + RADIUS) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (Math.hypot((i + 0.5) * CELL - px, (j + 0.5) * CELL - pz) > RADIUS) continue;
      for (const it of cellItems(i, j)) {
        if (it.fl) { if (f < FMAX) { flowers.setMatrixAt(f, it.m); flowers.setColorAt(f++, it.c); } }
        else if (n < MAX) { tufts.setMatrixAt(n, it.m); tufts.setColorAt(n++, it.c); }
      }
    }
    tufts.count = n; flowers.count = f;
    for (const m of [tufts, flowers]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  return {
    update(dt, pos, windSpeed = 5) {
      uni.uTime.value += dt;
      uni.uWind.value += (Math.min(4, 0.6 + windSpeed / 12) - uni.uWind.value) * Math.min(1, dt);
      if (RADIUS > 0 && Math.hypot(pos.x - cx, pos.z - cz) > 12) rebuild(pos.x, pos.z);
    },
    set radius(r) { RADIUS = r; tufts.visible = flowers.visible = r > 0; cx = 1e9; },
  };
}
