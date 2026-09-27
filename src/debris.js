import * as THREE from 'three';
import { flatMat, paint, rr, pick } from './util.js';

// Things torn up by tornadoes: they orbit the funnel, get thrown out, land and lie around for a while.
export function createDebris(scene, world, weather) {
  const dummy = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color();
  const TYPES = {
    plank: { geo: paint(new THREE.BoxGeometry(2.4, 0.22, 0.5), 0xffffff), max: 160, r: 1.2, mass: 0.35, lift: 1, h: 0.15 },
    chunk: { geo: paint(new THREE.BoxGeometry(1.2, 0.7, 1), 0xffffff), max: 110, r: 1, mass: 0.5, lift: 0.8, h: 0.35 },
    tree: { geo: world.geos.tree, max: 60, r: 2, mass: 0.9, lift: 0.5, h: 1 },
    fence: { geo: world.geos.fence, max: 80, r: 2.5, mass: 0.3, lift: 0.9, h: 0.1 },
    car: { geo: world.geos.car, max: 24, r: 2.2, mass: 1.4, lift: 0.35, h: 0 },
    cow: { geo: world.geos.cow, max: 30, r: 1.3, mass: 0.8, lift: 0.5, h: 0 },
  };
  for (const T of Object.values(TYPES)) {
    T.mesh = new THREE.InstancedMesh(T.geo, flatMat, T.max);
    T.mesh.frustumCulled = false; T.mesh.castShadow = true;
    for (let i = 0; i < T.max; i++) { T.mesh.setMatrixAt(i, ZERO); T.mesh.setColorAt(i, c.set(0xffffff)); }
    T.free = Array.from({ length: T.max }, (_, i) => i);
    scene.add(T.mesh);
  }
  const pieces = [];
  const WOOD = [0xa37e57, 0x8a6a48, 0xc9a77c, 0x6b5048];

  function spawn(type, x, y, z, torn, color = 0xffffff, ry = rr(0, 6.28), scale = 1) {
    const T = TYPES[type];
    let idx = T.free.pop();
    if (idx === undefined) {
      const k = pieces.findIndex(p => p.T === T && p.state === 'rest');
      if (k < 0) return null;
      idx = pieces[k].idx; pieces.splice(k, 1);
    }
    T.mesh.setColorAt(idx, c.set(color));
    T.mesh.instanceColor.needsUpdate = true;
    const p = { T, idx, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), rot: new THREE.Euler(0, ry, 0), scale, state: 'fly', t: 0, hitCd: 0,
      spin: new THREE.Vector3(rr(-4, 4), rr(-3, 3), rr(-4, 4)).multiplyScalar(0.5 / T.mass) };
    const dx = x - torn.pos.x, dz = z - torn.pos.z, d = Math.hypot(dx, dz);
    if (d < torn.R * 2.2) {
      p.state = 'orbit'; p.torn = torn; p.ang = Math.atan2(dz, dx); p.rad = Math.max(d, torn.R * 0.6);
      p.rf = rr(0.9, 1.8); p.h = y - torn.pos.y; p.orbitT = rr(2.5, 7) * (1.2 - T.mass * 0.4); p.hmax = rr(15, 40 + torn.ef * 14) * T.lift;
    } else {
      const w = weather.windAt(x, z);
      p.vel.set(w.x * 0.4, rr(3, 8), w.z * 0.4);
    }
    pieces.push(p);
    return p;
  }

  function destroy(b, torn) {
    const w = weather.windAt(b.x, b.z), s = w.speed || 1;
    world.kill(b, w.x / s, w.z / s, weather.clock);
    const y = world.heightAt(b.x, b.z);
    if (b.kind === 'building') {
      const n = b.sub === 'silo' ? 3 : 6;
      for (let i = 0; i < n; i++) spawn('plank', b.x + rr(-4, 4), y + rr(1, 5), b.z + rr(-4, 4), torn, pick(WOOD));
      for (let i = 0; i < 4; i++) spawn('chunk', b.x + rr(-4, 4), y + rr(1, 4), b.z + rr(-4, 4), torn, i % 2 ? b.color : pick([0x6b5048, 0x5c5c62, 0xb3342b]));
    } else if (b.kind === 'tree') spawn('tree', b.x, b.y, b.z, torn, b.color, b.ry, b.s);
    else if (b.kind === 'fence') { spawn('fence', b.x, y + 0.3, b.z, torn, 0xffffff, b.ry); spawn('plank', b.x, y + 0.5, b.z, torn, pick(WOOD)); }
    else if (b.kind === 'car' || b.kind === 'cow') spawn(b.kind, b.x, y + 0.2, b.z, torn, b.color, b.ry);
    else if (b.kind === 'bale') spawn('chunk', b.x, y + 0.5, b.z, torn, 0xd9b44e);
    torn.damage.push({ x: b.x, z: b.z, kind: b.kind });
  }

  const cv = new THREE.Vector3();
  function update(dt, car, onHit) {
    const carVel = car.velocity(cv);
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i], T = p.T;
      p.t += dt; p.hitCd -= dt;
      if (p.state === 'orbit') {
        const t = p.torn;
        if (!t.alive || p.t > p.orbitT) {
          p.state = 'fly';
          const vt = t.vtAt(p.rad), ca = Math.cos(p.ang), sa = Math.sin(p.ang);
          p.vel.set(-sa * vt * 0.7 + ca * rr(5, 15), rr(2, 8), ca * vt * 0.7 + sa * rr(5, 15));
        } else {
          const vt = t.vtAt(p.rad);
          p.ang += vt / p.rad * dt;
          p.rad += (t.R * p.rf - p.rad) * 0.8 * dt;
          p.h = Math.min(p.hmax, p.h + t.V * 0.22 * T.lift * dt);
          const nx = t.pos.x + Math.cos(p.ang) * p.rad, ny = t.pos.y + p.h, nz = t.pos.z + Math.sin(p.ang) * p.rad;
          p.vel.set((nx - p.pos.x) / dt, (ny - p.pos.y) / dt, (nz - p.pos.z) / dt);
          p.pos.set(nx, ny, nz);
          p.rot.x += p.spin.x * dt * 1.5; p.rot.y += p.spin.y * dt * 1.5; p.rot.z += p.spin.z * dt * 1.5;
        }
      } else if (p.state === 'fly') {
        const w = weather.windAt(p.pos.x, p.pos.z), k = 0.25 / T.mass;
        p.vel.x += (w.x - p.vel.x) * k * dt;
        p.vel.z += (w.z - p.vel.z) * k * dt;
        p.vel.y += (-16 + w.up * 0.3) * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
        const g = Math.max(world.heightAt(p.pos.x, p.pos.z), world.WATER - 0.5) + T.h * p.scale;
        if (p.pos.y < g) {
          p.pos.y = g;
          if (p.vel.y < -7) { p.vel.y *= -0.3; p.vel.x *= 0.5; p.vel.z *= 0.5; }
          else {
            p.state = 'rest'; p.t = 0;
            if (T === TYPES.tree) { p.rot.set(Math.PI / 2, p.rot.y, 0, 'YXZ'); p.pos.y += 0.6; }
            else if (T === TYPES.car || T === TYPES.cow) p.rot.set(0, p.rot.y, Math.random() < 0.4 ? Math.PI : 0);
            else p.rot.set(0, p.rot.y, 0);
            if (T === TYPES.car && p.rot.z) p.pos.y += 2.1 * p.scale;
          }
        }
      }
      // Hits on the player's car.
      if (p.state !== 'rest' && p.hitCd <= 0) {
        const dx = p.pos.x - car.pos.x, dy = p.pos.y - (car.pos.y + 1.2), dz = p.pos.z - car.pos.z, d = Math.hypot(dx, dy, dz);
        if (d < T.r + 1.8) {
          const rel = Math.hypot(p.vel.x - carVel.x, p.vel.y - carVel.y, p.vel.z - carVel.z);
          if (rel > 9) {
            const dh = Math.hypot(dx, dz) || 1;
            car.damage((rel - 9) * T.mass * 0.9, -dx / dh, -dz / dh);
            car.vel.addScaledVector(p.vel, 0.05 * T.mass);
            p.vel.multiplyScalar(-0.3);
            p.hitCd = 1;
            onHit?.(p, rel);
          }
        }
      }
      let s = p.scale;
      if (p.state === 'rest' && p.t > 50) s *= Math.max(0, 1 - (p.t - 50) / 2);
      if (s <= 0) {
        T.mesh.setMatrixAt(p.idx, ZERO);
        T.free.push(p.idx); pieces.splice(i, 1);
        continue;
      }
      dummy.position.copy(p.pos); dummy.rotation.copy(p.rot); dummy.scale.setScalar(s);
      dummy.updateMatrix();
      T.mesh.setMatrixAt(p.idx, dummy.matrix);
    }
    for (const T of Object.values(TYPES)) T.mesh.instanceMatrix.needsUpdate = true;
  }
  return { destroy, update, pieces };
}
