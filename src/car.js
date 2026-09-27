import * as THREE from 'three';

// "Dionado" custom SUV: friend's colours from the wishlist.
const COL = { body: 0x1700eb, cabin: 0x3220a7, trim: 0x3c392f, rims: 0xb3b3b3, glass: 0x3c568b, lights: 0xfff9b3 };
// Top-speed multiplier per ground type.
const GRIP = { highway: 1, road: 0.9, grass: 0.72, field: 0.62, corn: 0.5, water: 0.3 };
const TOP = 34; // m/s on highway (~76 mph)

const lam = c => new THREE.MeshLambertMaterial({ color: c });
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function logoTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 7;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.ellipse(64 + Math.sin(i * 0.9) * 7, 18 + i * 15, 52 - i * 6.5, 6, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const M = {
    body: lam(COL.body), cabin: lam(COL.cabin), trim: lam(COL.trim), rims: lam(COL.rims), glass: lam(COL.glass),
    armor: lam(0x6c7080), tire: lam(0x1b1b20), metal: lam(0x9aa0a8), white: lam(0xf2f2f2),
    light: new THREE.MeshBasicMaterial({ color: COL.lights }), tail: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  };

  // Body + cabin
  body.add(box(2.1, 0.9, 4.6, M.body, 0, 1.0, 0));
  body.add(box(2.16, 0.16, 4.66, M.trim, 0, 1.12, 0));            // stripe
  body.add(box(1.96, 0.62, 2.9, M.glass, 0, 1.76, -0.35));        // windows
  body.add(box(2.0, 0.2, 3.0, M.cabin, 0, 2.16, -0.35));          // roof
  for (const z of [1.05, -0.35, -1.75]) body.add(box(2.0, 0.62, 0.18, M.cabin, 0, 1.76, z)); // pillars
  body.add(box(2.04, 0.12, 2.94, M.trim, 0, 2.02, -0.35));        // rolled-up metal shutters
  // Heavy armour plates
  for (const s of [-1, 1]) body.add(box(0.14, 0.6, 3.4, M.armor, s * 1.12, 0.95, 0));
  body.add(box(2.3, 0.45, 0.3, M.armor, 0, 0.8, 2.4));            // front ram
  body.add(box(2.2, 0.5, 0.2, M.armor, 0, 0.85, -2.36));          // rear plate
  // Lights
  for (const s of [-1, 1]) {
    body.add(box(0.5, 0.26, 0.08, M.light, s * 0.68, 1.22, 2.31));
    body.add(box(0.4, 0.22, 0.08, M.tail, s * 0.72, 1.22, -2.31));
  }
  // Roof weather sensors + spinning anemometer
  body.add(box(0.08, 0.9, 0.08, M.metal, 0.6, 2.7, -1.4));
  body.add(box(0.7, 0.25, 0.5, M.metal, -0.45, 2.38, -0.6));
  const spinner = new THREE.Group();
  spinner.position.set(0.6, 3.18, -1.4);
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    const arm = box(0.4, 0.04, 0.04, M.metal, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
    arm.rotation.y = -a;
    spinner.add(arm, box(0.15, 0.15, 0.15, M.white, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4));
  }
  body.add(spinner);
  // Jet booster
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.2, 10), M.metal);
  jet.rotation.x = Math.PI / 2; jet.position.set(0, 1.6, -2.75);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.2, 10), M.trim);
  nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 1.6, -3.35);
  const flame = new THREE.Group();
  const fOuter = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  const fInner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  fOuter.position.y = 0.9; fInner.position.y = 0.55;
  flame.add(fOuter, fInner);
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, 1.6, -3.45);
  flame.visible = false;
  body.add(jet, nozzle, flame);
  // Tornado logo decals
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), logoMat);
    p.position.set(s * 1.2, 0.98, 0.2); p.rotation.y = s * Math.PI / 2;
    body.add(p);
  }
  const hood = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), logoMat);
  hood.rotation.x = -Math.PI / 2; hood.position.set(0, 1.47, 1.6);
  body.add(hood);

  // Off-road wheels
  const tireGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 10).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.52, 8).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.54, 0.12, 0.5);
  const fronts = [], spins = [];
  for (const [x, z] of [[-1.08, 1.5], [1.08, 1.5], [-1.08, -1.5], [1.08, -1.5]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.62, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tireGeo, M.tire), new THREE.Mesh(rimGeo, M.rims), new THREE.Mesh(hubGeo, M.trim));
    pivot.add(spin);
    root.add(pivot);
    spins.push(spin);
    if (z > 0) fronts.push(pivot);
  }

  // Blob shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.8),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.14;
  root.add(shadow);

  const car = {
    root, pos: root.position, heading: 0, speed: 0, steer: 0, surface: 'road',

    update(dt, input, world) {
      const s = world.surfaceAt(this.pos.x, this.pos.z);
      this.surface = s;
      const grip = GRIP[s];
      const boost = input.boost;
      const top = boost ? TOP * grip * 1.6 + 6 : TOP * grip;
      const acc = boost ? 32 : 15;
      const thr = boost ? 1 : input.throttle;
      const before = this.speed;

      if (thr > 0.05) this.speed += (this.speed < -0.5 ? 30 : acc) * thr * dt;
      else if (thr < -0.05) this.speed += (this.speed > 0.5 ? 30 : 8) * thr * dt;
      else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
      if (input.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 36 * dt);
      if (this.speed > top) this.speed += (top - this.speed) * Math.min(1, 1.5 * dt);
      if (this.speed < -10) this.speed = -10;

      const target = input.steer * 0.6 / (1 + Math.abs(this.speed) / 22);
      this.steer += (target - this.steer) * Math.min(1, 10 * dt);
      const yaw = -this.steer * this.speed / 2.9;
      this.heading += yaw * dt;
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;

      if (world.collide(this.pos, 2.2)) this.speed *= Math.abs(this.speed) > 4 ? -0.3 : 0.5;
      const lim = world.HALF - 10;
      this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
      this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
      root.rotation.y = this.heading;

      // Visuals
      for (const f of fronts) f.rotation.y = -this.steer;
      for (const w of spins) w.rotation.x += this.speed / 0.62 * dt;
      const k = Math.min(1, 8 * dt);
      const roll = THREE.MathUtils.clamp(yaw * this.speed * 0.004, -0.1, 0.1);
      const pitch = THREE.MathUtils.clamp(-(this.speed - before) / dt * 0.004, -0.06, 0.06);
      body.rotation.z += (roll - body.rotation.z) * k;
      body.rotation.x += (pitch - body.rotation.x) * k;
      const rough = s === 'highway' || s === 'road' ? 0 : 0.05;
      body.position.y = Math.sin(performance.now() * 0.03) * rough * Math.min(1, Math.abs(this.speed) / 15);
      spinner.rotation.y += (3 + Math.abs(this.speed) * 0.4) * dt;
      flame.visible = boost;
      if (boost) flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    },
  };
  return car;
}
