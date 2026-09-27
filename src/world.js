import * as THREE from 'three';

// Map: 1200 x 1200 m. Road grid every 200 m; x=0 and z=0 are paved highways, the rest dirt.
// Town sits around the highway crossing. Most repeated things are InstancedMesh (1 draw call each).
export const HALF = 600;
const LINES = [-400, -200, 0, 200, 400];
const EDGES = [-600, -400, -200, 0, 200, 400, 600];
const HWY = 7, DIRT = 4;
const LAKES = [{ x: -300, z: 300, r: 70 }, { x: 300, z: -500, r: 55 }];
const RIVER_X = -500, RIVER_HALF = 9;
export const PLACES = {
  gas: { x: -30, z: 50 },
  repair: { x: 46, z: -30 },
  dealer: { x: -50, z: -32 },
};

function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const tmp = new THREE.Object3D(), col = new THREE.Color();
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const cellOf = v => Math.max(0, Math.min(5, Math.floor((v + HALF) / 200)));

function instanced(geo, mat, items, set) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    tmp.position.set(0, 0, 0); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
    const c = set(it, tmp);
    tmp.updateMatrix();
    m.setMatrixAt(i, tmp.matrix);
    if (c !== undefined) m.setColorAt(i, col.set(c));
  });
  m.computeBoundingSphere();
  return m;
}

function sign(text, bg, fg = '#fff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.fillStyle = fg; g.font = 'bold 58px Arial Black, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t });
  const grp = new THREE.Group();
  for (const a of [0, Math.PI]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.25), mat);
    p.rotation.y = a; p.position.z = a ? -0.06 : 0.06;
    grp.add(p);
  }
  return grp;
}

export function buildWorld(scene) {
  const r = rng(1234);
  const group = new THREE.Group();
  scene.add(group);
  const boxes = [], circles = [];

  // ---- Cell layout ----
  const grid = [];
  for (let i = 0; i < 6; i++) {
    grid[i] = [];
    for (let j = 0; j < 6; j++) {
      let t;
      if ((i === 2 || i === 3) && (j === 2 || j === 3)) t = 'town';
      else if (i === 0 || (i === 1 && j === 4) || (i === 4 && j === 0)) t = 'pasture';
      else { const v = r(); t = v < 0.55 ? 'corn' : v < 0.8 ? 'wheat' : 'pasture'; }
      grid[i][j] = t;
    }
  }
  const CORN_M = 7;
  function surfaceAt(x, z) {
    if (Math.abs(x) < HWY || Math.abs(z) < HWY) return 'highway';
    for (const l of LINES) if (l && (Math.abs(x - l) < DIRT || Math.abs(z - l) < DIRT)) return 'road';
    if (Math.abs(x - RIVER_X) < RIVER_HALF) return 'water';
    for (const L of LAKES) if ((x - L.x) ** 2 + (z - L.z) ** 2 < L.r * L.r) return 'water';
    const i = cellOf(x), j = cellOf(z), t = grid[i][j];
    if (t === 'corn' && x > EDGES[i] + CORN_M && x < EDGES[i + 1] - CORN_M && z > EDGES[j] + CORN_M && z < EDGES[j + 1] - CORN_M) return 'corn';
    return t === 'wheat' ? 'field' : 'grass';
  }

  // ---- Ground ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), lam(0x79b85a));
  group.add(ground);
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const cells = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) cells.push({ i, j, t: grid[i][j] });
  const PATCH = { corn: 0x7a5a36, wheat: 0xe2c35a, pasture: 0x86c45e, town: 0x93cc6c };
  group.add(instanced(flat, lam(0xffffff), cells, (c, o) => {
    o.position.set(EDGES[c.i] + 100, 0.03, EDGES[c.j] + 100); o.scale.set(198, 1, 198);
    return PATCH[c.t];
  }));

  // Corn rows
  const rows = [];
  for (const c of cells) {
    if (c.t !== 'corn') continue;
    const alongX = r() < 0.5, len = 200 - CORN_M * 2;
    for (let o = CORN_M + 1.5; o < 200 - CORN_M; o += 3.2) {
      rows.push(alongX
        ? { x: EDGES[c.i] + 100, z: EDGES[c.j] + o, sx: len, sz: 1.4, h: 2.1 + r() * 0.5 }
        : { x: EDGES[c.i] + o, z: EDGES[c.j] + 100, sx: 1.4, sz: len, h: 2.1 + r() * 0.5 });
    }
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  group.add(instanced(unitBox, lam(0xffffff), rows, (w, o) => {
    o.position.set(w.x, 0, w.z); o.scale.set(w.sx, w.h, w.sz);
    return pick(r, [0x4f9a2e, 0x5aa834, 0x478f2a, 0x66b33a]);
  }));

  // ---- Water ----
  const water = lam(0x3d9be0);
  const river = new THREE.Mesh(flat, water);
  river.position.set(RIVER_X, 0.05, 0); river.scale.set(RIVER_HALF * 2, 1, 1200);
  group.add(river);
  for (const L of LAKES) {
    const sand = new THREE.Mesh(new THREE.CircleGeometry(L.r + 5, 28).rotateX(-Math.PI / 2), lam(0xe9d8a6));
    sand.position.set(L.x, 0.04, L.z);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(L.r, 28).rotateX(-Math.PI / 2), water);
    lake.position.set(L.x, 0.05, L.z);
    group.add(sand, lake);
  }

  // ---- Roads ----
  const dirt = [];
  for (const l of LINES) if (l) dirt.push({ x: l, z: 0, sx: DIRT * 2, sz: 1200 }, { x: 0, z: l, sx: 1200, sz: DIRT * 2 });
  group.add(instanced(flat, lam(0xb08a5a), dirt, (d, o) => { o.position.set(d.x, 0.06, d.z); o.scale.set(d.sx, 1, d.sz); }));
  const hw = [{ x: 0, z: 0, sx: HWY * 2, sz: 1200 }, { x: 0, z: 0, sx: 1200, sz: HWY * 2 }];
  group.add(instanced(flat, lam(0x4a4d57), hw, (d, o) => { o.position.set(d.x, 0.09, d.z); o.scale.set(d.sx, 1, d.sz); }));
  const dashes = [];
  for (let v = -594; v < 600; v += 14) if (Math.abs(v) > 10) dashes.push({ x: 0, z: v, sx: 0.35, sz: 5 }, { x: v, z: 0, sx: 5, sz: 0.35 });
  group.add(instanced(flat, new THREE.MeshBasicMaterial({ color: 0xffd23f }), dashes,
    (d, o) => { o.position.set(d.x, 0.12, d.z); o.scale.set(d.sx, 1, d.sz); }));

  // ---- Buildings (houses, farmhouses, barns share one instanced box + one roof) ----
  const buildings = [];
  const addBuilding = (x, z, w, d, h, c, rc) => {
    buildings.push({ x, z, w, d, h, c, rc });
    boxes.push({ x, z, hw: w / 2 + 0.2, hd: d / 2 + 0.2 });
  };
  const HOUSE = [0xf4d35e, 0xee964b, 0xf95738, 0x9bc1bc, 0xf4f1de, 0x83c5be, 0xe29578, 0xffddd2, 0xa0c4ff];
  const ROOF = [0x8d3b2f, 0x3d405b, 0x5c4033, 0x2f4858];
  const specials = Object.values(PLACES);
  for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (const s of [-1, 1]) {
      for (let d = 26; d < 180; d += 20) {
        if (r() < 0.15) continue;
        const x = ax * d + (az ? s * 18 : 0), z = az * d + (ax ? s * 18 : 0);
        if (specials.some(p => Math.hypot(p.x - x, p.z - z) < 24)) continue;
        addBuilding(x, z, 7 + r() * 3, 7 + r() * 3, 3.5 + r() * 2.5, pick(r, HOUSE), pick(r, ROOF));
      }
    }
  }
  // Farmsteads
  const silos = [];
  for (const c of cells) {
    if (c.t === 'corn' || c.t === 'town' || (c.i === 1 && c.j === 4) || (c.i === 4 && c.j === 0) || r() < 0.35) continue;
    const x = EDGES[c.i] + 30, z = EDGES[c.j] + 30;
    addBuilding(x, z, 8, 8, 5, pick(r, [0xf4f1de, 0xffe8a3, 0xdde5b6]), pick(r, ROOF));
    addBuilding(x + 22, z + 10, 12, 16, 8, 0xb23a2e, 0x5b2b25);
    silos.push({ x: x + 36, z: z + 2 });
    circles.push({ x: x + 36, z: z + 2, r: 3.2 });
  }
  group.add(instanced(unitBox, lam(0xffffff), buildings, (b, o) => {
    o.position.set(b.x, 0, b.z); o.scale.set(b.w, b.h, b.d); return b.c;
  }));
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  group.add(instanced(roofGeo, lam(0xffffff), buildings, (b, o) => {
    o.position.set(b.x, b.h, b.z); o.scale.set(b.w * 1.05, b.h * 0.55, b.d * 1.05); return b.rc;
  }));
  const siloGeo = new THREE.CylinderGeometry(3, 3, 14, 10).translate(0, 7, 0);
  group.add(instanced(siloGeo, lam(0xcfd6dc), silos, (s, o) => { o.position.set(s.x, 0, s.z); }));
  const domeGeo = new THREE.SphereGeometry(3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 14, 0);
  group.add(instanced(domeGeo, lam(0x8a969e), silos, (s, o) => { o.position.set(s.x, 0, s.z); }));

  // ---- Special buildings ----
  const solid = (w, h, d, c, x, y, z, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
    m.position.set(x, y, z); group.add(m);
    if (collide) boxes.push({ x, z, hw: w / 2 + 0.2, hd: d / 2 + 0.2 });
    return m;
  };
  const place = (text, bg, x, z, rotY) => {
    const pole = solid(0.4, 7, 0.4, 0x555a66, x, 3.5, z);
    const sg = sign(text, bg); sg.position.set(x, 7.6, z); sg.rotation.y = rotY; group.add(sg);
    circles.push({ x, z, r: 0.6 }); boxes.pop();
    return pole;
  };
  { // Gas station
    const { x, z } = PLACES.gas;
    for (const dx of [-5, 5]) for (const dz of [-6, 6]) { solid(0.5, 5, 0.5, 0xdddddd, x + 4 + dx, 2.5, z + dz, false); circles.push({ x: x + 4 + dx, z: z + dz, r: 0.5 }); }
    solid(12, 0.9, 16, 0xf8f9fa, x + 4, 5.4, z, false);
    solid(12.2, 0.4, 16.2, 0xe63946, x + 4, 5.0, z, false);
    solid(0.9, 1.6, 1.3, 0xe63946, x + 4, 0.8, z - 3);
    solid(0.9, 1.6, 1.3, 0xe63946, x + 4, 0.8, z + 3);
    solid(8, 4.4, 12, 0xf1faee, x - 9, 2.2, z);
    place('GAS', '#e63946', x + 16, z - 14, 0);
  }
  { // Repair shop
    const { x, z } = PLACES.repair;
    solid(16, 7, 12, 0x6c757d, x, 3.5, z);
    solid(7, 5, 0.2, 0x2b2d42, x, 2.5, z + 6.05, false);
    place('REPAIR', '#f77f00', x - 12, z + 10, Math.PI / 2);
  }
  { // Car dealership
    const { x, z } = PLACES.dealer;
    solid(22, 6, 12, 0xa8dadc, x, 3, z);
    solid(22.4, 1.2, 12.4, 0x1d3557, x, 6.2, z, false);
    solid(4, 1.4, 2, 0xffb703, x - 5, 0.7, z + 11);
    solid(4, 1.4, 2, 0x219ebc, x + 3, 0.7, z + 11);
    place('CARS', '#1d3557', x + 14, z + 10, Math.PI / 2);
  }

  // ---- Power poles + wires along the east-west highway ----
  const poles = [];
  for (let x = -590; x <= 590; x += 32) {
    if (Math.abs(x) < 14 || LINES.some(l => Math.abs(x - l) < 7) || Math.abs(x - RIVER_X) < 12) continue;
    poles.push({ x, z: -11 });
    circles.push({ x, z: -11, r: 0.4 });
  }
  group.add(instanced(new THREE.CylinderGeometry(0.18, 0.24, 9, 5).translate(0, 4.5, 0), lam(0x6b4a2b), poles,
    (p, o) => { o.position.set(p.x, 0, p.z); }));
  group.add(instanced(new THREE.BoxGeometry(0.2, 0.2, 3), lam(0x5a3d22), poles, (p, o) => { o.position.set(p.x, 8.3, p.z); }));
  const wire = [];
  for (let k = 1; k < poles.length; k++) {
    const a = poles[k - 1], b = poles[k];
    if (b.x - a.x > 70) continue;
    for (const dz of [-1.3, 0, 1.3]) wire.push(a.x, 8.45, a.z + dz, b.x, 8.45, b.z + dz);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x222222 })));

  // ---- Collision ----
  function collide(p, rad) {
    let hit = false;
    for (const b of boxes) {
      const dx = p.x - b.x, dz = p.z - b.z;
      if (Math.abs(dx) > b.hw + rad || Math.abs(dz) > b.hd + rad) continue;
      const ox = dx - Math.max(-b.hw, Math.min(b.hw, dx)), oz = dz - Math.max(-b.hd, Math.min(b.hd, dz));
      const d2 = ox * ox + oz * oz;
      if (d2 >= rad * rad) continue;
      if (d2 < 1e-6) {
        const px = b.hw + rad - Math.abs(dx), pz = b.hd + rad - Math.abs(dz);
        if (px < pz) p.x += Math.sign(dx || 1) * px; else p.z += Math.sign(dz || 1) * pz;
      } else {
        const d = Math.sqrt(d2);
        p.x += ox / d * (rad - d); p.z += oz / d * (rad - d);
      }
      hit = true;
    }
    for (const c of circles) {
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + rad, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      p.x += dx / d * (rr - d); p.z += dz / d * (rr - d);
      hit = true;
    }
    return hit;
  }

  // ---- Trees (placed last so they avoid everything above) ----
  const trees = [];
  const probe = { x: 0, z: 0 };
  for (let tries = 0; trees.length < 650 && tries < 20000; tries++) {
    let x, z;
    if (r() < 0.5) {
      const l = pick(r, LINES), off = (r() < 0.5 ? -1 : 1) * (9 + r() * 4), along = -590 + r() * 1180;
      if (r() < 0.5) { x = l + off; z = along; } else { x = along; z = l + off; }
    } else { x = -590 + r() * 1180; z = -590 + r() * 1180; }
    const s = surfaceAt(x, z);
    if (s !== 'grass' && s !== 'field') continue;
    if (LAKES.some(L => Math.hypot(x - L.x, z - L.z) < L.r + 8)) continue;
    probe.x = x; probe.z = z;
    if (collide(probe, 3)) continue;
    trees.push({ x, z, s: 0.8 + r() * 0.7 });
  }
  for (const t of trees) circles.push({ x: t.x, z: t.z, r: 0.5 * t.s });
  group.add(instanced(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5).translate(0, 1.1, 0), lam(0x7a5230), trees,
    (t, o) => { o.position.set(t.x, 0, t.z); o.scale.setScalar(t.s); }));
  group.add(instanced(new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.4, 0), lam(0xffffff), trees, (t, o) => {
    o.position.set(t.x, 0, t.z); o.scale.setScalar(t.s); o.rotation.y = r() * 6;
    return pick(r, [0x3f8f3a, 0x4ea64a, 0x2f7a36, 0x5cb85c]);
  }));

  return { HALF, group, surfaceAt, collide };
}
