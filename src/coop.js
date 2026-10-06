import * as THREE from 'three';
import { vehicleModel } from './car.js';
import { VEHICLES } from './vehicles.js';
import { probeModel } from './probes.js';

// Online co-op through a public MQTT relay over secure WebSockets. Every message goes via the relay,
// so it works across any networks (Wi-Fi, mobile data, different houses) with no direct connection needed.
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const topic = code => `tornadion/v2/game/${code}`;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const COLORS = ['#ff8a1f', '#2fd3c4', '#ff5fae', '#ffd21a'];
const enc = new TextEncoder(), dec = new TextDecoder();

// ---- tiny MQTT 3.1.1 client (QoS 0 publish/subscribe only) ----
function mqttConnect(url, clientId, onMessage, onClose) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url, 'mqtt'); } catch (e) { reject(e); return; }
    ws.binaryType = 'arraybuffer';
    const varLen = n => { const out = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return out; };
    const str = s => { const b = enc.encode(s), o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; };
    const packet = (type, parts) => {
      const total = parts.reduce((a, p) => a + p.length, 0), L = varLen(total), buf = new Uint8Array(1 + L.length + total);
      buf[0] = type; buf.set(L, 1);
      let o = 1 + L.length;
      for (const p of parts) { buf.set(p, o); o += p.length; }
      return buf;
    };
    let buf = new Uint8Array(0), ping = 0, ok = false, pid = 1;
    const timer = setTimeout(() => { if (!ok) { ws.close(); reject(new Error('timeout')); } }, 6000);
    const client = {
      subscribe(t) { ws.send(packet(0x82, [new Uint8Array([0, (pid++ % 250) + 1]), str(t), new Uint8Array([0])])); },
      publish(t, text) { if (ws.readyState === 1 && ws.bufferedAmount < 256000) ws.send(packet(0x30, [str(t), enc.encode(text)])); },
      close() { try { ws.send(new Uint8Array([0xe0, 0])); } catch {} ws.onclose = null; clearInterval(ping); ws.close(); },
    };
    ws.onopen = () => ws.send(packet(0x10, [str('MQTT'), new Uint8Array([4, 2, 0, 30]), str(clientId)]));
    ws.onmessage = e => {
      const d = new Uint8Array(e.data), nb = new Uint8Array(buf.length + d.length);
      nb.set(buf); nb.set(d, buf.length); buf = nb;
      while (buf.length >= 2) {
        let mul = 1, len = 0, i = 1, byte;
        do { if (i >= buf.length) return; byte = buf[i++]; len += (byte & 127) * mul; mul *= 128; } while (byte & 128);
        if (buf.length < i + len) return;
        const head = buf[0], body = buf.slice(i, i + len);
        buf = buf.slice(i + len);
        const type = head >> 4;
        if (type === 2) { // CONNACK
          clearTimeout(timer);
          if (body[1] !== 0) { ws.close(); reject(new Error('refused')); return; }
          ok = true;
          ping = setInterval(() => ws.readyState === 1 && ws.send(new Uint8Array([0xc0, 0])), 20000);
          resolve(client);
        } else if (type === 3) { // PUBLISH
          const tl = (body[0] << 8) | body[1], qos = (head >> 1) & 3;
          onMessage(dec.decode(body.subarray(2 + tl + (qos ? 2 : 0))));
        }
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => { clearInterval(ping); clearTimeout(timer); if (ok) onClose(); else reject(new Error('closed')); };
  });
}

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px "Lilita One", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(10,14,30,.7)'; g.beginPath(); g.roundRect(128 - w / 2, 6, w, 52, 16); g.fill();
  g.fillStyle = color; g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(6, 1.5, 1); s.position.y = 4.4;
  return s;
}

export function createCoop(G) {
  const { scene, car, weather, world, S } = G;
  const myId = 'p' + Math.random().toString(36).slice(2, 10);
  let mq = null, role = null, code = '', status = 'Not connected', live = false, hostId = null;
  let sendT = 0, wxT = 0, deadT = 0, probeT = 0, helloT = 0, joinT = 0, colorN = 0, lastProbeCount = 0, onChange = () => {};
  const players = new Map(), remoteProbes = new Map();
  const changed = () => onChange();

  function send(m) { if (mq && (live || m.t === 'hello' || m.t === 'bye')) { m.from = myId; mq.publish(topic(code), JSON.stringify(m)); } }
  function player(id, name) {
    let p = players.get(id);
    if (!p) {
      p = { name: name || 'Chaser', color: COLORS[colorN++ % COLORS.length], last: performance.now() };
      players.set(id, p);
      G.toast(`👥 ${p.name} joined the chase`);
      G.unlock('coop');
      changed();
    }
    p.last = performance.now();
    if (name && p.name !== name) { p.name = name; p.ghostKey = null; changed(); }
    return p;
  }
  function removePlayer(id, quiet) {
    const p = players.get(id);
    if (!p) return;
    if (p.ghost) scene.remove(p.ghost);
    players.delete(id);
    for (const [k, r] of remoteProbes) if (k.startsWith(id + ':')) { scene.remove(r.g); remoteProbes.delete(k); }
    if (!quiet) G.toast(`👥 ${p.name} left`);
    changed();
  }
  function goLive() {
    live = true;
    if (role === 'guest') { weather.remote = true; world.remote = true; status = `Connected to game ${code}`; G.toast(`👥 Joined game ${code}! Storms now come from the host.`); }
    changed();
  }

  function handle(m) {
    if (!m || m.from === myId || !role) return;
    if (role === 'guest' && !live && !(m.t === 'welcome' && m.to === myId) && !(m.t === 'car' && m.host)) return;
    if (m.t === 'bye') {
      if (m.from === hostId && role === 'guest') { leave(); status = 'The host ended the game'; changed(); G.toast('👥 The host ended the game'); }
      else removePlayer(m.from);
      return;
    }
    const p = player(m.from, m.n);
    switch (m.t) {
      case 'hello': if (role === 'host') send({ t: 'welcome', n: S.playerName, to: m.from }); break;
      case 'welcome': if (role === 'guest' && !live) { hostId = m.from; goLive(); } break;
      case 'car':
        if (role === 'guest' && !live) { hostId = m.from; goLive(); }
        if (!p.ghost || p.ghostKey !== `${m.v}:${m.p}:${p.name}`) {
          if (p.ghost) scene.remove(p.ghost);
          p.ghost = vehicleModel(VEHICLES.find(v => v.id === m.v) || VEHICLES[0], { paint: m.p });
          p.ghost.rotation.order = 'YXZ';
          p.ghost.position.set(m.x, m.y, m.z);
          p.ghost.add(nameSprite(p.name, p.color));
          scene.add(p.ghost);
          p.ghostKey = `${m.v}:${m.p}:${p.name}`;
        }
        Object.assign(p, { x: m.x, y: m.y, z: m.z, h: m.h, s: m.s, rx: m.rx, rz: m.rz });
        break;
      case 'wx': if (role === 'guest') weather.applySnapshot(m.s); break;
      case 'kill': if (role === 'guest') G.applyKill(m.i, m.tid); break;
      case 'dead': if (role === 'guest') world.syncDead(m.d, weather.clock); break;
      case 'probes': syncProbes(m.from, m.l); break;
      case 'evt': G.toast(`👥 ${p.name}: ${m.text}`); if (m.share > 0) G.earn(m.share, '👥 Team share'); break;
      case 'chat': G.chat(p.name, p.color, m.text); break;
      default: G.onNet?.(m, p);
    }
  }

  function syncProbes(owner, list) {
    const seen = new Set();
    for (const q of list) {
      const key = owner + ':' + q.u;
      seen.add(key);
      let r = remoteProbes.get(key);
      if (!r) { r = { g: probeModel(q.ty) }; r.g.position.set(q.x, q.y, q.z); scene.add(r.g); remoteProbes.set(key, r); }
      Object.assign(r, { x: q.x, y: q.y, z: q.z, ry: q.r, st: q.s });
    }
    for (const [k, r] of remoteProbes) if (k.startsWith(owner + ':') && !seen.has(k)) { scene.remove(r.g); remoteProbes.delete(k); }
  }

  async function connect() {
    for (const url of BROKERS) {
      try { return await mqttConnect(url, myId, text => { try { handle(JSON.parse(text)); } catch {} }, dropped); } catch {}
    }
    throw new Error('no relay');
  }
  function dropped() { if (!role) return; const was = code; leave(); status = `Lost connection to the co-op server (game ${was}). Try again.`; changed(); }

  async function host() {
    leave();
    role = 'host'; status = 'Starting…';
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    changed();
    try {
      const c = await connect();
      if (role !== 'host') return c.close();
      mq = c; mq.subscribe(topic(code)); live = true;
      status = 'Hosting: waiting for friends';
    } catch { role = null; code = ''; status = 'Couldn\'t reach the co-op server. Check your internet and try again.'; }
    changed();
  }
  async function join(c) {
    c = (c || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (c.length !== 4) { status = 'Codes are 4 letters'; changed(); return; }
    leave();
    role = 'guest'; code = c; status = 'Connecting to the co-op server…';
    changed();
    try {
      const m = await connect();
      if (role !== 'guest' || code !== c) return m.close();
      mq = m; mq.subscribe(topic(code));
      status = `Looking for game ${code}…`; helloT = 0.3; joinT = 12;
    } catch { role = null; code = ''; status = 'Couldn\'t reach the co-op server. Check your internet and try again.'; }
    changed();
  }
  function leave() {
    if (mq) { send({ t: 'bye' }); const m = mq; setTimeout(() => m.close(), 150); }
    for (const id of [...players.keys()]) removePlayer(id, true);
    for (const r of remoteProbes.values()) scene.remove(r.g);
    remoteProbes.clear();
    mq = null; role = null; code = ''; live = false; hostId = null; status = 'Not connected';
    weather.remote = false; weather.synced = false; world.remote = false;
    changed();
  }

  function update(dt) {
    if (!role || !mq) return;
    const now = performance.now();
    if (role === 'guest' && !live) { // keep saying hello until the host answers
      helloT -= dt; joinT -= dt;
      if (helloT <= 0) { helloT = 1.5; send({ t: 'hello', n: S.playerName }); }
      if (joinT <= 0) { const c = code; leave(); status = `No game found with code ${c}. Check the code and that the host is still hosting.`; changed(); }
      return;
    }
    const k = Math.min(1, dt * 8);
    for (const [id, p] of players) {
      if (now - p.last > 10000) {
        if (id === hostId && role === 'guest') { leave(); status = 'Lost the host (no signal for 10 seconds)'; changed(); return; }
        removePlayer(id); continue;
      }
      if (!p.ghost || p.x == null) continue;
      const g = p.ghost.position;
      if (Math.hypot(g.x - p.x, g.z - p.z) > 60) g.set(p.x, p.y, p.z);
      else { g.x += (p.x - g.x) * k; g.y += (p.y - g.y) * k; g.z += (p.z - g.z) * k; }
      const a = p.h - p.ghost.rotation.y;
      p.ghost.rotation.set(p.rx || 0, p.ghost.rotation.y + Math.atan2(Math.sin(a), Math.cos(a)) * k, p.rz || 0);
      for (const w of p.ghost.userData.wheels) w.rotation.x += (p.s || 0) / 0.62 * dt;
    }
    for (const r of remoteProbes.values()) { const q = r.g.position; q.x += (r.x - q.x) * k; q.y += (r.y - q.y) * k; q.z += (r.z - q.z) * k; r.g.rotation.y = r.ry || 0; }

    sendT -= dt;
    if (sendT <= 0) {
      sendT = 0.1;
      send({ t: 'car', n: S.playerName, host: role === 'host', v: S.vehicle, p: G.cust().paint ?? null, x: +car.pos.x.toFixed(2), y: +car.pos.y.toFixed(2), z: +car.pos.z.toFixed(2), h: +car.heading.toFixed(3), s: +car.speed.toFixed(1), rx: +car.tilt.x.toFixed(2), rz: +car.tilt.y.toFixed(2) });
    }
    probeT -= dt;
    if (probeT <= 0) {
      probeT = 0.25;
      const list = G.probes.list.map(q => ({ u: q.uid, ty: q.id, x: +q.pos.x.toFixed(1), y: +q.pos.y.toFixed(1), z: +q.pos.z.toFixed(1), r: +q.group.rotation.y.toFixed(2), s: q.state }));
      if (list.length || lastProbeCount) send({ t: 'probes', l: list });
      lastProbeCount = list.length;
    }
    if (role === 'host') {
      wxT -= dt; deadT -= dt;
      if (wxT <= 0) { wxT = 0.25; send({ t: 'wx', s: weather.snapshot() }); }
      if (deadT <= 0) { deadT = 2; send({ t: 'dead', d: world.deadList() }); }
    }
  }

  return {
    host, join, leave, update, send,
    set onChange(f) { onChange = f; },
    get role() { return role; }, get code() { return code; }, get status() { return status; }, get live() { return live && !!role; },
    get players() { return [...players.values()]; },
    friends: () => [...players.values()].filter(p => p.ghost).map(p => ({ x: p.ghost.position.x, z: p.ghost.position.z, h: p.ghost.rotation.y, name: p.name, color: p.color })),
    probeDots: () => [...remoteProbes.values()].map(r => ({ pos: r.g.position, state: r.st })),
    nearFriend: () => [...players.values()].some(p => p.ghost && Math.hypot(p.ghost.position.x - car.pos.x, p.ghost.position.z - car.pos.z) < 300),
  };
}
