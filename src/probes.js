import * as THREE from 'three';
import { Kit, cyl, box, clamp, flatMat } from './util.js';

// Probe types. Price 0 = carried from the start, the rest are bought at the dealership.
export const PROBE_TYPES = [
  { id: 'pod', name: 'Pod probe', icon: '🎈', price: 0, desc: 'Tough capsule with a marker balloon: drop it in the tornado\'s path' },
  { id: 'turtle', name: 'Turtle probe', icon: '🐢', price: 1500, desc: 'Low and flat: needs a near-direct hit (pays x1.5) but survives EF0-EF3, so you can pick it up again' },
  { id: 'balloon', name: 'Weather balloon', icon: '🌡️', price: 2500, desc: 'Launch near a supercell to sample its updraft, no tornado needed' },
  { id: 'camera', name: 'Camera probe', icon: '🎥', price: 6000, desc: 'Films from inside the funnel: needs a close hit, pays x1.6' },
  { id: 'rocket', name: 'Rocket probe', icon: '🚀', price: 12000, desc: 'Fires straight into the nearest tornado within 350 m' },
  { id: 'drone', name: 'Drone probe', icon: '🛸', price: 20000, desc: 'Flies to a tornado within 900 m, circles it collecting data, then flies home' },
];

const sphere = (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
const MODELS = {
  pod() {
    const k = new Kit();
    k.add(cyl(0.42, 0.5, 0.45, 10), 0xff7a1a, 0, 0.3, 0);
    k.add(cyl(0.44, 0.44, 0.08, 10), 0xffffff, 0, 0.47, 0);
    k.add(new THREE.ConeGeometry(0.42, 0.35, 10), 0xff7a1a, 0, 0.69, 0);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; k.add(cyl(0.035, 0.05, 0.32, 4), 0x2a2a2e, Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42); }
    k.add(cyl(0.015, 0.015, 0.7, 3), 0x222222, 0.22, 1.0, 0);
    k.add(cyl(0.02, 0.02, 3.3, 3), 0xdddddd, 0, 2.5, 0);
    return k.geometry();
  },
  marker() { const k = new Kit(), g = sphere(0.9); g.scale(1, 1.15, 1); k.add(g, 0xff4b3a, 0, 0, 0); k.add(new THREE.ConeGeometry(0.14, 0.2, 6), 0xc8352a, 0, -1.05, 0, Math.PI); return k.geometry(); },
  turtle() {
    const k = new Kit(), dome = new THREE.SphereGeometry(0.72, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.42, 1);
    k.add(cyl(0.78, 0.8, 0.1, 14), 0x2a2a2e, 0, 0.05, 0);
    k.add(dome, 0xf2c12e, 0, 0.1, 0);
    k.add(cyl(0.14, 0.14, 0.05, 8), 0x1b1b1f, 0, 0.41, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; k.add(box(0.1, 0.03, 0.1), 0x1b1b1f, Math.cos(a) * 0.45, 0.32, Math.sin(a) * 0.45); }
    k.add(cyl(0.012, 0.012, 0.6, 3), 0x222222, 0.3, 0.6, 0);
    return k.geometry();
  },
  balloon() {
    const k = new Kit(), b = sphere(1.3, 12, 9);
    b.scale(1, 1.2, 1);
    k.add(b, 0xf4f4f4, 0, 0, 0);
    k.add(new THREE.ConeGeometry(0.2, 0.3, 6), 0xdadada, 0, -1.6, 0, Math.PI);
    k.add(cyl(0.01, 0.01, 3.4, 3), 0xcccccc, 0, -3.4, 0);
    k.add(box(0.3, 0.22, 0.2), 0xffffff, 0, -5.2, 0);
    k.add(box(0.31, 0.06, 0.21), 0xff7a1a, 0, -5.15, 0);
    return k.geometry();
  },
  camera() {
    const k = new Kit();
    k.add(cyl(0.45, 0.56, 0.62, 8), 0x3a3f4a, 0, 0.31, 0);
    k.add(cyl(0.3, 0.45, 0.22, 8), 0x2a2e36, 0, 0.73, 0);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      k.add(cyl(0.15, 0.15, 0.22, 8), 0x111111, Math.cos(a) * 0.52, 0.38, Math.sin(a) * 0.52, 0, -a, Math.PI / 2);
      k.add(cyl(0.1, 0.1, 0.04, 8), 0x4a7bd9, Math.cos(a) * 0.64, 0.38, Math.sin(a) * 0.64, 0, -a, Math.PI / 2);
    }
    k.add(box(0.08, 0.08, 0.08), 0xff2020, 0, 0.88, 0);
    k.add(cyl(0.015, 0.015, 0.8, 3), 0x222222, 0.2, 1.2, 0);
    return k.geometry();
  },
  rocket() {
    const k = new Kit();
    k.add(cyl(0.18, 0.18, 1.6, 8), 0xf2f2f2, 0, 0, 0, Math.PI / 2);
    k.add(cyl(0.185, 0.185, 0.18, 8), 0xd9262b, 0, 0, 0.35, Math.PI / 2);
    k.add(new THREE.ConeGeometry(0.18, 0.55, 8), 0xd9262b, 0, 0, 1.07, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; k.add(box(0.03, 0.36, 0.4), 0x2a2a2e, Math.cos(a) * 0.26, Math.sin(a) * 0.26, -0.65, 0, 0, a + Math.PI / 2); }
    return k.geometry();
  },
  drone() {
    const k = new Kit();
    k.add(box(0.6, 0.18, 0.7), 0x2a2e36, 0, 0, 0);
    k.add(new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2f2f2, 0, 0.08, 0);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      k.add(box(0.07, 0.06, 0.9), 0x1b1b1f, x * 0.3, 0, z * 0.3, 0, Math.atan2(x, z));
      k.add(cyl(0.07, 0.07, 0.14, 6), 0x1b1b1f, x * 0.62, 0.06, z * 0.62);
      k.add(cyl(0.36, 0.36, 0.02, 12), 0x55585e, x * 0.62, 0.15, z * 0.62, 0, 0, 0, 0);
      k.add(box(0.06, 0.06, 0.06), z > 0 ? 0x30ff60 : 0xff3030, x * 0.62, -0.05, z * 0.62, 0, 0, 0, 0);
    }
    k.add(sphere(0.12, 8, 5), 0x111111, 0, -0.16, 0.22);
    return k.geometry();
  },
};
const geos = {};
const geo = id => (geos[id] ??= MODELS[id]());

export function createProbes(G) {
  const { scene, world, weather, car, S } = G;
  const list = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020 });
  const flameGeo = new THREE.ConeGeometry(0.16, 0.9, 6).rotateX(-Math.PI / 2).translate(0, 0, -1.25);

  const type = () => PROBE_TYPES.find(p => p.id === S.ptype) || PROBE_TYPES[0];
  const owned = () => PROBE_TYPES.filter(p => !p.price || S.gear.includes(p.id));
  function cycle() {
    const o = owned(), i = o.findIndex(p => p.id === S.ptype);
    S.ptype = o[(i + 1) % o.length].id;
    G.toast(`${type().icon} ${type().name} selected`);
  }
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const nearestTornado = max => weather.tornadoes.filter(t => t.touch > 0.5 && dist2(t.pos, car.pos) < max).sort((a, b) => dist2(a.pos, car.pos) - dist2(b.pos, car.pos))[0];
  function spawn(id, x, y, z) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo(id), flatMat));
    g.position.set(x, y, z);
    scene.add(g);
    const p = { id, group: g, pos: g.position, state: 'armed', t: 0, used: new Set() };
    list.push(p);
    return p;
  }
  function remove(p) { scene.remove(p.group); list.splice(list.indexOf(p), 1); }
  function pay(t, d, hitR, mult) {
    const close = 1 - clamp((d - t.R * 0.5) / Math.max(1, hitR - t.R * 0.5), 0, 1);
    return (150 + 100 * Math.pow(t.ef, 1.6)) * (0.3 + 1.7 * Math.pow(close, 1.5)) * G.bonus(t) * G.probeMult() * mult;
  }
  function scored(t, d, amount, what) {
    G.earn(amount, `${what} ${t.rating} ${Math.round(d)}m`);
    G.stat('probe'); if (t.ef >= 3) G.stat('ef3');
    G.record(t, d, amount);
  }
  function suck(p, t) { p.state = 'hit'; p.t = 0; p.torn = t; p.ang = Math.atan2(p.pos.z - t.pos.z, p.pos.x - t.pos.x); p.rad = Math.max(3, dist2(p.pos, t.pos)); }

  function deploy() {
    const near = list.find(p => p.state === 'armed' && dist2(p.pos, car.pos) < 9);
    if (near) { remove(near); S.probes++; G.toast('📦 Probe picked up'); return; }
    if (S.probes <= 0) return G.toast('No probes left, refill at a gas station');
    if (car.airborne || car.dead) return;
    const T = type(), fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    if (['pod', 'turtle', 'camera'].includes(T.id)) {
      if (Math.abs(car.speed) > 12) return G.toast('Slow down to deploy a probe');
      const x = car.pos.x - fx * 3.5, z = car.pos.z - fz * 3.5, p = spawn(T.id, x, world.heightAt(x, z), z);
      p.group.rotation.y = car.heading;
      if (T.id === 'pod') { p.marker = new THREE.Mesh(geo('marker'), flatMat); p.marker.position.y = 4.3; p.group.add(p.marker); }
      G.audio.beep(); G.toast(`${T.icon} ${T.name} deployed`);
    } else if (T.id === 'balloon') {
      const p = spawn('balloon', car.pos.x, car.pos.y + 7.5, car.pos.z);
      p.state = 'rise';
      G.audio.whoosh(); G.toast('🌡️ Weather balloon launched');
    } else {
      const t = nearestTornado(T.id === 'rocket' ? 350 : 900);
      if (!t) return G.toast(T.id === 'rocket' ? '🚀 No tornado within 350 m' : '🛸 No tornado within 900 m');
      const p = spawn(T.id, car.pos.x, car.pos.y + 2.8, car.pos.z);
      p.torn = t; p.from = p.pos.clone();
      if (T.id === 'rocket') {
        p.state = 'rocket'; p.dur = Math.max(1.2, dist2(t.pos, car.pos) / 75);
        p.group.add(new THREE.Mesh(flameGeo, flameMat));
        G.audio.whoosh();
      } else { p.state = 'fly'; p.group.scale.setScalar(1.5); G.audio.beep(); }
      G.toast(`${T.icon} ${T.name} launched at the ${t.rating}`);
    }
    S.probes--;
  }

  const tgt = new THREE.Vector3(), prev = new THREE.Vector3();
  function moveTo(p, x, y, z, speed, dt) {
    tgt.set(x - p.pos.x, y - p.pos.y, z - p.pos.z);
    const d = tgt.length();
    if (d > 0.01) p.pos.addScaledVector(tgt, Math.min(1, speed * dt / d));
    p.group.rotation.set(d > 1 ? 0.22 : 0, Math.atan2(tgt.x, tgt.z), 0, 'YXZ');
    return d;
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.state === 'armed') {
        if (p.marker) p.marker.position.y = 4.3 + Math.sin(p.t * 2) * 0.2;
        for (const t of weather.tornadoes) {
          if (t.touch < 0.7 || p.used.has(t)) continue;
          const d = dist2(t.pos, p.pos), hitR = p.id === 'turtle' ? t.R * 0.9 + 10 : p.id === 'camera' ? t.R * 1.1 + 14 : t.R * 1.5 + 25;
          if (d >= hitR) continue;
          const T = PROBE_TYPES.find(x => x.id === p.id);
          scored(t, d, pay(t, d, hitR, p.id === 'turtle' ? 1.5 : p.id === 'camera' ? 1.6 : 1), `${T.icon} PROBE HIT`);
          if (p.id === 'turtle' && t.ef <= 3 && !t.special) { p.used.add(t); G.toast('🐢 Turtle survived, drive over it to pick it up'); }
          else suck(p, t);
          break;
        }
      } else if (p.state === 'hit') { // sucked up the funnel
        const t = p.torn;
        p.ang += 2 * dt; p.rad = Math.max(3, p.rad - 10 * dt);
        p.pos.set(t.pos.x + Math.cos(p.ang) * p.rad, p.pos.y + 12 * dt, t.pos.z + Math.sin(p.ang) * p.rad);
        p.group.rotation.set(p.t * 3, p.t * 2, 0);
        if (p.t > 5) remove(p);
      } else if (p.state === 'rise') { // weather balloon drifts up into the storm
        const w = weather.windAt(p.pos.x, p.pos.z);
        p.pos.x += w.x * 0.2 * dt; p.pos.z += w.z * 0.2 * dt; p.pos.y += (6 + p.t * 0.6) * dt;
        p.group.scale.setScalar(1 + p.t * 0.06);
        p.group.rotation.y += 0.3 * dt;
        if (p.t > 7 && !p.paid) {
          p.paid = true;
          const s = weather.storms.map(s => [s, dist2(s.meso, p.pos)]).sort((a, b) => a[1] - b[1])[0];
          if (s && s[1] < 700) {
            const amt = (60 + 240 * s[0].power * Math.pow(1 - s[1] / 700, 1.2)) * (s[0].tornadoes.length ? 1.5 : 1);
            G.earn(amt, `🌡️ Balloon data: updraft ${Math.round(s[1])}m away`); G.stat('balloon');
          } else G.toast('🌡️ Balloon too far from any storm, no data');
        }
        if (p.t > 18) remove(p);
      } else if (p.state === 'rocket') {
        const t = p.torn, f = Math.min(1, p.t / p.dur);
        if (!t.alive) { G.toast('🚀 Rocket missed, the tornado roped out'); remove(p); continue; }
        prev.copy(p.pos);
        p.pos.lerpVectors(p.from, tgt.set(t.pos.x, world.heightAt(t.pos.x, t.pos.z) + 6, t.pos.z), f);
        p.pos.y += Math.sin(Math.PI * f) * p.dur * 9;
        p.group.lookAt(prev.lerp(p.pos, 2));
        p.group.children[1].scale.z = 0.7 + Math.random() * 0.6;
        if (f >= 1) {
          const d = t.R * Math.random() * 0.7;
          scored(t, d, pay(t, d, t.R * 1.5 + 25, 1.25), '🚀 ROCKET HIT');
          p.group.remove(p.group.children[1]);
          suck(p, t);
        }
      } else if (p.state === 'fly' || p.state === 'orbit') { // drone
        const t = p.torn, R = t.R * 2.2 + 15;
        if (!t.alive || (p.state === 'orbit' && p.t > 12)) {
          if (p.data > 0) { G.earn(p.data, `🛸 Drone data from the ${t.rating}`); G.stat('probe'); }
          if (t.alive && Math.random() < 0.3) { G.toast('🛸 Drone got sucked into the vortex!'); suck(p, t); }
          else { p.state = 'home'; G.toast('🛸 Drone flying home'); }
          continue;
        }
        if (p.state === 'fly') {
          const a = Math.atan2(p.pos.z - t.pos.z, p.pos.x - t.pos.x);
          if (moveTo(p, t.pos.x + Math.cos(a) * R, world.heightAt(p.pos.x, p.pos.z) + 22, t.pos.z + Math.sin(a) * R, 30, dt) < 4) { p.state = 'orbit'; p.t = 0; p.ang = a; p.data = 0; }
        } else {
          p.ang += 0.7 * dt;
          moveTo(p, t.pos.x + Math.cos(p.ang) * R, world.heightAt(p.pos.x, p.pos.z) + 20 + Math.sin(p.t * 3) * 2, t.pos.z + Math.sin(p.ang) * R, 40, dt);
          p.data += (8 + 7 * t.ef) * G.bonus(t) * G.probeMult() * dt;
        }
      } else if (p.state === 'home') {
        if (moveTo(p, car.pos.x, car.pos.y + 4, car.pos.z, 32, dt) < 4) { remove(p); S.probes++; G.toast('🛸 Drone is back in the vehicle'); }
      }
    }
  }
  return { list, deploy, update, cycle, type };
}
