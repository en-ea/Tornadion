import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createCar } from './car.js';
import { createControls } from './controls.js';
import { createWeather } from './weather.js';
import { createDebris } from './debris.js';
import { createAudio } from './audio.js';
import { Kit, cyl, box, clamp, flatMat } from './util.js';
import { createRadar } from './radar.js';
import { VEHICLES, UPGRADES } from './vehicles.js';

const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcde9f7, 200, 1500);
const camera = new THREE.PerspectiveCamera(65, 1, 0.8, 4000);
const world = buildWorld(scene);
const audio = createAudio();
const car = createCar(scene);
const weather = createWeather(scene, world, audio);
const debris = createDebris(scene, world, weather);
weather.debris = debris;
const controls = createControls();
car.reset(-3.5, -40, 0);

// ---------- progress (saved locally) ----------
let save = {};
try { save = JSON.parse(localStorage.getItem('tornadion') || '{}'); } catch {}
const S = {
  money: save.money ?? 500, xp: save.xp ?? 0, zoom: false, paused: true,
  owned: save.owned ?? ['dionado'], vehicle: save.vehicle ?? 'dionado', up: save.up ?? {}, best: save.best ?? [],
  relaxed: !!save.relaxed, shadows: save.shadows ?? !touch, sound: save.sound ?? true,
};
const vdef = () => VEHICLES.find(v => v.id === S.vehicle) || VEHICLES[0];
function applyVehicle() {
  car.setVehicle(vdef(), S.up);
  S.probesMax = vdef().probes + (S.up.probes || 0);
  S.probes = Math.min(S.probes ?? S.probesMax, S.probesMax);
}
S.probes = 99; applyVehicle();
car.relaxed = S.relaxed;
renderer.shadowMap.enabled = S.shadows;
audio.setEnabled(S.sound);
const radar = createRadar(world, weather);
const surveys = [];
const level = () => 1 + Math.floor(Math.sqrt(S.xp / 120));
function toast(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  $('toasts').prepend(d);
  setTimeout(() => { d.style.opacity = 0; }, 2600);
  setTimeout(() => d.remove(), 3300);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
}
function earn(amount, why) {
  const before = level();
  S.money += amount; S.xp += amount * 0.2 + 5;
  toast(`${why} +$${Math.round(amount).toLocaleString()}`);
  audio.cash();
  if (level() > before) { toast(`⭐ LEVEL ${level()}!`); audio.levelUp(); }
}
const persist = () => { try { localStorage.setItem('tornadion', JSON.stringify({ money: S.money, xp: S.xp, owned: S.owned, vehicle: S.vehicle, up: S.up, best: S.best, relaxed: S.relaxed, shadows: S.shadows, sound: S.sound })); } catch {} };
setInterval(persist, 4000);
const bonus = t => (t.special ? 2 : 1);

// ---------- probes (weather balloons) ----------
const probeGeo = (() => { const k = new Kit(); k.add(cyl(0.35, 0.45, 0.5, 8), 0xff7a1a, 0, 0.25, 0); k.add(cyl(0.36, 0.36, 0.08, 8), 0xffffff, 0, 0.5, 0); k.add(cyl(0.02, 0.02, 3.6, 3), 0xdddddd, 0, 2.3, 0); return k.geometry(); })();
const balloonGeo = (() => { const k = new Kit(); const g = new THREE.SphereGeometry(0.9, 8, 6); g.scale(1, 1.15, 1); k.add(g, 0xf4f4f4, 0, 0, 0); return k.geometry(); })();
const probes = [];
function probeButton() {
  const near = probes.find(p => p.state === 'armed' && p.pos.distanceTo(car.pos) < 9);
  if (near) { scene.remove(near.group); probes.splice(probes.indexOf(near), 1); S.probes++; toast('📦 Probe picked up'); return; }
  if (S.probes <= 0) return toast('No probes left, refill at a gas station');
  if (Math.abs(car.speed) > 12 || car.airborne) return toast('Slow down to deploy a probe');
  const g = new THREE.Group(), pod = new THREE.Mesh(probeGeo, flatMat), bal = new THREE.Mesh(balloonGeo, pod.material);
  bal.position.y = 4.3; g.add(pod, bal);
  const x = car.pos.x - Math.sin(car.heading) * 3.5, z = car.pos.z - Math.cos(car.heading) * 3.5;
  g.position.set(x, world.heightAt(x, z), z);
  scene.add(g);
  probes.push({ group: g, balloon: bal, pos: g.position, state: 'armed', t: 0 });
  S.probes--; audio.beep(); toast('🎈 Probe deployed');
}
function updateProbes(dt) {
  for (let i = probes.length - 1; i >= 0; i--) {
    const p = probes[i];
    p.t += dt;
    if (p.state === 'armed') {
      p.balloon.position.y = 4.3 + Math.sin(p.t * 2) * 0.2;
      for (const t of weather.tornadoes) {
        if (t.touch < 0.7) continue;
        const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z), hitR = t.R * 1.5 + 25;
        if (d < hitR) {
          const close = 1 - clamp((d - t.R * 0.5) / (hitR - t.R * 0.5), 0, 1);
          const pay = (150 + 100 * Math.pow(t.ef, 1.6)) * (0.3 + 1.7 * Math.pow(close, 1.5)) * bonus(t) * (car.perk === 'radar' ? 1.25 : 1);
          earn(pay, `🎯 PROBE HIT ${t.rating} ${Math.round(d)}m`);
          S.best.push({ r: t.rating, d: Math.round(d), pay: Math.round(pay), s: t.special ? 'mutant' : t.shape });
          S.best.sort((a, b) => b.pay - a.pay); S.best.length = Math.min(S.best.length, 10);
          p.state = 'hit'; p.t = 0; p.torn = t; p.ang = Math.atan2(p.pos.z - t.pos.z, p.pos.x - t.pos.x); p.rad = d;
          break;
        }
      }
    } else { // sucked up the funnel
      const t = p.torn;
      p.ang += 2 * dt; p.rad = Math.max(3, p.rad - 10 * dt);
      p.group.position.set(t.pos.x + Math.cos(p.ang) * p.rad, p.group.position.y + 12 * dt, t.pos.z + Math.sin(p.ang) * p.rad);
      p.group.rotation.set(p.t * 3, p.t * 2, 0);
      if (p.t > 5) { scene.remove(p.group); probes.splice(i, 1); }
    }
  }
}

// ---------- photos ----------
let photoCd = 0;
const v3 = new THREE.Vector3();
function takePhoto() {
  if (photoCd > 0) return;
  photoCd = 1.2;
  audio.shutter();
  $('flash').style.transition = 'none'; $('flash').style.opacity = 0.8;
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .4s'; $('flash').style.opacity = 0; });
  let best = null, bq = 0;
  for (const t of weather.tornadoes) {
    if (t.touch < 0.5) continue;
    v3.set(t.pos.x, t.pos.y + 30, t.pos.z);
    const dist = camera.position.distanceTo(v3);
    v3.project(camera);
    if (dist > 1300 || Math.abs(v3.x) > 0.95 || Math.abs(v3.y) > 0.95 || v3.z > 1) continue;
    const q = clamp((t.R * 2 + 20) / dist * (S.zoom ? 3 : 1) * 1.8, 0.05, 1) * (1 - weather.info.rain * 0.5) * (1 - 0.3 * Math.hypot(v3.x, v3.y));
    if (q > bq) { bq = q; best = t; }
  }
  if (!best) return toast('📷 No tornado in frame');
  earn((60 + 70 * best.ef) * (0.4 + bq * 2.6) / (1 + best.photos++) * bonus(best) * (car.perk === 'camera' ? 1.5 : 1), `📷 Photo ${best.label}`);
}

// ---------- events ----------
car.onEvent = (e, d) => {
  if (e === 'fling') toast(d.wasAnchored ? '💥 Anchor ripped out!' : '🌪️ FLUNG!');
  if (e === 'land' && d.dmg > 5) { toast(`Landed hard (${d.air.toFixed(1)}s airtime)`); audio.crash(1); }
  if (e === 'crash') audio.crash(0.5);
  if (e === 'dead') { toast('💀 DESTROYED, towing to repair shop'); deadT = 3; }
};
weather.onStrike = (x, z) => {
  const d = Math.hypot(x - car.pos.x, z - car.pos.z);
  audio.thunder(d);
  if (d < 12) { car.damage(18, 0, 0); toast('⚡ Lightning strike!'); }
};
weather.onTornadoSpawn = t => toast(`🌪️ Tornado on the ground! ${t.label}${t.hasTwin ? ' + TWIN' : ''}`);
// Damage surveys: after a tornado dies, flags mark where it did damage.
const flagGeo = (() => { const k = new Kit(); k.add(cyl(0.06, 0.06, 3, 4), 0xdddddd, 0, 1.5, 0); k.add(box(0.05, 0.7, 1.1), 0xff8a1f, 0, 2.6, 0.55); return k.geometry(); })();
weather.onTornadoEnd = t => {
  if (!t.damage.length) return;
  const n = Math.min(4, t.damage.length);
  for (let i = 0; i < n; i++) {
    const d = t.damage[Math.floor((i + 0.5) / n * t.damage.length)];
    const m = new THREE.Mesh(flagGeo, flatMat);
    m.position.set(d.x + 3, world.heightAt(d.x + 3, d.z + 3), d.z + 3);
    scene.add(m);
    surveys.push({ x: d.x + 3, z: d.z + 3, mesh: m, pay: (80 + 60 * t.ef) * bonus(t), r: t.rating, until: weather.clock + 360 });
  }
  toast(`📋 ${t.rating} dissipated: ${n} damage survey point${n > 1 ? 's' : ''} marked`);
};
function updateSurveys() {
  for (let i = surveys.length - 1; i >= 0; i--) {
    const s = surveys[i];
    s.mesh.rotation.y += 0.02;
    const hit = Math.hypot(s.x - car.pos.x, s.z - car.pos.z) < 10;
    if (hit) earn(s.pay, `📋 Damage survey (${s.r} damage)`);
    if (hit || weather.clock > s.until) { scene.remove(s.mesh); surveys.splice(i, 1); }
  }
}
let deadT = 0;
const nearest = type => world.places.filter(p => p.type === type).sort((a, b) => Math.hypot(a.x - car.pos.x, a.z - car.pos.z) - Math.hypot(b.x - car.pos.x, b.z - car.pos.z))[0];

// ---------- camera ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
let camHeading = car.heading;
const camTarget = new THREE.Vector3(), look = new THREE.Vector3();
function updateCamera(dt) {
  const baseFov = innerWidth < innerHeight ? 80 : 62;
  if (S.zoom) {
    const t = weather.tornadoes.slice().sort((a, b) => a.pos.distanceTo(car.pos) - b.pos.distanceTo(car.pos))[0];
    camera.position.set(car.pos.x, car.pos.y + 3, car.pos.z);
    if (t) look.set(t.pos.x, t.pos.y + 35, t.pos.z); else look.set(car.pos.x + Math.sin(car.heading) * 100, car.pos.y + 10, car.pos.z + Math.cos(car.heading) * 100);
    camera.lookAt(look);
    camera.fov = 16;
  } else {
    let d = car.heading - camHeading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    camHeading += d * Math.min(1, (car.airborne ? 1 : 4) * dt);
    const fx = Math.sin(camHeading), fz = Math.cos(camHeading), back = 11 + Math.abs(car.speed) * 0.08 + (car.airborne ? 8 : 0);
    camTarget.set(car.pos.x - fx * back, car.pos.y + 5.2, car.pos.z - fz * back);
    camTarget.y = Math.max(camTarget.y, world.heightAt(camTarget.x, camTarget.z) + 1.5);
    camera.position.lerp(camTarget, Math.min(1, 6 * dt));
    look.set(car.pos.x + fx * 4, car.pos.y + 1.6, car.pos.z + fz * 4);
    camera.lookAt(look);
    camera.fov = baseFov;
  }
  camera.updateProjectionMatrix();
  $('scope').style.display = S.zoom ? 'block' : 'none';
}
camera.position.set(car.pos.x, car.pos.y + 6, car.pos.z - 12);

// ---------- HUD ----------
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
let hudT = 0, placeT = 0, shockT = 0, radarT = 0;
function hud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  $('money').textContent = '$' + Math.round(S.money).toLocaleString();
  $('level').textContent = 'Lv ' + level();
  $('clock').textContent = weather.info.clock;
  const l = level(), x0 = 120 * (l - 1) ** 2, x1 = 120 * l ** 2;
  $('xp').firstChild.style.width = clamp((S.xp - x0) / (x1 - x0), 0, 1) * 100 + '%';
  $('hp').firstChild.style.width = car.health / car.maxHealth * 100 + '%';
  $('fuel').firstChild.style.width = car.fuel / car.maxFuel * 100 + '%';
  $('probes').textContent = `🎈 PROBES ${S.probes}/${S.probesMax}` + (car.windows > 0.3 ? ' · 🪟 cracked' : '');
  $('speed').firstChild.nodeValue = Math.round(Math.abs(car.speed) * 2.237);
  const ms = world.mesonets.find(m => Math.hypot(m.x - car.pos.x, m.z - car.pos.z) < 45);
  const msTxt = ms ? ` · 📡 ${ms.id} ${Math.round(weather.windAt(ms.x, ms.z).speed * 2.237)} mph` : '';
  $('wind').textContent = `💨 ${Math.round(car.wind.speed * 2.237)} mph${msTxt}`;
  const t = weather.tornadoes.slice().sort((a, b) => a.pos.distanceTo(car.pos) - b.pos.distanceTo(car.pos))[0];
  const s = weather.storms[0];
  const bearing = (dx, dz) => DIRS[Math.round(((Math.atan2(-dx, dz) / (Math.PI * 2)) * 8 + 8)) % 8];
  if (t) {
    const dx = t.pos.x - car.pos.x, dz = t.pos.z - car.pos.z;
    $('tinfo').textContent = `🌪️ ${t.label} · ${Math.round(Math.hypot(dx, dz))}m ${bearing(dx, dz)} · ${Math.round(t.V * 2.237)} mph`;
  } else if (s) {
    const dx = s.meso.x - car.pos.x, dz = s.meso.z - car.pos.z;
    $('tinfo').textContent = `⛈️ Supercell ${Math.round(Math.hypot(dx, dz))}m ${bearing(dx, dz)}`;
  } else $('tinfo').textContent = 'Clear skies… storm incoming';
  $('b-anchor').classList.toggle('act', car.anchored);
  const warnTown = world.TOWNS.find(tw => weather.tornadoes.some(t => t.touch > 0.5 && Math.hypot(t.pos.x - tw.x, t.pos.z - tw.z) < 450));
  $('warn').textContent = warnTown ? `⚠️ TORNADO WARNING · ${warnTown.name}` : '';
  $('warn').style.display = warnTown ? 'block' : 'none';
  const dealer = world.places.find(p => p.type === 'dealer' && Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 14);
  $('shop-btn').style.display = dealer && !S.paused ? 'block' : 'none';
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.05);
  last = now;
  if (S.paused) { controls.input.taps.clear(); renderer.render(scene, camera); return; }
  controls.update();
  const input = controls.input;
  for (const tap of input.taps) {
    if (tap === 'probe') probeButton();
    else if (tap === 'map') $('radar').dispatchEvent(new PointerEvent('pointerdown'));
    else if (tap === 'anchor') { const r = car.toggleAnchor(); if (r === 'fast') toast('Stop first to anchor'); else if (r === 'none') toast('This vehicle has no anchor'); else if (r !== 'no') { audio.clunk(); toast(r === 'on' ? '⚓ Anchored, shutters down' : 'Anchor up'); } }
    else if (tap === 'photo') takePhoto();
    else if (tap === 'zoom') S.zoom = !S.zoom;
  }
  input.taps.clear();
  photoCd -= dt;

  car.update(dt, input, world, weather);
  weather.update(dt, car, camera);
  debris.update(dt, car, () => audio.crash(0.4));
  world.update(dt, weather.clock, car.pos);
  updateProbes(dt);
  updateSurveys();
  if (car.perk === 'heal' && !car.dead) car.repair(1.5 * dt);
  for (const t of weather.tornadoes) if (t.special === 'fire' && t.pos.distanceTo(car.pos) < t.R * 1.2) { car.damage(12 * dt); if (shockT <= 0) { shockT = 2; toast('🔥 Burning!'); } }
  radarT -= dt;
  if (radarT <= 0) { radarT = 0.1; radar.draw(car, { probes, surveys, range: car.perk === 'radar' ? 900 : 450 }); }

  // Hail, downed power lines, services, respawn.
  if (weather.info.hail > 0.05) { car.hail(weather.info.hail, dt); if (Math.random() < weather.info.hail * dt * 20) audio.clink(); }
  shockT -= dt;
  if (world.wireHazard(car.pos.x, car.pos.z) < 2.5 && !car.airborne) { car.damage(10 * dt); if (shockT <= 0) { shockT = 2; toast('⚡ Live wire!'); audio.zap(); } }
  placeT -= dt;
  for (const p of world.places) {
    if (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) > p.r || Math.abs(car.speed) > 4) continue;
    if (p.type === 'gas' && (car.fuel < car.maxFuel - 0.5 || S.probes < S.probesMax)) {
      car.fuel = Math.min(car.maxFuel, car.fuel + 15 * dt); S.money = Math.max(0, S.money - 1.5 * 15 * dt);
      if (placeT <= 0 && S.probes < S.probesMax) { S.probes++; S.money = Math.max(0, S.money - 40); placeT = 0.5; }
    } else if (p.type === 'repair' && (car.health < car.maxHealth || car.windows > 0)) {
      car.repair(20 * dt); S.money = Math.max(0, S.money - 2 * 20 * dt);
    }
  }
  if (car.fuel <= 0 && Math.abs(car.speed) < 0.5 && placeT <= 0) {
    placeT = 4; const g = nearest('gas');
    toast('⛽ Out of fuel, towed to gas station (-$150)');
    S.money = Math.max(0, S.money - 150); car.reset(g.x, g.z - 12, 0); car.fuel = 30;
  }
  if (deadT > 0) {
    deadT -= dt;
    if (deadT <= 0) { const r = nearest('repair'); S.money = Math.max(0, S.money - 300); car.fullRepair(); car.reset(r.x, r.z - 6, Math.PI); car.fuel = Math.max(car.fuel, 40); }
  }

  let roar = 0;
  for (const t of weather.tornadoes) roar = Math.max(roar, t.touch * (0.4 + 0.12 * t.ef) * (1 - clamp(t.pos.distanceTo(car.pos) / 900, 0, 1)));
  const siren = world.TOWNS.some(tw => weather.tornadoes.some(t => Math.hypot(t.pos.x - tw.x, t.pos.z - tw.z) < 450) && Math.hypot(car.pos.x - tw.x, car.pos.z - tw.z) < 600) ? 1 : 0;
  audio.update({ speed: car.speed, throttle: input.throttle, boost: car.boosting, wind: car.wind.speed, roar, rain: weather.info.rain, siren, horn: input.horn });

  updateCamera(dt);
  hud(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- menus ----------
const fmt = n => '$' + Math.round(n).toLocaleString();
function openPanel(id) { S.paused = true; for (const p of ['menu', 'shop', 'start']) $(p).classList.toggle('hidden', p !== id); }
function closePanels() { for (const p of ['menu', 'shop', 'start']) $(p).classList.add('hidden'); S.paused = false; last = performance.now(); persist(); }
function renderMenu() {
  $('o-relaxed').checked = S.relaxed; $('o-shadows').checked = S.shadows; $('o-sound').checked = S.sound;
  $('board').innerHTML = S.best.length ? S.best.map(b => `<li>${b.r} ${b.s} · ${b.d}m · ${fmt(b.pay)}</li>`).join('') : '<li>No probe hits yet</li>';
}
$('menu-btn').onclick = () => { renderMenu(); openPanel('menu'); };
$('o-close').onclick = closePanels;
$('o-relaxed').onchange = e => { S.relaxed = car.relaxed = e.target.checked; };
$('o-shadows').onchange = e => { S.shadows = renderer.shadowMap.enabled = e.target.checked; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); };
$('o-sound').onchange = e => { S.sound = e.target.checked; audio.setEnabled(S.sound); };
$('o-reset').onclick = () => { if (confirm('Reset all money, vehicles and upgrades?')) { try { localStorage.removeItem('tornadion'); } catch {} location.reload(); } };
function renderShop() {
  $('shop-money').textContent = fmt(S.money);
  $('vlist').innerHTML = VEHICLES.map(v => {
    const own = S.owned.includes(v.id), cur = v.id === S.vehicle;
    const btn = cur ? '<button disabled>DRIVING</button>' : own ? `<button data-sel="${v.id}">DRIVE</button>` : `<button data-buy="${v.id}" ${S.money < v.price ? 'disabled' : ''}>${fmt(v.price)}</button>`;
    return `<div class="item"><div><b>${v.name}</b><small>${v.desc}<br>HP ${v.hp} · weight ${v.mass} · ${Math.round(v.top * 2.237)} mph · ${v.probes} probes${v.anchor ? ' · anchor' : ''}</small></div>${btn}</div>`;
  }).join('');
  $('ulist').innerHTML = UPGRADES.map(u => {
    const lvl = S.up[u.id] || 0, max = lvl >= u.prices.length, price = u.prices[lvl];
    return `<div class="item"><div><b>${u.name}</b><small>${u.desc} · level ${lvl}/${u.prices.length}</small></div>${max ? '<button disabled>MAX</button>' : `<button data-up="${u.id}" ${S.money < price ? 'disabled' : ''}>${fmt(price)}</button>`}</div>`;
  }).join('');
}
$('shop').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'shop-close') return closePanels();
  if (b.dataset.buy) { const v = VEHICLES.find(x => x.id === b.dataset.buy); S.money -= v.price; S.owned.push(v.id); S.vehicle = v.id; applyVehicle(); audio.cash(); toast(`🚗 Bought ${v.name}!`); }
  else if (b.dataset.sel) { S.vehicle = b.dataset.sel; applyVehicle(); toast(`Now driving ${vdef().name}`); }
  else if (b.dataset.up) { const u = UPGRADES.find(x => x.id === b.dataset.up), lvl = S.up[u.id] || 0; S.money -= u.prices[lvl]; S.up[u.id] = lvl + 1; applyVehicle(); audio.cash(); toast(`🔧 ${u.name} level ${lvl + 1}`); }
  persist(); renderShop();
};
$('shop-btn').onclick = () => { renderShop(); openPanel('shop'); };
$('start').onclick = () => closePanels();
if (location.search.includes('autostart')) closePanels();
