import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createCar } from './car.js';
import { createControls } from './controls.js';
import { createWeather } from './weather.js';
import { createDebris } from './debris.js';
import { createAudio } from './audio.js';
import { Kit, cyl, box, clamp, flatMat } from './util.js';
import { createRadar } from './radar.js';
import { VEHICLES } from './vehicles.js';
import { createProbes } from './probes.js';
import { createJobs } from './jobs.js';
import { createProgress } from './progress.js';
import { createCoop } from './coop.js';
import { createUI } from './ui.js';
import { createGrass } from './grass.js';
import { vehicleThumb } from './thumbs.js';

const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;

// ---------- save data ----------
const SAVE_KEY = 'tornadion';
const SAVED = ['money', 'xp', 'owned', 'vehicle', 'up', 'best', 'relaxed', 'shadows', 'sound', 'music', 'musicVol', 'quality', 'gear', 'ptype', 'cust', 'daily', 'rec',
  'ach', 'log', 'album', 'started', 'tutorialDone', 'playerName'];
let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch {}
const S = {
  money: 500, xp: 0, owned: ['dionado'], vehicle: 'dionado', up: {}, best: [], relaxed: false, shadows: !touch, sound: true, music: true, musicVol: 0.5,
  quality: touch ? 'medium' : 'high', gear: [], ptype: 'pod', cust: {}, daily: null, rec: {}, ach: {}, log: [], album: [], started: false, tutorialDone: false,
  playerName: 'Chaser' + Math.floor(Math.random() * 900 + 100),
  ...Object.fromEntries(SAVED.filter(k => save[k] !== undefined).map(k => [k, save[k]])),
  zoom: false, paused: true, mode: 'title', savedAt: 0,
};
let wiping = false;
function persist() {
  if (wiping) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Object.fromEntries(SAVED.map(k => [k, S[k]])))); S.savedAt = Date.now(); } catch {}
}
setInterval(persist, 5000);
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => document.hidden && persist());
const exportSave = () => JSON.stringify({ game: 'tornadion', version: 1, ...Object.fromEntries(SAVED.map(k => [k, S[k]])) }, null, 1);
const exportCode = () => 'TORNADION:' + btoa(unescape(encodeURIComponent(JSON.stringify(Object.fromEntries(SAVED.filter(k => k !== 'album').map(k => [k, S[k]]))))));
function importSave(text) {
  try {
    text = (text || '').trim();
    const data = JSON.parse(text.startsWith('TORNADION:') ? decodeURIComponent(escape(atob(text.slice(10)))) : text);
    if (typeof data.money !== 'number' || !Array.isArray(data.owned)) throw new Error('bad');
    if (!confirm('Load this save? Your current progress on this device will be replaced.')) return;
    wiping = true;
    localStorage.setItem(SAVE_KEY, JSON.stringify(Object.fromEntries(SAVED.filter(k => data[k] !== undefined).map(k => [k, data[k]]))));
    location.reload();
  } catch { alert('That doesn\'t look like a Tornadion save.'); }
}
function resetSave() { wiping = true; try { localStorage.removeItem(SAVE_KEY); } catch {} location.href = location.pathname; }

// ---------- renderer & world ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: !touch, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcde9f7, 200, 1500);
const camera = new THREE.PerspectiveCamera(65, 1, 1.0, 3500);
const world = buildWorld(scene);
const audio = createAudio();
const car = createCar(scene);
const weather = createWeather(scene, world, audio);
const debris = createDebris(scene, world, weather);
weather.debris = debris;
const grass = createGrass(scene, world);
const controls = createControls();
car.reset(-3.5, -40, 0);

function applyGraphics() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, { low: 0.75, medium: touch ? 1.1 : 1.25, high: touch ? 1.5 : 2 }[S.quality] || 1));
  renderer.shadowMap.enabled = S.shadows && S.quality !== 'low';
  renderer.shadowMap.type = S.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  grass.radius = { low: 0, medium: 40, high: 60 }[S.quality] ?? 40;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- player vehicle ----------
const vdef = () => VEHICLES.find(v => v.id === S.vehicle) || VEHICLES[0];
const cust = () => (S.cust[S.vehicle] ??= {});
const vname = () => cust().name || vdef().name;
function applyVehicle() {
  const hp = car.health / car.maxHealth, win = car.windows;
  car.setVehicle(vdef(), S.up, cust());
  if (S.probesMax) { car.health = car.maxHealth * hp; car.windows = win; }
  audio.setHorn(cust().horn);
  S.probesMax = vdef().probes + (S.up.probes || 0);
  S.probes = Math.min(S.probes ?? S.probesMax, S.probesMax);
}
S.probes = 99; applyVehicle();
car.relaxed = S.relaxed;
audio.setEnabled(S.sound);
audio.setMusic(S.music, S.musicVol);
applyGraphics();

// ---------- money, toasts ----------
const level = () => 1 + Math.floor(Math.sqrt(S.xp / 120));
function toast(msg, cls = '') {
  const d = document.createElement('div');
  d.textContent = msg; d.className = cls;
  $('toasts').prepend(d);
  setTimeout(() => { d.style.opacity = 0; }, 2800);
  setTimeout(() => d.remove(), 3500);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
}
function earn(amount, why) {
  const before = level();
  if (coop.nearFriend()) { amount *= 1.1; why += ' (co-op +10%)'; }
  S.money += amount; S.xp += amount * 0.2 + 5;
  S.rec.earned = (S.rec.earned || 0) + amount;
  toast(`${why} +$${Math.round(amount).toLocaleString()}`);
  audio.cash();
  if (level() > before) { toast(`⭐ LEVEL ${level()}!`, 'gold'); audio.levelUp(); }
}
const bonus = t => (t.special ? 2 : 1);
const warnedTown = () => world.TOWNS.find(tw => weather.tornadoes.some(t => t.touch > 0.5 && t.kind !== 'devil' && Math.hypot(t.pos.x - tw.x, t.pos.z - tw.z) < 450));

// ---------- photos ----------
let photoCd = 0, wantPhoto = null;
const v3 = new THREE.Vector3();
// Best tornado in the current camera frame and how good a shot it makes (0-1).
function shot() {
  let best = null, q = 0;
  for (const t of weather.tornadoes) {
    if (t.touch < 0.5) continue;
    v3.set(t.pos.x, t.pos.y + (t.height ? t.height / 3 : 30), t.pos.z);
    const dist = camera.position.distanceTo(v3);
    v3.project(camera);
    if (dist > 1300 || Math.abs(v3.x) > 0.95 || Math.abs(v3.y) > 0.95 || v3.z > 1) continue;
    const tq = clamp((t.R * 2 + 20) / dist * (S.zoom ? 3 : 1) * 1.8, 0.05, 1) * (1 - weather.info.rain * 0.5) * (1 - 0.3 * Math.hypot(v3.x, v3.y)) * (t.rainWrap ? 0.45 : 1);
    if (tq > q) { q = tq; best = t; }
  }
  return { best, q };
}
function takePhoto() {
  if (photoCd > 0) return;
  photoCd = 1.2;
  audio.shutter();
  $('flash').style.transition = 'none'; $('flash').style.opacity = 0.8;
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .4s'; $('flash').style.opacity = 0; });
  const { best, q } = shot();
  if (!best) return toast('📷 No tornado in frame');
  const rope = best.roping ? 1.5 : 1;
  const pay = (60 + 70 * best.ef) * (0.4 + q * 2.6) / (1 + best.photos++) * bonus(best) * rope * (car.perk === 'camera' ? 1.5 : 1);
  earn(pay, `📷 Photo ${best.label}${rope > 1 ? ' roping out!' : ''}`);
  G.stat('photo'); G.note(best, 'photo', pay);
  if (rope > 1) progress.unlock('rope');
  wantPhoto = { label: best.label, pay };
}
// Grab a small thumbnail of the frame right after it's rendered.
const thumb = document.createElement('canvas');
thumb.width = 224; thumb.height = 126;
function capturePhoto() {
  const c = renderer.domElement, ar = c.width / c.height, tw = 16 / 9;
  const sw = ar > tw ? c.height * tw : c.width, sh = ar > tw ? c.height : c.width / tw;
  thumb.getContext('2d').drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, thumb.width, thumb.height);
  progress.addPhoto(thumb.toDataURL('image/jpeg', 0.72), wantPhoto.label, wantPhoto.pay);
  wantPhoto = null;
}

// ---------- shared context for the game modules ----------
const radar = createRadar(world, weather);
let ui = null;
const G = {
  scene, world, weather, car, S, audio, radar, toast, earn, shot, warnedTown, bonus, level, vdef, cust, vname, applyVehicle, applyGraphics,
  persist, exportSave, exportCode, importSave, resetSave,
  stat: (id, n) => { jobs.stat(id, n); progress.onStat(id); },
  note: (t, key, amt) => progress.note(t, key, amt),
  unlock: id => progress.unlock(id),
  probeMult: () => (car.perk === 'radar' ? 1.25 : car.perk === 'science' ? 1.4 : 1),
  vehicleThumb,
  record(t, d, pay) { S.best.push({ r: t.rating, d: Math.round(d), pay: Math.round(pay), s: t.special ? 'mutant' : t.kind === 'devil' ? 'dust devil' : t.shape }); S.best.sort((a, b) => b.pay - a.pay); S.best.length = Math.min(S.best.length, 10); },
  setIndicator(txt) { if ($('live').textContent !== txt) { $('live').textContent = txt; $('live').style.display = txt ? 'block' : 'none'; } },
  setPaused(v) { S.paused = v || S.mode === 'title' || !!ui?.open; last = performance.now(); },
};
const probes = createProbes(G);
const jobs = createJobs(G);
const progress = createProgress(G);
const coop = createCoop(G);
Object.assign(G, {
  probes, jobs, progress, coop,
  net: m => { if (coop.live) coop.send(m); },
  share: (text, amount) => { if (coop.live) coop.send({ t: 'evt', text, share: Math.round(amount * 0.25) }); },
  applyKill(i, tid) {
    const b = world.breakables[i];
    if (!b || !b.alive) return;
    const t = weather.tornadoes.find(x => x.nid === tid) || weather.tornadoes.slice().sort((a, c) => Math.hypot(a.pos.x - b.x, a.pos.z - b.z) - Math.hypot(c.pos.x - b.x, c.pos.z - b.z))[0];
    if (t) debris.destroy(b, t); else world.kill(b, 1, 0, weather.clock);
  },
  onNet(m, p) {
    if (m.t === 'survey') m.list.forEach(addSurvey);
    else if (m.t === 'svdone') { if (surveys.some(s => s.id === m.id)) toast(`👥 ${p.name} finished a damage survey`); removeSurvey(m.id); }
    else if (m.t === 'rescue') m.list.forEach(r => jobs.spawnRescue(r.x, r.z, r.ef, r.id));
    else if (m.t === 'rsdone') { if (jobs.rescues.some(r => r.id === m.id)) toast(`👥 ${p.name} rescued someone`); jobs.removeRescue(m.id); }
  },
  chat: addChat,
});
weather.onDestroy = (b, t) => { if (coop.live && coop.role === 'host') coop.send({ t: 'kill', i: b.idx, tid: t.id }); };

// ---------- co-op chat ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function addChat(name, color, text) {
  const d = document.createElement('div');
  d.innerHTML = `<b style="color:${color}">${esc(name)}</b> ${esc(text)}`;
  $('chat-log').append(d);
  while ($('chat-log').children.length > 6) $('chat-log').firstChild.remove();
  setTimeout(() => d.classList.add('old'), 9000);
  audio.beep();
}
function sendChat(text) {
  text = (text || '').trim().slice(0, 80);
  if (!text || !coop.live) return;
  coop.send({ t: 'chat', text });
  addChat(S.playerName + ' (you)', '#ffffff', text);
}
const openChat = on => { $('chat-bar').classList.toggle('hidden', !on); if (on) $('chat-in').focus(); else $('chat-in').blur(); };
$('chat-btn').onclick = () => openChat($('chat-bar').classList.contains('hidden'));
$('chat-x').onclick = () => openChat(false);
$('chat-form').onsubmit = e => { e.preventDefault(); sendChat($('chat-in').value); $('chat-in').value = ''; openChat(false); };
$('chat-quick').onclick = e => { const b = e.target.closest('button'); if (b) { sendChat(b.textContent); openChat(false); } };
addEventListener('keydown', e => { if ((e.code === 'KeyT' || e.code === 'Enter') && coop.live && S.mode === 'play' && !ui.open && !e.target.closest?.('input, textarea')) { e.preventDefault(); openChat(true); } });
ui = createUI(G);

// ---------- events ----------
car.onEvent = (e, d) => {
  if (e === 'fling') { toast(d.wasAnchored ? '💥 Anchor ripped out!' : '🌪️ FLUNG!'); progress.unlock('flung'); }
  if (e === 'land' && d.air > 4) progress.unlock('airtime');
  if (e === 'land' && d.dmg > 5) { toast(`Landed hard (${d.air.toFixed(1)}s airtime)`); audio.crash(1); }
  if (e === 'crash') audio.crash(0.5);
  if (e === 'dead') { toast('💀 DESTROYED, towing to repair shop'); deadT = 3; }
};
weather.onStrike = (x, z) => {
  const d = Math.hypot(x - car.pos.x, z - car.pos.z);
  audio.thunder(d);
  if (d < 12) { car.damage(18, 0, 0); toast('⚡ Lightning strike!'); }
};
weather.onTornadoSpawn = t => {
  if (t.kind === 'devil') return toast('🌪️ A dust devil is spinning up nearby');
  if (t.kind === 'landspout') return toast(`🌪️ Landspout touchdown! ${t.rating}`);
  toast(`🌪️ Tornado on the ground! ${t.label}`);
};
weather.onTornadoTurn = t => { if (t.kind !== 'devil' && t.pos.distanceTo(car.pos) < 1500) toast(`↪️ The ${t.rating} just changed direction!`); };
// Damage surveys: after a tornado dies, flags mark where it did damage.
const surveys = [];
const flagGeo = (() => { const k = new Kit(); k.add(cyl(0.06, 0.06, 3, 4), 0xdddddd, 0, 1.5, 0); k.add(box(0.05, 0.7, 1.1), 0xff8a1f, 0, 2.6, 0.55); return k.geometry(); })();
function addSurvey(s) {
  const m = new THREE.Mesh(flagGeo, flatMat);
  m.position.set(s.x, world.heightAt(s.x, s.z), s.z);
  scene.add(m);
  surveys.push({ ...s, mesh: m, until: weather.clock + 360 });
}
function removeSurvey(id) { const i = surveys.findIndex(s => s.id === id); if (i >= 0) { scene.remove(surveys[i].mesh); surveys.splice(i, 1); } }
weather.onTornadoEnd = t => {
  if (t.silent || t.kind === 'devil') return;
  jobs.onTornadoEnd(t);
  if (!t.damage.length || weather.remote) return; // in co-op the host hands out the survey points
  const n = Math.min(4, t.damage.length), list = [];
  for (let i = 0; i < n; i++) {
    const d = t.damage[Math.floor((i + 0.5) / n * t.damage.length)];
    list.push({ id: `${t.id}-${i}-${Date.now() % 100000}`, x: d.x + 3, z: d.z + 3, pay: Math.round((80 + 60 * t.ef) * bonus(t)), ef: t.ef });
  }
  list.forEach(addSurvey);
  G.net({ t: 'survey', list });
  toast(`📋 Tornado dissipated: ${n} damage survey point${n > 1 ? 's' : ''} marked`);
};
function updateSurveys() {
  for (let i = surveys.length - 1; i >= 0; i--) {
    const s = surveys[i];
    s.mesh.rotation.y += 0.02;
    const hit = Math.hypot(s.x - car.pos.x, s.z - car.pos.z) < 10;
    if (hit) G.net({ t: 'svdone', id: s.id });
    if (hit) ui.rateSurvey(s, ef => {
      const off = Math.abs(ef - s.ef);
      earn(s.pay * (off === 0 ? 1.6 : off === 1 ? 1 : 0.4), `📋 Survey: you said EF${ef}, it was EF${s.ef}${off ? '' : ' ✔'}`);
      G.stat('survey'); if (!off) G.stat('survey_ace');
    });
    if (hit || weather.clock > s.until) { scene.remove(s.mesh); surveys.splice(i, 1); }
  }
}
let deadT = 0;
const nearest = type => world.places.filter(p => p.type === type).sort((a, b) => Math.hypot(a.x - car.pos.x, a.z - car.pos.z) - Math.hypot(b.x - car.pos.x, b.z - car.pos.z))[0];

// ---------- camera ----------
let camHeading = car.heading, orbitA = 0;
const camTarget = new THREE.Vector3(), look = new THREE.Vector3();
function updateCamera(dt) {
  const baseFov = innerWidth < innerHeight ? 80 : 62;
  if (S.mode === 'title') { // slow orbit around the vehicle behind the title menu
    orbitA += dt * 0.12;
    const r = 13, x = car.pos.x + Math.sin(orbitA) * r, z = car.pos.z + Math.cos(orbitA) * r;
    camera.position.set(x, Math.max(car.pos.y + 3.2, world.heightAt(x, z) + 1.5), z);
    look.set(car.pos.x - Math.cos(orbitA) * 3, car.pos.y + 1.6, car.pos.z + Math.sin(orbitA) * 3);
    camera.lookAt(look);
    camera.fov = baseFov;
  } else if (S.zoom) {
    const t = weather.tornadoes.slice().sort((a, b) => a.pos.distanceTo(car.pos) - b.pos.distanceTo(car.pos))[0];
    camera.position.set(car.pos.x, car.pos.y + 3, car.pos.z);
    if (t) look.set(t.pos.x, t.pos.y + (t.height ? t.height / 3 : 35), t.pos.z); else look.set(car.pos.x + Math.sin(car.heading) * 100, car.pos.y + 10, car.pos.z + Math.cos(car.heading) * 100);
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
  $('scope').style.display = S.zoom && S.mode === 'play' ? 'block' : 'none';
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
  $('clock').textContent = '🕒 ' + weather.info.clock;
  const l = level(), x0 = 120 * (l - 1) ** 2, x1 = 120 * l ** 2;
  $('xp').firstChild.style.width = clamp((S.xp - x0) / (x1 - x0), 0, 1) * 100 + '%';
  $('hp').firstChild.style.width = car.health / car.maxHealth * 100 + '%';
  $('fuel').firstChild.style.width = car.fuel / car.maxFuel * 100 + '%';
  const pt = probes.type();
  $('probes').textContent = `${pt.icon} ${pt.name} ${S.probes}/${S.probesMax}` + (car.windows > 0.3 ? ' · 🪟 cracked' : '');
  $('vname').textContent = '🚙 ' + vname();
  $('b-probe').firstChild.nodeValue = pt.icon;
  $('speed').firstChild.nodeValue = Math.round(Math.abs(car.speed) * 2.237);
  const ms = world.mesonets.find(m => Math.hypot(m.x - car.pos.x, m.z - car.pos.z) < 45);
  const msTxt = ms ? ` · 📡 ${ms.id} ${Math.round(weather.windAt(ms.x, ms.z).speed * 2.237)} mph` : '';
  $('wind').textContent = `💨 ${Math.round(car.wind.speed * 2.237)} mph${msTxt}`;
  const t = weather.tornadoes.filter(t => t.kind !== 'devil' || t.pos.distanceTo(car.pos) < 500).sort((a, b) => a.pos.distanceTo(car.pos) - b.pos.distanceTo(car.pos))[0];
  const s = weather.storms.slice().sort((a, b) => a.meso.distanceTo(car.pos) - b.meso.distanceTo(car.pos))[0];
  const bearing = (dx, dz) => DIRS[Math.round(((Math.atan2(-dx, dz) / (Math.PI * 2)) * 8 + 8)) % 8];
  if (t) {
    const dx = t.pos.x - car.pos.x, dz = t.pos.z - car.pos.z;
    $('tinfo').textContent = `🌪️ ${t.label} · ${Math.round(Math.hypot(dx, dz))} m ${bearing(dx, dz)} · ${Math.round(t.V * 2.237)} mph`;
  } else if (s) {
    const dx = s.meso.x - car.pos.x, dz = s.meso.z - car.pos.z;
    $('tinfo').textContent = `⛈️ Supercell ${Math.round(Math.hypot(dx, dz))} m ${bearing(dx, dz)}`;
  } else $('tinfo').textContent = '☀️ Clear skies · storm forming soon';
  $('b-anchor').classList.toggle('act', car.anchored);
  const warnTown = warnedTown();
  $('warn').textContent = warnTown ? `⚠️ TORNADO WARNING · ${warnTown.name}` : '';
  $('warn').style.display = warnTown ? 'block' : 'none';
  const dealer = world.places.find(p => p.type === 'dealer' && Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 14);
  $('shop-btn').style.display = dealer && !S.paused ? 'block' : 'none';
  $('b-rec').style.display = S.gear.includes('video') ? '' : 'none';
  $('b-rec').classList.toggle('act', jobs.rec);
  $('chat-btn').style.display = coop.live ? '' : 'none';
  $('b-ptype').style.display = S.gear.some(g => ['turtle', 'balloon', 'camera', 'rocket', 'drone'].includes(g)) ? '' : 'none';
}
$('shop-btn').onclick = () => ui.openShop();

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.05);
  last = now;
  coop.update(dt);
  if (S.paused) {
    controls.input.taps.clear();
    if (S.mode === 'title' && !ui.open) { weather.update(dt, car, camera); world.update(dt, weather.clock, car.pos); grass.update(dt, car.pos, 5); updateCamera(dt); }
    renderer.render(scene, camera);
    return;
  }
  controls.update();
  const input = controls.input;
  for (const tap of input.taps) {
    if (tap === 'probe') probes.deploy();
    else if (tap === 'ptype') probes.cycle();
    else if (tap === 'rec') jobs.toggleRec();
    else if (tap === 'map') radar.setBig(!radar.big);
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
  grass.update(dt, car.pos, car.wind.speed);
  probes.update(dt);
  updateSurveys();
  jobs.update(dt);
  progress.update(dt);
  ui.tutorial.update(dt);
  if (car.perk === 'heal' && !car.dead) car.repair(1.5 * dt);
  for (const t of weather.tornadoes) if (t.special === 'fire' && t.pos.distanceTo(car.pos) < t.R * 1.2) { car.damage(12 * dt); if (shockT <= 0) { shockT = 2; toast('🔥 Burning!'); } }
  radarT -= dt;
  if (radarT <= 0) { radarT = 0.1; radar.draw(car, { probes: coop.live ? probes.list.concat(coop.probeDots()) : probes.list, surveys, rescues: jobs.rescues, friends: coop.friends(), range: car.perk === 'radar' ? 900 : 450 }); }

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

  let roar = 0, danger = 0;
  for (const t of weather.tornadoes) {
    const near = 1 - clamp(t.pos.distanceTo(car.pos) / 900, 0, 1);
    roar = Math.max(roar, t.touch * (0.4 + 0.12 * t.ef) * near * (t.kind === 'devil' ? 0.3 : 1));
    if (t.kind !== 'devil') danger = Math.max(danger, t.touch * Math.min(1, near * 1.6));
  }
  audio.setDanger(danger);
  const siren = world.TOWNS.some(tw => weather.tornadoes.some(t => t.kind !== 'devil' && Math.hypot(t.pos.x - tw.x, t.pos.z - tw.z) < 450) && Math.hypot(car.pos.x - tw.x, car.pos.z - tw.z) < 600) ? 1 : 0;
  audio.update({ speed: car.speed, throttle: input.throttle, boost: car.boosting, wind: car.wind.speed, roar, rain: weather.info.rain, siren, horn: input.horn });

  updateCamera(dt);
  hud(dt);
  renderer.render(scene, camera);
  if (wantPhoto) capturePhoto();
}

ui.showTitle();
requestAnimationFrame(() => requestAnimationFrame(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 600); }));
if (location.search.includes('autostart')) ui.startGame(false);
requestAnimationFrame(frame);
