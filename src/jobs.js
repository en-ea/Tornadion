import * as THREE from 'three';
import { Kit, box, cyl, flatMat } from './util.js';

// Daily missions: three are picked per real-world day.
const MISSIONS = [
  { id: 'probe', text: n => `Score ${n} probe hits`, n: [2, 3], pay: 300 },
  { id: 'photo', text: n => `Take ${n} tornado photos`, n: [3, 5], pay: 120 },
  { id: 'core', text: () => 'Core punch a tornado', n: [1], pay: 900 },
  { id: 'survey', text: n => `Complete ${n} damage surveys`, n: [2, 3], pay: 250 },
  { id: 'rescue', text: n => `Rescue ${n} stranded ${n > 1 ? 'people' : 'person'}`, n: [1, 2], pay: 350 },
  { id: 'report', text: n => `File ${n} storm reports`, n: [2, 3], pay: 150 },
  { id: 'ef3', text: () => 'Probe an EF3 or stronger', n: [1], pay: 1000 },
  { id: 'km', text: n => `Drive ${n} km`, n: [4, 7], pay: 90 },
  { id: 'wind', text: () => 'Feel 100+ mph wind in your vehicle', n: [1], pay: 600 },
  { id: 'tv', text: () => 'Go live on TV', n: [1], pay: 500 },
];

function personGeo() {
  const k = new Kit(), shirt = [0xd9262b, 0x1fa39a, 0xf2c12e, 0x6b2fd9, 0xff7a1a][Math.floor(Math.random() * 5)];
  for (const x of [-0.13, 0.13]) k.add(box(0.2, 0.8, 0.22), 0x2c3e66, x, 0.4, 0);
  k.add(box(0.52, 0.66, 0.3), shirt, 0, 1.13, 0);
  k.add(box(0.15, 0.6, 0.16), shirt, -0.34, 1.15, 0);
  k.add(box(0.3, 0.3, 0.3), 0xe0b08a, 0, 1.64, 0);
  k.add(box(0.32, 0.1, 0.32), 0x4a3424, 0, 1.82, 0);
  return k.geometry();
}
function armGeo() { const k = new Kit(); k.add(box(0.15, 0.6, 0.16), 0xe0b08a, 0, 0.3, 0); return k.geometry(); }

export function createJobs(G) {
  const { scene, weather, car, S } = G;
  const rescues = [];
  let rainAcc = 0, hailAcc = 0, hailCd = 0, shotT = 0, q = 0, best = null;
  let rec = false, recT = 0, recVal = 0, live = false, liveT = 0, tvAcc = 0;
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd21a });
  const markerGeo = new THREE.OctahedronGeometry(0.45, 0);

  function daily() {
    const day = new Date().toLocaleDateString('en-CA');
    if (S.daily?.day === day) return S.daily;
    let h = [...day].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
    const pool = MISSIONS.slice(), list = [];
    while (list.length < 3) {
      const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0], i = Math.floor(rnd() * m.n.length), n = m.n[i];
      list.push({ id: m.id, n, have: 0, done: false, pay: Math.round(m.pay * n * (1 + i * 0.2) / 50) * 50 });
    }
    return (S.daily = { day, list });
  }
  const mText = m => MISSIONS.find(x => x.id === m.id).text(m.n);
  function stat(id, n = 1) {
    for (const m of daily().list) {
      if (m.id !== id || m.done) continue;
      m.have = Math.min(m.n, m.have + n);
      if (m.have >= m.n) { m.done = true; G.earn(m.pay, `✅ Daily mission: ${mText(m)}`); }
    }
  }
  const missionsHtml = () => daily().list.map(m => `<div class="mission${m.done ? ' done' : ''}"><span>${m.done ? '✅' : '🎯'}</span><div><b>${mText(m)}</b><i class="bar"><b style="width:${Math.round(m.have / m.n * 100)}%"></b></i><small>${m.id === 'km' ? m.have.toFixed(1) : m.have} / ${m.n}</small></div><em>$${m.pay}</em></div>`).join('');

  function toggleRec() {
    if (!S.gear.includes('video')) return G.toast('🎥 Buy a video camera at the dealership');
    rec = !rec;
    G.audio.rec();
    if (rec) { recT = 0; recVal = 0; G.toast('🎥 Recording…'); return; }
    if (recVal > 5) { G.earn(recVal, `🎥 Footage sold (${Math.round(recT)}s)`); G.stat('video'); }
    else G.toast('🎥 No tornado on tape');
  }

  function spawnRescue(x, z, ef) {
    const g = new THREE.Group(), arm = new THREE.Mesh(armGeo(), flatMat), mk = new THREE.Mesh(markerGeo, markerMat);
    g.add(new THREE.Mesh(personGeo(), flatMat), arm, mk);
    arm.position.set(0.34, 1.42, 0); mk.position.y = 3;
    g.position.set(x, G.world.heightAt(x, z), z);
    scene.add(g);
    rescues.push({ x, z, ef, g, arm, mk, t: 0 });
  }

  function onTornadoEnd(t) {
    if (S.gear.includes('anemometer') && t.peakWind > 20) {
      const mph = Math.round(t.peakWind * 2.237);
      let amt = 30 + Math.max(0, mph - 50) * 2.2, label = `💨 Peak wind ${mph} mph measured`;
      if (mph > (S.rec.wind || 0)) { S.rec.wind = mph; amt += 150; label += ' · NEW RECORD'; }
      G.earn(amt, label);
    }
    if (t.damage.length > 2 && t.kind !== 'devil') {
      const n = t.ef >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) { const d = t.damage[Math.floor((i + 0.3) / n * t.damage.length)]; spawnRescue(d.x - 5, d.z + 4, t.ef); }
      G.toast(`🆘 ${n} ${n > 1 ? 'people need' : 'person needs'} rescuing (yellow ◆ on map)`);
    }
  }

  function update(dt) {
    const gear = S.gear, mph = car.wind.speed * 2.237;
    G.stat('km', Math.abs(car.speed) * dt / 1000);
    if (mph >= 100 && !car.dead) G.stat('wind');

    // Gear: rain gauge, hail collector.
    if (gear.includes('gauge') && weather.info.rain > 0.35) { rainAcc += weather.info.rain * dt; if (rainAcc > 25) { rainAcc = 0; G.earn(70, '🌧️ Rainfall data sold'); } }
    if (gear.includes('hailbox') && weather.info.hail > 0.05) { hailAcc += weather.info.hail * dt * 3; if (hailAcc > 10) { hailAcc = 0; G.earn(110, '🧊 Hail samples sold'); } }

    // Storm reports (tornado on the ground near you, large hail).
    hailCd -= dt;
    if (weather.info.hail > 0.3 && hailCd <= 0) { hailCd = 300; G.earn(40, '📣 Storm report: large hail'); G.stat('report'); }
    for (const t of weather.tornadoes) {
      const d = Math.hypot(t.pos.x - car.pos.x, t.pos.z - car.pos.z);
      if (!t.reported && t.kind !== 'devil' && t.touch > 0.5 && d < 700) { t.reported = true; G.earn(50 + 30 * t.ef, `📣 Storm report: ${t.rating} tornado`); G.stat('report'); }
      if (d < t.R * 5) t.peakWind = Math.max(t.peakWind || 0, car.wind.speed);
      // Core punch: get inside the funnel and drive back out alive.
      if (car.dead) t.inCore = false;
      else if (t.touch > 0.6 && t.kind !== 'devil' && d < t.R * 0.7) t.inCore = true;
      else if (t.inCore && d > t.R * 1.4) {
        t.inCore = false;
        if (!t.punched) { t.punched = true; const amt = (250 + 180 * t.ef) * G.bonus(t); G.earn(amt, `🌀 CORE PUNCH ${t.rating}!`); G.stat('core'); G.note(t, 'core', amt); }
      }
    }

    // Video and live TV both need a tornado in shot (checked 4x a second).
    shotT -= dt;
    if (shotT <= 0) {
      shotT = 0.25;
      ({ best, q } = G.shot());
      if (rec && best) recVal += q * (20 + 18 * best.ef) * G.bonus(best) * 0.25 * (car.perk === 'camera' ? 1.5 : 1);
      const town = G.warnedTown();
      live = !!(town && best && q > 0.12 && best.pos.distanceTo(car.pos) < 1200);
      if (live) { tvAcc += (4 + 3 * best.ef) * Math.min(1, q * 2) * 0.25; if (liveT === 0) { G.toast(`📺 You're LIVE on TV over ${town.name}!`); G.stat('tv'); } }
    }
    const payTV = () => { if (tvAcc > 1) G.earn(tvAcc, '📺 TV station paid for live footage'); tvAcc = 0; };
    if (live) { liveT += dt; if (liveT > 15) { payTV(); liveT = 0.001; } }
    else if (liveT > 0) { payTV(); liveT = 0; }
    if (rec) { recT += dt; if (recT > 60) toggleRec(); }

    // Stranded people wave until you pull up next to them.
    for (let i = rescues.length - 1; i >= 0; i--) {
      const r = rescues[i];
      r.t += dt;
      r.arm.rotation.z = 2.6 + Math.sin(r.t * 8) * 0.5;
      r.mk.rotation.y += 2 * dt; r.mk.position.y = 3 + Math.sin(r.t * 3) * 0.25;
      r.g.rotation.y = Math.atan2(car.pos.x - r.x, car.pos.z - r.z);
      const near = Math.hypot(r.x - car.pos.x, r.z - car.pos.z) < 8 && Math.abs(car.speed) < 3 && !car.dead;
      if (near) { G.earn((150 + 50 * r.ef) * (car.perk === 'heal' ? 2 : 1), '🚑 Rescued a stranded person'); G.stat('rescue'); }
      if (near || r.t > 300) { scene.remove(r.g); rescues.splice(i, 1); }
    }

    G.setIndicator(rec ? `🔴 REC ${Math.floor(recT)}s · $${Math.round(recVal)}` : live ? '🔴 LIVE ON TV' : '');
  }
  return { update, stat, onTornadoEnd, toggleRec, missionsHtml, rescues, get rec() { return rec; } };
}
