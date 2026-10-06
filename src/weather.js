import * as THREE from 'three';
import { Kit, box, ico, rng, rr, clamp, lerp, smooth } from './util.js';
import { Tornado, CLOUD_BASE } from './tornado.js';

const DAY = 540; // seconds for a full day/night cycle
const col = h => new THREE.Color(h);
const SKY = {
  dayTop: col(0x4f9fe8), dayHor: col(0xcde9f7), setTop: col(0x4a5a9a), setHor: col(0xffa060),
  nightTop: col(0x050a1c), nightHor: col(0x142040), stormTop: col(0x2e3638), stormHor: col(0x5d6a66),
};
const EF_WEIGHTS = [0.22, 0.25, 0.22, 0.15, 0.1, 0.06];

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, hor, sunCol, sunDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0); c += sunCol * (pow(s, 900.0) * 2.0 + pow(s, 10.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// Curtain of rain hanging under a storm: open cylinder with scrolling streaks.
const rainMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uCol: { value: new THREE.Color(0x7d8a92) }, uOp: { value: 0 } }]),
  vertexShader: `#include <common>
    #include <fog_pars_vertex>
    varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    }`,
  fragmentShader: `#include <common>
    #include <fog_pars_fragment>
    uniform float uTime, uOp; uniform vec3 uCol; varying vec2 vUv;
    void main(){ float a = uOp * (0.55 + 0.45 * sin(vUv.x * 80.0 + sin(vUv.x * 13.0) * 4.0)) * (0.8 + 0.2 * sin(vUv.y * 30.0 + uTime * 6.0 + vUv.x * 40.0));
      a *= smoothstep(0.0, 0.12, vUv.y);
      gl_FragColor = vec4(uCol, a);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});

class Storm {
  constructor(scene, x, z, vx, vz) {
    this.scene = scene;
    this.meso = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3(vx, 0, vz);
    this.heading = Math.atan2(vx, vz);
    this.fx = Math.sin(this.heading); this.fz = Math.cos(this.heading);
    this.lx = Math.cos(this.heading); this.lz = -Math.sin(this.heading);
    this.age = 0; this.life = rr(330, 420); this.power = 0; this.count = 0; this.cool = rr(18, 28);
    this.tornadoes = []; this.hailiness = rr(0.3, 1); this.lightT = rr(2, 5);
    this.rain = [0, 0]; this.hailC = [0, 0];

    this.group = new THREE.Group();
    this.group.rotation.y = this.heading;
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0 });
    const k = new Kit();
    const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
    for (let i = 0; i < 55; i++) { // rain-free base
      const a = rng() * 6.28, d = Math.sqrt(rng()) * 230, g = ico(rr(22, 40), 1);
      g.scale(1, 0.4, 1);
      k.add(g, lerpHex(0x3c4248, 0x575e65, rng()), Math.cos(a) * d, CLOUD_BASE + 8 + rng() * 10, Math.sin(a) * d * 1.2 + 40, 0, 0, 0, 0.08);
    }
    for (let i = 0; i < 30; i++) { // updraft tower
      const y = CLOUD_BASE + 30 + i * 10, r = rr(55, 95) * (1 - i / 60);
      k.add(ico(r, 1), lerpHex(0x7d848c, 0xe4e7eb, i / 30), rr(-40, 40), y, rr(-60, 20), 0, 0, 0, 0.06);
    }
    for (let i = 0; i < 40; i++) { // anvil blown downstream
      const z = rr(-150, 650), g = ico(rr(60, 110), 1);
      g.scale(1, 0.3, 1);
      k.add(g, lerpHex(0xc8ccd1, 0xeceef0, rng()), rr(-250, 250) * (0.5 + z / 650 * 0.6), 420 + rr(-15, 15), z, 0, 0, 0, 0.05);
    }
    const clouds = new THREE.Mesh(k.geometry(), this.cloudMat);
    clouds.frustumCulled = false;
    this.group.add(clouds);
    // Rotating wall cloud where tornadoes drop from.
    const wk = new Kit();
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28, r = rr(25, 55), g = ico(rr(16, 26), 1); g.scale(1, 0.55, 1); wk.add(g, 0x3a3f44, Math.cos(a) * r, CLOUD_BASE - 12 + rr(-4, 6), Math.sin(a) * r, 0, 0, 0, 0.1); }
    for (let i = 0; i < 5; i++) { const g = ico(rr(18, 28), 1); g.scale(1, 0.6, 1); wk.add(g, 0x34393e, rr(-15, 15), CLOUD_BASE - 18, rr(-15, 15)); }
    this.wall = new THREE.Mesh(wk.geometry(), this.cloudMat);
    this.wall.frustumCulled = false;
    this.group.add(this.wall);
    // Rain + hail curtains in the forward flank.
    this.curtains = [];
    const curtainGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(curtainGeo, rainMat());
      const r = rr(45, 80);
      m.scale.set(r, CLOUD_BASE + 10, r);
      m.position.set(rr(-20, 110), (CLOUD_BASE + 10) / 2, rr(90, 220));
      if (i === 0) { m.material.uniforms.uCol.value.setHex(0xb8c2c8); m.position.set(20, (CLOUD_BASE + 10) / 2, 70); m.scale.set(40, CLOUD_BASE + 10, 40); }
      m.frustumCulled = false;
      this.curtains.push(m); this.group.add(m);
    }
    // Radar echo blobs in storm-relative (forward, left) coordinates.
    this.echo = [];
    for (let i = 0; i < 28; i++) { const f = 150 + rr(-120, 120), l = 50 + rr(-110, 110); this.echo.push({ f, l, r: rr(35, 70), v: clamp(1 - Math.hypot(f - 150, l - 50) / 190 + rr(-0.1, 0.1), 0.15, 0.95) }); }
    for (let i = 0; i < 12; i++) { const a = 0.3 * Math.PI + i * 0.3, r = 95 - i * 5; this.echo.push({ f: Math.cos(a) * r + 20, l: -Math.sin(a) * r, r: 22, v: 0.45 - i * 0.015 }); }
    this.echo.push({ f: 70, l: 20, r: 30, v: 1 }, { f: 80, l: 35, r: 22, v: 1 });
    scene.add(this.group);
  }
  point(f, l) { return [this.meso.x + this.fx * f + this.lx * l, this.meso.z + this.fz * f + this.lz * l]; }
  update(dt, t) {
    this.age += dt;
    this.meso.addScaledVector(this.vel, dt);
    this.power = Math.min(smooth(0, 25, this.age), 1 - smooth(this.life - 35, this.life, this.age));
    this.group.position.set(this.meso.x, 0, this.meso.z);
    this.cloudMat.opacity = this.power;
    this.cloudMat.transparent = this.power < 0.99;
    this.wall.rotation.y += dt * 0.12;
    for (const c of this.curtains) { c.material.uniforms.uTime.value = t; c.material.uniforms.uOp.value = 0.55 * this.power; }
    this.rain = this.point(150, 50);
    this.hailC = this.point(70, 20);
    this.tornadoes = this.tornadoes.filter(x => x.alive);
    return this.age < this.life;
  }
  rainAt(x, z) { return this.power * (1 - smooth(90, 220, Math.hypot(x - this.rain[0], z - this.rain[1]))); }
  hailAt(x, z) { return this.power * this.hailiness * (1 - smooth(20, 75, Math.hypot(x - this.hailC[0], z - this.hailC[1]))); }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.material) o.material.dispose(); });
  }
}

export function createWeather(scene, world, audio) {
  const W = {
    time: 0.28, clock: 0, storms: [], tornadoes: [], debris: null, flash: 0,
    info: { rain: 0, hail: 0, dark: 0, light: 1, night: 0, clock: '' },
    onTornadoEnd: null, onStrike: null, onTornadoSpawn: null,
  };
  const sky = skyDome();
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x5a7a3a, 1.3);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 500 });
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun, sun.target);

  // Stars
  const sp = [];
  for (let i = 0; i < 700; i++) { const v = new THREE.Vector3(rr(-1, 1), rr(0.05, 1), rr(-1, 1)).normalize().multiplyScalar(900); sp.push(v.x, v.y, v.z); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  scene.add(stars);

  // Fair-weather cumulus, tiled twice so the drifting layer never runs out.
  const ck = new Kit();
  for (let i = 0; i < 26; i++) {
    const cx = rr(-1500, 1500), cz = rr(-1500, 1500), cy = rr(190, 250);
    for (let j = 0; j < 6; j++) { const g = ico(rr(14, 30), 1); g.scale(1, 0.6, 1); ck.add(g, 0xffffff, cx + rr(-40, 40), cy + rr(-5, 12), cz + rr(-25, 25), 0, 0, 0, 0.05); }
  }
  const cloudGeo = ck.geometry(), cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const fair = new THREE.Group();
  for (const dx of [0, 3000]) { const m = new THREE.Mesh(cloudGeo, cloudMat); m.position.x = dx; m.frustumCulled = false; fair.add(m); }
  scene.add(fair);

  // Local rain streaks and hailstones around the camera.
  const RAIN = 1400, rainPos = new Float32Array(RAIN * 6), drops = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) { drops[i * 3] = rr(-40, 40); drops[i * 3 + 1] = rr(0, 40); drops[i * 3 + 2] = rr(-40, 40); }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab8c4, transparent: true, opacity: 0.55 }));
  rainLines.frustumCulled = false;
  scene.add(rainLines);
  const HAIL = 220, hail = new THREE.InstancedMesh(ico(0.13, 0), new THREE.MeshLambertMaterial({ color: 0xf2f6fa, flatShading: true }), HAIL);
  hail.frustumCulled = false;
  const stones = Array.from({ length: HAIL }, () => ({ x: rr(-25, 25), y: rr(0, 30), z: rr(-25, 25), vy: -rr(18, 26), b: 0 }));
  scene.add(hail);
  const dummy = new THREE.Object3D();

  // Lightning bolt (one reusable mesh).
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xeef3ff, fog: false, transparent: true });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.frustumCulled = false; bolt.visible = false;
  scene.add(bolt);
  let boltT = 0;
  const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function strike(x, z) {
    const gy = world.heightAt(x, z), k = new Kit();
    const seg = (ax, ay, az, bx, by, bz, w) => {
      _d.set(bx - ax, by - ay, bz - az);
      const len = _d.length();
      _q.setFromUnitVectors(_up, _d.normalize());
      _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, 1, 1));
      k.addMatrix(new THREE.CylinderGeometry(w, w, len, 4), 0xffffff, _m, 0);
    };
    let px = x + rr(-30, 30), py = CLOUD_BASE + 5, pz = z + rr(-30, 30);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const nx = last ? x : lerp(px, x, 1 / (n - i)) + rr(-6, 6), ny = last ? gy : py - (py - gy) / (n - i), nz = last ? z : lerp(pz, z, 1 / (n - i)) + rr(-6, 6);
      seg(px, py, pz, nx, ny, nz, 0.45);
      if (rng() < 0.25) { let bx = nx, by = ny, bz = nz; for (let j = 0; j < 3; j++) { const cx = bx + rr(-9, 9), cy = by - rr(4, 9), cz = bz + rr(-9, 9); seg(bx, by, bz, cx, cy, cz, 0.22); bx = cx; by = cy; bz = cz; } }
      px = nx; py = ny; pz = nz;
    }
    bolt.geometry.dispose();
    bolt.geometry = k.geometry();
    bolt.visible = true; boltT = 0.35;
    W.flash = 1;
    W.onStrike?.(x, z);
  }

  function spawnStorm(car) {
    const a = Math.atan2(0.6, 0.8) + rr(-0.6, 0.6), speed = rr(6.5, 9);
    const fx = Math.sin(a), fz = Math.cos(a), dist = rr(520, 700), side = rr(-180, 180);
    const x = car.pos.x - fx * dist + fz * side, z = car.pos.z - fz * dist - fx * side;
    W.storms.push(new Storm(scene, x, z, fx * speed, fz * speed));
  }
  function spawnTornado(storm) {
    let r = rng(), ef = 0;
    while (ef < 5 && r > EF_WEIGHTS[ef]) { r -= EF_WEIGHTS[ef]; ef++; }
    const shape = ef <= 1 ? (rng() < 0.4 ? 'rope' : 'cone') : ef <= 3 ? ['cone', 'cone', 'wedge', 'rope'][Math.floor(rng() * 4)] : (rng() < 0.65 ? 'wedge' : 'cone');
    const r2 = rng(), special = r2 < 0.1 ? ['multi', 'fire', 'mega', 'drifter'][Math.floor(rng() * 4)] : null;
    if (special === 'multi') ef = Math.max(ef, 3);
    const main = new Tornado(scene, world, storm, { ef, shape, offset: { x: storm.lx * -10, z: storm.lz * -10 }, special });
    storm.tornadoes.push(main); W.tornadoes.push(main);
    if (!special && rng() < 0.18) {
      const ef2 = Math.max(0, ef - Math.floor(rng() * 3));
      const tw = new Tornado(scene, world, storm, { ef: ef2, shape: ef2 >= 4 ? 'wedge' : rng() < 0.5 ? 'rope' : 'cone', offset: { x: storm.lx * 120, z: storm.lz * 120 }, twin: true });
      storm.tornadoes.push(tw); W.tornadoes.push(tw);
      main.hasTwin = tw.hasTwin = true;
    }
    storm.count++;
    W.onTornadoSpawn?.(main);
  }

  const out = { x: 0, z: 0, up: 0, speed: 0 };
  W.windAt = (x, z, o = out) => {
    o.x = 2.5; o.z = 2; o.up = 0;
    for (const s of W.storms) {
      const dx = s.meso.x - x, dz = s.meso.z - z, d = Math.hypot(dx, dz) || 1;
      if (d > 900) continue;
      const inflow = 10 * s.power * smooth(800, 200, d);
      o.x += dx / d * inflow; o.z += dz / d * inflow;
      // Rear-flank downdraft gusts behind the mesocyclone.
      const behind = -(dx * s.fx + dz * s.fz) / d;
      if (behind < -0.2) { const g = 20 * s.power * smooth(320, 80, d) * -behind; o.x -= dx / d * g; o.z -= dz / d * g; }
    }
    for (const t of W.tornadoes) t.addWind(x, z, o);
    o.speed = Math.hypot(o.x, o.z);
    return o;
  };
  W.rainAt = (x, z) => W.storms.reduce((m, s) => Math.max(m, s.rainAt(x, z)), 0);
  W.hailAt = (x, z) => W.storms.reduce((m, s) => Math.max(m, s.hailAt(x, z)), 0);

  let nextStorm = 8, destroyT = 0;
  const light = new THREE.Color();

  W.update = (dt, car, camera) => {
    W.clock += dt;
    W.time = (W.time + dt / DAY) % 1;

    // ---- storms & tornadoes ----
    if (!W.storms.length) { nextStorm -= dt; if (nextStorm <= 0) spawnStorm(car); }
    for (let i = W.storms.length - 1; i >= 0; i--) {
      const s = W.storms[i];
      if (!s.update(dt, W.clock) && !s.tornadoes.length) { s.dispose(); W.storms.splice(i, 1); nextStorm = rr(12, 25); continue; }
      if (!s.tornadoes.length && s.age > 28 && s.age < s.life - 70 && s.count < 3) { s.cool -= dt; if (s.cool <= 0) { spawnTornado(s); s.cool = rr(18, 32); } }
      s.lightT -= dt;
      if (s.lightT <= 0 && s.power > 0.3) {
        s.lightT = rr(2.5, 8) / s.power;
        let x, z;
        if (W.info.rain > 0.35 && rng() < 0.08) { x = car.pos.x + rr(-18, 18); z = car.pos.z + rr(-18, 18); }
        else if (rng() < 0.6) { x = s.rain[0] + rr(-160, 160); z = s.rain[1] + rr(-160, 160); }
        else { x = s.meso.x + rr(-250, 250); z = s.meso.z + rr(-250, 250); }
        strike(x, z);
      }
    }
    const lvl = W.info.light;
    for (let i = W.tornadoes.length - 1; i >= 0; i--) {
      const t = W.tornadoes[i];
      t.update(dt, W.clock, lvl);
      if (!t.alive) { W.tornadoes.splice(i, 1); W.onTornadoEnd?.(t); }
    }
    // Tornado damage to the world (checked a few times per second).
    destroyT -= dt;
    if (destroyT <= 0 && W.debris) {
      destroyT = 0.2;
      for (const t of W.tornadoes) {
        if (t.touch < 0.7) continue;
        world.near(t.pos.x, t.pos.z, t.R * 3 + 20, b => { if (W.windAt(b.x, b.z).speed > b.thr) W.debris.destroy(b, t); });
      }
    }

    // ---- sky & light ----
    const tt = W.time, elev = tt < 0.7 ? Math.sin(Math.PI * tt / 0.7) : -Math.sin(Math.PI * (tt - 0.7) / 0.3) * 0.6;
    const dayF = smooth(-0.12, 0.25, elev), setF = (1 - smooth(0, 0.35, Math.abs(elev))) * dayF;
    let dark = 0;
    for (const s of W.storms) dark = Math.max(dark, s.power * smooth(560, 140, Math.hypot(s.meso.x - car.pos.x, s.meso.z - car.pos.z)));
    const rain = W.rainAt(car.pos.x, car.pos.z), hailI = W.hailAt(car.pos.x, car.pos.z);
    dark = Math.max(dark, rain * 0.9);
    W.flash = Math.max(0, W.flash - dt * 7);
    const top = sky.material.uniforms.top.value, hor = sky.material.uniforms.hor.value;
    top.copy(SKY.nightTop).lerp(SKY.dayTop, dayF).lerp(SKY.setTop, setF * 0.8).lerp(SKY.stormTop, dark * (0.3 + 0.6 * dayF));
    hor.copy(SKY.nightHor).lerp(SKY.dayHor, dayF).lerp(SKY.setHor, setF).lerp(SKY.stormHor, dark * (0.3 + 0.6 * dayF));
    if (W.flash > 0) { top.lerp(light.setHex(0xdde6ff), W.flash * 0.6); hor.lerp(light, W.flash * 0.6); }
    const az = tt * Math.PI * 2 / 0.7;
    const sunDir = sky.material.uniforms.sunDir.value.set(Math.cos(az) * Math.cos(elev), Math.abs(elev), Math.sin(az) * Math.cos(elev) * 0.6 + 0.4).normalize();
    sky.material.uniforms.sunCol.value.setRGB(1, 0.85, 0.6).multiplyScalar(dayF * (1 - dark));
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    stars.material.opacity = (1 - dayF) * (1 - dark);
    scene.fog.color.copy(hor);
    scene.fog.near = lerp(200, 30, rain);
    scene.fog.far = lerp(1500, 320, rain) * lerp(0.6, 1, dayF);

    sun.intensity = lerp(0.25, 2.4 * (1 - 0.75 * dark), dayF);
    sun.color.setRGB(1, 1, 1).lerp(light.setRGB(1, 0.7, 0.45), setF).lerp(light.setRGB(0.55, 0.65, 1), 1 - dayF);
    hemi.intensity = lerp(0.35, 1.3 * (1 - 0.45 * dark), dayF) + W.flash * 2;
    hemi.color.copy(top).lerp(light.setHex(0xffffff), 0.5);
    sun.position.copy(car.pos).addScaledVector(sunDir, 250);
    sun.target.position.copy(car.pos);
    W.info.light = clamp(0.25 + 0.75 * dayF * (1 - 0.5 * dark) + W.flash, 0.2, 1.4);
    W.info.night = 1 - dayF;
    W.info.dark = dark; W.info.rain = rain; W.info.hail = hailI;
    car.headlights.intensity = (1 - dayF) > 0.3 || dark > 0.5 ? 60 : 0;
    world.lampMat.color.setHex(dayF < 0.5 || dark > 0.6 ? 0xfff1b0 : 0x777766);
    const hr = tt < 0.7 ? 6 + tt / 0.7 * 14 : (20 + (tt - 0.7) / 0.3 * 10) % 24;
    W.info.clock = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')}`;

    fair.position.x = -((W.clock * 2) % 3000);
    if (boltT > 0) { boltT -= dt; boltMat.opacity = boltT > 0.25 ? 1 : Math.random() < 0.5 ? 0.9 : 0.2; if (boltT <= 0) bolt.visible = false; }

    // ---- local precipitation ----
    const cam = camera.position, wv = W.windAt(car.pos.x, car.pos.z, {});
    const nr = Math.floor(RAIN * rain);
    for (let i = 0; i < nr; i++) {
      let y = drops[i * 3 + 1] - 32 * dt;
      if (y < 0) y += 40;
      drops[i * 3 + 1] = y;
      const x = cam.x + drops[i * 3] + wv.x * (y - 20) * -0.03, z = cam.z + drops[i * 3 + 2] + wv.z * (y - 20) * -0.03, yy = cam.y - 15 + y;
      const o = i * 6;
      rainPos[o] = x; rainPos[o + 1] = yy; rainPos[o + 2] = z;
      rainPos[o + 3] = x + wv.x * 0.04; rainPos[o + 4] = yy + 1.6; rainPos[o + 5] = z + wv.z * 0.04;
    }
    rainGeo.setDrawRange(0, nr * 2);
    rainGeo.attributes.position.needsUpdate = true;
    const nh = Math.floor(HAIL * hailI);
    for (let i = 0; i < HAIL; i++) {
      const s = stones[i];
      if (i < nh) {
        s.vy -= 20 * dt; s.y += s.vy * dt;
        const gy = world.heightAt(car.pos.x + s.x, car.pos.z + s.z) - car.pos.y + 0.1;
        if (s.y < gy) { if (s.b++ < 1) { s.y = gy; s.vy = -s.vy * 0.35; } else { s.y = rr(22, 30); s.vy = -rr(18, 26); s.b = 0; } }
        dummy.position.set(car.pos.x + s.x, car.pos.y + s.y, car.pos.z + s.z);
        dummy.scale.setScalar(1);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      hail.setMatrixAt(i, dummy.matrix);
    }
    hail.instanceMatrix.needsUpdate = true;
  };
  return W;
}
