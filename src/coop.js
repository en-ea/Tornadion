import * as THREE from 'three';
import Peer from 'peerjs';
import { vehicleModel } from './car.js';
import { VEHICLES } from './vehicles.js';

// Online co-op over WebRTC (PeerJS's free public broker, so it works on static hosting).
// The host simulates the weather and streams it to guests; everyone streams their own car.
const PREFIX = 'tornadion-v1-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const COLORS = ['#ff8a1f', '#2fd3c4', '#ff5fae', '#ffd21a'];
// STUN finds a direct route; the TURN relays are the fallback when home routers or mobile data block direct connections.
const PEER_OPTS = { debug: 1, config: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
] } };

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
  const { scene, car, weather, S } = G;
  let peer = null, conns = [], role = null, code = '', status = 'Not connected', myId = null, sendT = 0, wxT = 0, colorN = 0;
  const players = new Map();
  let onChange = () => {};
  const changed = () => onChange();

  function broadcast(m, except) { for (const c of conns) if (c !== except && c.open) c.send(m); }
  function removePlayer(id) {
    const p = players.get(id);
    if (!p) return;
    if (p.ghost) scene.remove(p.ghost);
    players.delete(id);
    G.toast(`👥 ${p.name} left`);
    changed();
  }
  function player(id, name, conn) {
    let p = players.get(id);
    if (!p) {
      p = { name, color: COLORS[colorN++ % COLORS.length], conn };
      players.set(id, p);
      G.toast(`👥 ${name} joined the chase`);
      G.unlock('coop');
      changed();
    }
    return p;
  }
  function onMsg(conn, m) {
    if (m.t === 'hello') {
      const p = player(m.id, m.n, conn);
      if (p.name !== m.n) { p.name = m.n; changed(); }
      if (role === 'host') { broadcast(m, conn); conn.send({ t: 'hello', id: myId, n: S.playerName }); for (const [id, q] of players) if (id !== m.id) conn.send({ t: 'hello', id, n: q.name }); }
      return;
    }
    if (m.t === 'car') {
      const p = player(m.id, m.n, conn);
      if (!p.ghost || p.veh !== m.v || p.paint !== m.p || p.name !== m.n) {
        if (p.ghost) scene.remove(p.ghost);
        p.ghost = vehicleModel(VEHICLES.find(v => v.id === m.v) || VEHICLES[0], { paint: m.p });
        p.ghost.rotation.order = 'YXZ';
        p.ghost.position.set(m.x, m.y, m.z);
        p.ghost.add(nameSprite(m.n, p.color));
        scene.add(p.ghost);
        Object.assign(p, { veh: m.v, paint: m.p, name: m.n });
        changed();
      }
      Object.assign(p, { conn, x: m.x, y: m.y, z: m.z, h: m.h, s: m.s, rx: m.rx, rz: m.rz });
      if (role === 'host') broadcast(m, conn);
    } else if (m.t === 'wx' && role === 'guest') weather.applySnapshot(m.s);
    else if (m.t === 'bye') removePlayer(m.id);
  }
  let joinTimer = 0;
  function setup(c) {
    c.on('open', () => {
      conns.push(c);
      clearTimeout(joinTimer);
      c.send({ t: 'hello', id: myId, n: S.playerName });
      if (role === 'guest') { status = `Connected to game ${code}`; weather.remote = true; G.toast(`👥 Joined game ${code}! Storms now come from the host.`); }
      changed();
    });
    c.on('error', e => { if (role === 'guest') { const msg = `Couldn't connect (${e.type || 'network'}). Try again, or try both on the same Wi-Fi.`; leave(); status = msg; changed(); } });
    // Show what the connection is doing so it never just sits on "Connecting…".
    setTimeout(() => c.peerConnection?.addEventListener('iceconnectionstatechange', () => {
      const st = c.peerConnection.iceConnectionState;
      if (role === 'guest' && !c.open && st === 'checking') { status = 'Found the game, linking up…'; changed(); }
      if (role === 'guest' && st === 'failed') { leave(); status = 'Connection blocked by the network. Try both devices on the same Wi-Fi, or switch the phone to mobile data.'; changed(); }
    }), 0);
    c.on('data', m => onMsg(c, m));
    c.on('close', () => {
      conns = conns.filter(x => x !== c);
      for (const [id, p] of players) if (p.conn === c) removePlayer(id);
      if (role === 'guest') { G.toast('👥 Lost connection to the host'); leave(); }
      changed();
    });
  }
  function host() {
    leave();
    role = 'host'; status = 'Starting…';
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    peer = new Peer(PREFIX + code, PEER_OPTS);
    peer.on('open', id => { myId = id; status = 'Hosting: waiting for friends'; changed(); });
    peer.on('connection', c => { if (conns.length >= 3) c.on('open', () => c.close()); else setup(c); });
    peer.on('error', e => { if (e.type === 'unavailable-id') return host(); status = `Problem: ${e.type}`; changed(); });
    peer.on('disconnected', () => peer && !peer.destroyed && peer.reconnect());
    changed();
  }
  function join(c) {
    c = (c || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (c.length !== 4) { status = 'Codes are 4 letters'; changed(); return; }
    leave();
    role = 'guest'; code = c; status = 'Contacting the game server…';
    peer = new Peer(PEER_OPTS);
    peer.on('open', id => {
      myId = id; status = `Looking for game ${code}…`; changed();
      setup(peer.connect(PREFIX + code, { reliable: true }));
      joinTimer = setTimeout(() => { if (role === 'guest' && !conns.length) { leave(); status = 'Timed out. Check the code, make sure the host is still hosting, then try again.'; changed(); } }, 20000);
    });
    peer.on('error', e => {
      const msg = e.type === 'peer-unavailable' ? `No game found with code ${code}` : `Problem: ${e.type}`;
      leave(); status = msg; changed();
    });
    changed();
  }
  function leave() {
    clearTimeout(joinTimer);
    if (myId) broadcast({ t: 'bye', id: myId });
    for (const c of conns) c.close();
    peer?.destroy();
    for (const id of [...players.keys()]) { const p = players.get(id); if (p.ghost) scene.remove(p.ghost); players.delete(id); }
    peer = null; conns = []; role = null; myId = null; code = ''; status = 'Not connected';
    weather.remote = false; weather.synced = false;
    changed();
  }

  const _h = { a: 0 };
  function update(dt) {
    if (!role) return;
    const k = Math.min(1, dt * 8);
    for (const p of players.values()) {
      if (!p.ghost) continue;
      const g = p.ghost.position;
      if (Math.hypot(g.x - p.x, g.z - p.z) > 60) g.set(p.x, p.y, p.z);
      else { g.x += (p.x - g.x) * k; g.y += (p.y - g.y) * k; g.z += (p.z - g.z) * k; }
      _h.a = p.h - p.ghost.rotation.y;
      p.ghost.rotation.set(p.rx || 0, p.ghost.rotation.y + Math.atan2(Math.sin(_h.a), Math.cos(_h.a)) * k, p.rz || 0);
      for (const w of p.ghost.userData.wheels) w.rotation.x += (p.s || 0) / 0.62 * dt;
    }
    sendT -= dt;
    if (sendT <= 0 && conns.length && myId) {
      sendT = 0.1;
      broadcast({ t: 'car', id: myId, n: S.playerName, v: S.vehicle, p: G.cust().paint ?? null, x: car.pos.x, y: car.pos.y, z: car.pos.z, h: car.heading, s: car.speed, rx: car.tilt.x, rz: car.tilt.y });
    }
    if (role === 'host') { wxT -= dt; if (wxT <= 0 && conns.length) { wxT = 0.25; broadcast({ t: 'wx', s: weather.snapshot() }); } }
  }

  return {
    host, join, leave, update,
    set onChange(f) { onChange = f; },
    get role() { return role; }, get code() { return code; }, get status() { return status; },
    get players() { return [...players.values()]; },
    friends: () => [...players.values()].filter(p => p.ghost).map(p => ({ x: p.ghost.position.x, z: p.ghost.position.z, h: p.ghost.rotation.y, name: p.name, color: p.color })),
    nearFriend: () => [...players.values()].some(p => p.ghost && Math.hypot(p.ghost.position.x - car.pos.x, p.ghost.position.z - car.pos.z) < 300),
  };
}
