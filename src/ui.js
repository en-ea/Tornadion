import { VEHICLES, UPGRADES, PAINTS, DECALS, HORNS, GEAR } from './vehicles.js';
import { PROBE_TYPES } from './probes.js';

const $ = id => document.getElementById(id);
const fmt = n => '$' + Math.round(n).toLocaleString();
const hex = c => '#' + c.toString(16).padStart(6, '0');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 5 ? 'just now' : s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };
const PERK = { heal: '🩹 Repairs itself · rescues pay ×2', radar: '📡 Long-range radar · +25% probe pay', camera: '🎥 Photos pay ×1.5', science: '🔬 +40% probe data pay' };
const EF_DESC = ['65-85 mph · branches broken, shingles off', '86-110 mph · roofs peeled, mobile homes pushed', '111-135 mph · roofs torn off, big trees snapped', '136-165 mph · walls collapse, cars lifted', '166-200 mph · houses levelled, cars thrown', '200+ mph · strong buildings swept clean'];

const TUTORIAL = [
  { text: '👋 Welcome, chaser! <b>Drag on the left half of the screen</b> to drive. <small>PC: WASD / arrow keys</small>', hl: ['stick'], done: s => s.drove > 40 },
  { text: '🔥 Hold <b>BOOST</b> to fire your jet booster. <small>PC: Shift</small>', hl: ['b-boost'], done: s => s.boostT > 0.6 },
  { text: '📡 This is your <b>radar</b>. Storms show as coloured blobs, tornadoes as red circles. <b>Tap it</b> to open the big map. <small>PC: M</small>', hl: ['radar'], done: (s, G) => G.radar.big },
  { text: '🗺️ On the map: ⛽ refuel + restock probes, 🔧 repair, 🚗 dealership. <b>Tap the map</b> again to close it.', hl: ['radar'], done: (s, G) => !G.radar.big },
  { text: '🧭 The bar at the top always shows the nearest storm or tornado, how far it is and which way to drive.', hl: ['tinfo'], next: true },
  { text: '🎈 Drop a <b>PROBE</b> in a tornado\'s path to earn money (closer = more). Try dropping one now. <small>PC: E</small>', hl: ['b-probe'], done: (s, G) => G.probes.list.length > 0 },
  { text: '📦 Now tap <b>PROBE</b> again while you\'re next to it to pick it back up.', hl: ['b-probe'], done: (s, G) => G.probes.list.length === 0 },
  { text: '📷 <b>PHOTO</b> snaps tornadoes for cash. <b>ZOOM</b> gives you binoculars for better shots. <small>PC: C / Z</small>', hl: ['b-photo', 'b-zoom'], next: true },
  { text: '⚓ <b>ANCHOR</b> drives spikes into the ground so the wind can\'t fling you. Stop first, then tap it. <small>PC: F</small>', hl: ['b-anchor'], done: (s, G) => !G.car.canAnchor || G.car.anchored },
  { text: '⚓ Tap <b>ANCHOR</b> again to pull the spikes up and drive on.', hl: ['b-anchor'], done: (s, G) => !G.car.anchored },
  { text: '☰ The menu has daily missions, achievements, settings and saving. A storm will form soon. <b>Good luck out there!</b>', hl: ['menu-btn'], next: true },
];

export function createUI(G) {
  const { S, audio } = G;
  let modal = null;

  // ---------- generic modal window with tabs ----------
  function openModal(m) {
    modal = m;
    m.tab ??= m.tabs?.[0]?.id;
    G.setPaused(true);
    $('modal').classList.remove('hidden');
    render(true);
  }
  function closeModal() {
    if (!modal) return;
    const m = modal;
    modal = null;
    $('modal').classList.add('hidden');
    G.persist();
    m.onClose?.();
    G.setPaused(false);
  }
  function render(top) {
    if (!modal) return;
    const body = $('m-body'), y = body.scrollTop, tabs = modal.tabs || [];
    $('m-title').textContent = modal.title;
    $('m-money').textContent = modal.money ? fmt(S.money) : '';
    $('m-close').style.display = modal.closable === false ? 'none' : '';
    $('m-tabs').style.display = tabs.length > 1 ? '' : 'none';
    $('m-tabs').innerHTML = tabs.map(t => `<button data-tab="${t.id}" class="${t.id === modal.tab ? 'on' : ''}">${t.label}</button>`).join('');
    const tab = tabs.find(t => t.id === modal.tab);
    body.innerHTML = tab ? tab.render() : modal.body();
    body.scrollTop = top ? 0 : y;
    $('m-foot').innerHTML = modal.foot || '';
    $('m-foot').style.display = modal.foot ? '' : 'none';
  }
  $('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') { if (modal?.closable !== false) closeModal(); return; }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.id === 'm-close') return closeModal();
    if (b.dataset.tab) { modal.tab = b.dataset.tab; render(true); return; }
    const f = ACT[b.dataset.act];
    if (f) { f(b.dataset, b); render(); }
  });
  $('modal').addEventListener('change', e => { const f = CHANGE[e.target.dataset.change]; if (f) { f(e.target); render(); } });
  $('modal').addEventListener('input', e => { if (e.target.dataset.input === 'musicVol') { S.musicVol = +e.target.value; audio.setMusic(S.music, S.musicVol); } });

  // ---------- tab contents ----------
  const toggle = (id, label, on, sub = '') => `<label class="set"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-change="${id}" ${on ? 'checked' : ''}><i class="tgl"></i></label>`;
  const chip = (act, v, label, on) => `<button data-act="${act}" data-v="${v}" class="chip${on ? ' on' : ''}">${label}</button>`;
  const statBar = (label, v) => `<div class="sbar"><small>${label}</small><i><b style="width:${Math.round(Math.min(1, v) * 100)}%"></b></i></div>`;

  const TABS = {
    missions: ['📅 Missions', () => `<p class="muted">Three new missions every day. The reward is paid as soon as you finish one.</p>${G.jobs.missionsHtml()}`],
    ach: ['🏆 Achievements', () => G.progress.achievementsHtml()],
    records: ['📊 Records', () => G.progress.recordsHtml()],
    log: ['📖 Chase log', () => G.progress.logHtml()],
    album: ['🖼️ Photos', () => G.progress.albumHtml()],
    settings: ['⚙️ Settings', () => `
      <h4>Sound</h4>
      ${toggle('sound', 'Sound', S.sound)}
      ${toggle('music', 'Music', S.music, 'Calm while cruising, intense near tornadoes')}
      <label class="set"><span>Music volume</span><input type="range" min="0" max="1" step="0.05" value="${S.musicVol}" data-input="musicVol"></label>
      <h4>Graphics</h4>
      <div class="set"><span>Quality<small>Lower runs smoother on older phones</small></span><div class="seg">${['low', 'medium', 'high'].map(q => `<button data-act="quality" data-v="${q}" class="${S.quality === q ? 'on' : ''}">${q}</button>`).join('')}</div></div>
      ${toggle('shadows', 'Shadows', S.shadows)}
      <h4>Gameplay</h4>
      ${toggle('relaxed', 'Relaxed mode', S.relaxed, 'Your vehicle takes no damage')}
      <div class="set"><span>Tutorial<small>Shows the basics again</small></span><button data-act="tutorial">Play tutorial</button></div>
      <div class="set"><span>Full screen<small>Tip: add Tornadion to your home screen to always open full screen</small></span><button data-act="fullscreen">${document.fullscreenElement ? 'Exit full screen' : 'Go full screen'}</button></div>`],
    save: ['💾 Save', () => `
      <p>Progress saves automatically on this device every few seconds${S.savedAt ? ` · last save <b>${ago(S.savedAt)}</b>` : ''}.</p>
      <button data-act="saveNow" class="primary">💾 Save now</button>
      <h4>Back up or move to another device</h4>
      <div class="row"><button data-act="download">⬇️ Download save file</button><button data-act="copy">📋 Copy save code</button></div>
      <h4>Load a save</h4>
      <div class="row"><button data-act="upload">⬆️ Load save file</button></div>
      <textarea id="imp" placeholder="…or paste a save code here"></textarea>
      <button data-act="importCode">Load pasted code</button>
      <h4 class="red">Danger zone</h4>
      <button data-act="reset" class="danger">🗑️ Reset all progress</button>`],
    coop: ['👥 Co-op', () => {
      const c = G.coop;
      let main = '';
      if (!c.role) main = `<div class="two">
        <div class="box"><b>Host a game</b><small>You get a 4-letter code to send to friends.</small><button data-act="host" class="primary">Host game</button></div>
        <div class="box"><b>Join a game</b><small>Type the code your friend got.</small><input id="join-code" maxlength="4" placeholder="ABCD" autocapitalize="characters" autocomplete="off"><button data-act="join" class="primary">Join</button></div></div>`;
      else main = `<div class="codebox"><small>${c.role === 'host' ? 'Your game code' : 'Connected to game'}</small><b>${c.code || '…'}</b>${c.role === 'host' ? '<button data-act="copyCode">📋 Copy code</button>' : ''}</div>
        ${c.role === 'host' ? '<p class="muted">Friends: open Tornadion → Co-op → Join, and type this code.</p>' : ''}
        <h4>Players</h4><ul class="plist"><li>⭐ ${esc(S.playerName)} (you${c.role === 'host' ? ', host' : ''})</li>${c.players.map(p => `<li><span style="color:${p.color}">●</span> ${esc(p.name)}</li>`).join('')}</ul>
        <button data-act="leave" class="danger">${c.role === 'host' ? 'Stop hosting' : 'Leave game'}</button>`;
      return `<label class="set"><span>Your name</span><input id="pname" maxlength="16" value="${esc(S.playerName)}" data-change="pname"></label>
        <p class="status">${esc(c.status)}</p>${main}
        <p class="muted">Chase together over the internet from anywhere (Wi-Fi or mobile data, up to 4 players). Storms, tornado damage, damage surveys and rescues are shared, you can see each other's probes, and everyone gets a 25% team share of each probe hit. Everyone keeps their own money, vehicles and progress. Chasing within 300 m of a friend gives <b>+10% money</b>. Chat with 💬 (PC: T).</p>`;
    }],
    help: ['❓ How to play', () => `
      <div class="help">
      <p><b>🎯 Goal:</b> find supercells, intercept their tornadoes and earn money from data, photos and rescues. Spend it on better vehicles, upgrades and gear.</p>
      <p><b>🧭 Finding storms:</b> follow the bar at the top of the screen or the radar. Tornadoes drop from the dark rotating wall cloud.</p>
      <p><b>🎈 Probes:</b> drop them in the tornado's path. Closer to the centre = more money. 🔁 switches probe type.</p>
      <p><b>📷 Photos & 🎥 video:</b> fill the frame (ZOOM helps). Rain-wrapped tornadoes are hard to shoot; rope-outs pay extra.</p>
      <p><b>⚓ Anchor:</b> stops you being flung by strong wind. Get into the core and out again for a 🌀 core-punch bonus.</p>
      <p><b>📋 After a tornado:</b> orange flags are damage surveys (rate the EF), yellow ◆ are people to rescue.</p>
      <p><b>⛽ 🔧 🚗</b> Gas stations refuel and restock probes, repair shops fix damage, the dealership sells vehicles, upgrades, gear and customising.</p>
      <p><b>PC keys:</b> WASD drive · Shift boost · Space brake · E probe · Q probe type · F anchor · C photo · V video · Z zoom · H horn · M map · Esc menu</p>
      </div>`],
  };
  const tabs = ids => ids.map(id => ({ id, label: TABS[id][0], render: TABS[id][1] }));

  // ---------- dealership ----------
  const SHOP = [
    { id: 'veh', label: '🚗 Vehicles', render: () => `<p class="muted">Buy a vehicle once, then swap between your vehicles here any time.</p><div class="vgrid">` + VEHICLES.slice().sort((a, b) => a.price - b.price).map(v => {
      const own = S.owned.includes(v.id), cur = v.id === S.vehicle, afford = S.money >= v.price;
      const tags = [v.anchor && '⚓ Anchor', v.jet && '🔥 Jet booster', v.hailproof && '🧊 Hail-proof', PERK[v.perk]].filter(Boolean);
      const btn = cur ? '<button disabled class="cur">✔ Driving</button>' : own ? `<button data-act="drive" data-v="${v.id}" class="primary">Drive this</button>`
        : `<button data-act="buy" data-v="${v.id}" class="buy" ${afford ? '' : 'disabled'}>${afford ? 'Buy' : '🔒'} ${fmt(v.price)}</button>`;
      return `<div class="vcard${cur ? ' cur' : ''}"><img class="vimg" alt="" src="${G.vehicleThumb(v, own ? S.cust[v.id] || {} : {})}"><div class="vtop"><b>${esc((own && S.cust[v.id]?.name) || v.name)}</b>${own ? '<span class="pill">OWNED</span>' : ''}</div><small>${v.desc}</small>
        ${statBar('Speed', v.top / 40)}${statBar('Toughness', v.hp * v.armor / 1240)}${statBar('Weight (resists wind)', v.mass / 3.8)}${statBar(`Probes (${v.probes})`, v.probes / 6)}
        <div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>${btn}</div>`;
    }).join('') + '</div>' },
    { id: 'cust', label: '🎨 Customise', render: () => {
      const c = G.cust(), v = G.vdef();
      return `<div class="cust-top"><img class="vimg" alt="" src="${G.vehicleThumb(v, c)}"><p class="muted">Customising <b>${esc(G.vname())}</b>, the vehicle you're driving. Customising is free. Decals and the light bar show on the vehicle itself.</p></div>
        <h4>Name</h4><input id="c-name" maxlength="20" placeholder="${esc(v.name)}" value="${esc(c.name || '')}" data-change="cname">
        <h4>Paint</h4><div class="swatches">${PAINTS.map(p => `<button data-act="paint" data-v="${p}" class="swatch${(c.paint ?? null) === p ? ' on' : ''}" style="background:${p == null ? 'linear-gradient(135deg,#e8e8e8 50%,#777 50%)' : hex(p)}" title="${p == null ? 'Factory colours' : ''}"></button>`).join('')}</div>
        <small class="muted">The first swatch puts the factory colours back.</small>
        <h4>Decal</h4><div class="chips">${DECALS.map(([id, n]) => chip('decal', id, n, (c.decal || 'none') === id)).join('')}</div>
        <h4>Horn <small class="muted">(tap to hear it)</small></h4><div class="chips">${HORNS.map(([id, n]) => chip('horn', id, '🔊 ' + n, (c.horn || 'classic') === id)).join('')}</div>
        <h4>Roof light bar</h4><div class="chips">${chip('bar', 0, 'Off', !c.bar)}${chip('bar', 1, '🚨 On', !!c.bar)}</div>`;
    } },
    { id: 'up', label: '🔧 Upgrades', render: () => '<p class="muted">Upgrades apply to every vehicle you own.</p>' + UPGRADES.map(u => {
      const lvl = S.up[u.id] || 0, max = lvl >= u.prices.length, price = u.prices[lvl];
      return `<div class="urow"><div><b>${u.name}</b><small>${u.desc}</small><div class="pips">${u.prices.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        ${max ? '<button disabled class="cur">MAX</button>' : `<button data-act="up" data-v="${u.id}" class="buy" ${S.money >= price ? '' : 'disabled'}>${fmt(price)}</button>`}</div>`;
    }).join('') },
    { id: 'gear', label: '🎒 Probes & gear', render: () => {
      const probe = p => {
        const own = !p.price || S.gear.includes(p.id), sel = S.ptype === p.id;
        const btn = sel ? '<button disabled class="cur">✔ Selected</button>' : own ? `<button data-act="ptype" data-v="${p.id}" class="primary">Select</button>` : `<button data-act="gear" data-v="${p.id}" class="buy" ${S.money >= p.price ? '' : 'disabled'}>${fmt(p.price)}</button>`;
        return `<div class="urow"><div><b>${p.icon} ${p.name}</b><small>${p.desc}</small></div>${btn}</div>`;
      };
      const gear = g => `<div class="urow"><div><b>${g.name}</b><small>${g.desc}</small></div>${S.gear.includes(g.id) ? '<button disabled class="cur">✔ Owned</button>' : `<button data-act="gear" data-v="${g.id}" class="buy" ${S.money >= g.price ? '' : 'disabled'}>${fmt(g.price)}</button>`}</div>`;
      return `<p class="muted">All probe types share your probe slots. Switch type in the field with 🔁 (PC: Q).</p><h4>Probe types</h4>${PROBE_TYPES.map(probe).join('')}<h4>Gear</h4>${GEAR.map(gear).join('')}`;
    } },
  ];

  // ---------- actions ----------
  const ACT = {
    resume: () => closeModal(),
    quit: () => { closeModal(); showTitle(); },
    tutorial: () => { closeModal(); startGame(true); },
    quality: d => { S.quality = d.v; G.applyGraphics(); },
    fullscreen: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => G.toast('Full screen is not supported here. Use Add to Home Screen instead.')); setTimeout(render, 300); },
    saveNow: () => { G.persist(); G.toast('💾 Game saved'); },
    download: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([G.exportSave()], { type: 'application/json' }));
      a.download = `tornadion-save-${new Date().toLocaleDateString('en-CA')}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      G.toast('⬇️ Save file downloaded');
    },
    copy: () => { navigator.clipboard?.writeText(G.exportCode()).then(() => G.toast('📋 Save code copied'), () => prompt('Copy your save code:', G.exportCode())); },
    upload: () => $('imp-file').click(),
    importCode: () => G.importSave($('imp').value),
    reset: () => { if (confirm('Delete ALL progress (money, vehicles, achievements)? This can\'t be undone.')) G.resetSave(); },
    host: () => G.coop.host(),
    join: () => G.coop.join($('join-code').value),
    leave: () => G.coop.leave(),
    copyCode: () => navigator.clipboard?.writeText(G.coop.code).then(() => G.toast('📋 Code copied')),
    // dealership
    buy: d => { const v = VEHICLES.find(x => x.id === d.v); if (S.money < v.price) return; S.money -= v.price; S.owned.push(v.id); S.vehicle = v.id; G.applyVehicle(); audio.cash(); G.toast(`🚗 Bought the ${v.name}!`, 'gold'); },
    drive: d => { S.vehicle = d.v; G.applyVehicle(); G.toast(`Now driving ${G.vname()}`); },
    up: d => { const u = UPGRADES.find(x => x.id === d.v), lvl = S.up[u.id] || 0; if (S.money < u.prices[lvl]) return; S.money -= u.prices[lvl]; S.up[u.id] = lvl + 1; G.applyVehicle(); audio.cash(); G.toast(`🔧 ${u.name} level ${lvl + 1}`); },
    gear: d => { const g = [...PROBE_TYPES, ...GEAR].find(x => x.id === d.v); if (S.money < g.price) return; S.money -= g.price; S.gear.push(g.id); if (g.icon) S.ptype = g.id; audio.cash(); G.toast(`🛒 Bought ${g.name}`); },
    ptype: d => { S.ptype = d.v; },
    paint: d => { G.cust().paint = d.v === 'null' ? null : +d.v; G.applyVehicle(); },
    decal: d => { G.cust().decal = d.v; G.applyVehicle(); },
    horn: d => { G.cust().horn = d.v; audio.setHorn(d.v); audio.honk(); },
    bar: d => { G.cust().bar = d.v === '1'; G.applyVehicle(); },
    rate: d => { const m = modal; closeModal(); m.onRate(+d.v); },
  };
  const CHANGE = {
    sound: el => { S.sound = el.checked; audio.setEnabled(S.sound); },
    music: el => { S.music = el.checked; audio.setMusic(S.music, S.musicVol); },
    shadows: el => { S.shadows = el.checked; G.applyGraphics(); },
    relaxed: el => { S.relaxed = G.car.relaxed = el.checked; },
    pname: el => { S.playerName = el.value.trim().slice(0, 16) || 'Chaser'; },
    cname: el => { G.cust().name = el.value.trim().slice(0, 20); },
  };
  $('imp-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) f.text().then(G.importSave); e.target.value = ''; });
  G.coop.onChange = () => { if (modal?.tab === 'coop') render(); coopPill(); };
  function coopPill() {
    const c = G.coop, el = $('coop-pill');
    el.style.display = c.role ? '' : 'none';
    el.textContent = c.role ? `👥 ${c.code} · ${c.players.length + 1} player${c.players.length ? 's' : ''}` : '';
  }

  // ---------- title screen ----------
  function showTitle() {
    S.mode = 'title';
    G.setPaused(true);
    $('hud').classList.add('hidden');
    $('title').classList.remove('hidden');
    tut.stop();
    const fresh = !S.started;
    $('t-play').innerHTML = fresh ? '▶ PLAY' : '▶ CONTINUE';
    $('t-tut').classList.toggle('glow', !S.tutorialDone);
    $('t-badge').style.display = !S.tutorialDone ? '' : 'none';
    $('t-sub').textContent = fresh ? 'Chase supercells. Probe tornadoes. Get rich (or flung).' : `${fmt(S.money)} · Level ${G.level()} · ${VEHICLES.filter(v => S.owned.includes(v.id)).length} vehicle(s)`;
  }
  function startGame(withTutorial) {
    // On phones, go full screen (and lock landscape where supported) when play starts.
    const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
    if (matchMedia('(pointer: coarse)').matches && !standalone && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
    S.mode = 'play'; S.started = true;
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.setPaused(false);
    if (withTutorial) tut.start();
    G.persist();
  }
  $('t-play').onclick = () => startGame(false);
  $('t-tut').onclick = () => startGame(true);
  $('t-coop').onclick = () => openModal({ title: '👥 Co-op', tabs: tabs(['coop']) });
  $('t-prog').onclick = () => openModal({ title: '🏆 Progress', tabs: tabs(['ach', 'records', 'log', 'album', 'missions']) });
  $('t-set').onclick = () => openModal({ title: '⚙️ Settings', tabs: tabs(['settings', 'help']) });
  $('t-save').onclick = () => openModal({ title: '💾 Save data', tabs: tabs(['save']) });
  $('menu-btn').onclick = () => openPause();
  addEventListener('keydown', e => {
    if (e.code !== 'Escape' || S.mode !== 'play') return;
    if (modal) { if (modal.closable !== false) closeModal(); } else openPause();
  });
  function openPause(tab = 'missions') {
    openModal({ title: '⏸ Paused', tab, tabs: tabs(['missions', 'ach', 'records', 'log', 'album', 'settings', 'save', 'coop', 'help']), foot: '<button data-act="resume" class="primary">▶ Resume</button><button data-act="quit">🏠 Main menu</button>' });
  }

  // ---------- tutorial ----------
  const tut = (() => {
    let i = -1, st = null, wait = 0;
    const hl = on => (TUTORIAL[i]?.hl || []).forEach(id => $(id)?.classList.toggle('hl', on));
    function show() {
      const s = TUTORIAL[i];
      $('tut').classList.remove('hidden');
      $('tut-text').innerHTML = s.text;
      $('tut-step').textContent = `${i + 1}/${TUTORIAL.length}`;
      $('tut-next').style.display = s.next ? '' : 'none';
      $('tut-next').textContent = i === TUTORIAL.length - 1 ? 'Finish ✔' : 'Next ▶';
      hl(true);
    }
    function go(n) {
      hl(false);
      i = n;
      if (i >= TUTORIAL.length) { stop(); S.tutorialDone = true; G.earn(500, '🎓 Tutorial complete!'); G.persist(); return; }
      show();
    }
    function stop() { hl(false); i = -1; $('tut').classList.add('hidden'); }
    $('tut-next').onclick = () => { audio.beep(); go(i + 1); };
    $('tut-skip').onclick = () => { stop(); S.tutorialDone = true; G.persist(); G.toast('Tutorial skipped. Find it again in ☰ → Settings'); };
    return {
      start() { st = { drove: 0, boostT: 0 }; wait = 0; go(0); },
      stop,
      update(dt) {
        if (i < 0) return;
        st.drove += Math.abs(G.car.speed) * dt;
        if (G.car.boosting) st.boostT += dt;
        const s = TUTORIAL[i];
        if (s.done && s.done(st, G)) { wait += dt; if (wait > 0.5) { wait = 0; audio.beep(); go(i + 1); } }
      },
      get active() { return i >= 0; },
    };
  })();

  return {
    openModal, closeModal, showTitle, startGame, openPause, tutorial: tut, coopPill,
    get open() { return !!modal; },
    refresh: () => render(),
    openShop: () => openModal({ title: '🚗 Dealership', money: true, tabs: SHOP }),
    rateSurvey(s, onRate) {
      openModal({
        title: '📋 Damage survey', closable: false, onRate,
        body: () => `<p>You've reached a damage survey point. Judge the damage around you and rate the tornado.</p>
          <div class="efs">${EF_DESC.map((d, e) => `<button data-act="rate" data-v="${e}" class="ef ef${e}"><b>EF${e}</b><small>${d}</small></button>`).join('')}</div>
          <p class="muted">Exactly right pays ×1.6 · one off ×1 · further off ×0.4</p>`,
      });
    },
  };
}
