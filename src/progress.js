// Achievements, chase log, photo album and personal records (all saved in S).
export const ACHIEVEMENTS = [
  ['first_tor', '👀', 'First Sighting', 'Get within 1 km of a tornado'],
  ['first_probe', '🎯', 'Direct Data', 'Score your first probe hit'],
  ['ef3_probe', '💪', 'Big One', 'Probe an EF3 or stronger'],
  ['ef5', '☠️', 'Finger of God', 'See an EF5 (or worse)'],
  ['mutant', '🧬', 'Mutant Hunter', 'Find a mutant tornado'],
  ['core', '🌀', 'Core Puncher', 'Drive through a tornado\'s core and out again'],
  ['close50', '😱', 'Too Close', 'Be within 50 m of a tornado\'s centre'],
  ['flung', '🛫', 'Frequent Flyer', 'Get flung by the wind'],
  ['airtime', '🚀', 'Air Time', 'Stay airborne for 4 seconds'],
  ['photo10', '📷', 'Photographer', 'Take 10 tornado photos'],
  ['rope', '🪢', 'Rope Out', 'Photograph a tornado as it ropes out'],
  ['water', '🌊', 'Waterspout', 'See a tornado over the lake'],
  ['devil', '🌪️', 'Dust Devil', 'Get within 30 m of a dust devil'],
  ['survey_ace', '📋', 'Damage Expert', 'Rate a damage survey exactly right'],
  ['rescue', '🚑', 'Hero', 'Rescue a stranded person'],
  ['tv', '📺', 'On Air', 'Go live on TV'],
  ['drone', '🛸', 'Pilot', 'Collect data with a drone probe'],
  ['mission', '📅', 'Busy Day', 'Finish all 3 daily missions'],
  ['rich', '💰', 'Big Money', 'Have $50,000 at once'],
  ['fleet', '🚗', 'Collector', 'Own 5 vehicles'],
  ['dom3', '🛡️', 'Interceptor', 'Buy the Dominator 3'],
  ['level10', '⭐', 'Veteran Chaser', 'Reach level 10'],
  ['coop', '👥', 'Chase Partners', 'Chase with a friend in co-op'],
];
const STAT_ACH = { probe: 'first_probe', ef3: 'ef3_probe', core: 'core', rescue: 'rescue', tv: 'tv', drone: 'drone', survey_ace: 'survey_ace' };
const when = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function createProgress(G) {
  const { S, car, weather } = G;
  S.ach ??= {}; S.log ??= []; S.album ??= []; S.rec ??= {};

  function unlock(id) {
    if (S.ach[id]) return;
    const a = ACHIEVEMENTS.find(x => x[0] === id);
    if (!a) return;
    S.ach[id] = Date.now();
    S.money += 250;
    G.toast(`🏆 ${a[2]} unlocked! +$250`, 'gold');
    G.audio.levelUp();
  }
  const entry = t => t.logId && S.log.find(e => e.id === t.logId);

  function onStat(id) {
    if (STAT_ACH[id]) unlock(STAT_ACH[id]);
    if (id === 'photo') { S.rec.photos = (S.rec.photos || 0) + 1; if (S.rec.photos >= 10) unlock('photo10'); }
  }
  // What the player did to a tornado, for its chase log entry.
  function note(t, key, amount = 0) {
    const e = entry(t);
    if (!e) return;
    if (key === 'probe') e.probe++;
    if (key === 'photo') e.photos++;
    if (key === 'core') e.punched = true;
    e.earned += Math.round(amount);
  }
  function addPhoto(img, label, pay) {
    S.album.unshift({ img, label, pay: Math.round(pay), date: Date.now() });
    S.album.length = Math.min(S.album.length, 24);
  }

  let t0 = 0;
  function update(dt) {
    t0 -= dt;
    if (t0 > 0) return;
    t0 = 0.25;
    for (const t of weather.tornadoes) {
      if (t.touch < 0.5) continue;
      const d = Math.hypot(t.pos.x - car.pos.x, t.pos.z - car.pos.z), devil = t.kind === 'devil';
      if (!t.logId && d < 1500) {
        t.logId = `${Date.now()}-${t.id}`;
        S.log.unshift({ id: t.logId, label: t.label, date: Date.now(), closest: Math.round(d), probe: 0, photos: 0, punched: false, earned: 0 });
        S.log.length = Math.min(S.log.length, 40);
        if (!devil) {
          S.rec.seen = (S.rec.seen || 0) + 1;
          const ef = t.special === 'mega' ? 6 : t.ef;
          if (ef > (S.rec.strongest ?? -1)) S.rec.strongest = ef;
          if (ef >= 5) unlock('ef5');
          if (t.special) unlock('mutant');
        }
      }
      const e = entry(t);
      if (e) { e.closest = Math.min(e.closest, Math.round(d)); e.label = t.label; }
      if (devil) { if (d < 30) unlock('devil'); continue; }
      if (d < 1000) unlock('first_tor');
      if (d < (S.rec.closest ?? 1e9)) S.rec.closest = Math.round(d);
      if (d < 50) unlock('close50');
      if (t.wet > 0.5 && d < 1500) unlock('water');
    }
    if (S.money >= 50000) unlock('rich');
    if (S.owned.length >= 5) unlock('fleet');
    if (S.owned.includes('dom3')) unlock('dom3');
    if (G.level() >= 10) unlock('level10');
    if (S.daily?.list.every(m => m.done)) unlock('mission');
  }

  const fmt = n => '$' + Math.round(n).toLocaleString();
  return {
    unlock, onStat, note, addPhoto, update,
    achievementsHtml() {
      const got = ACHIEVEMENTS.filter(a => S.ach[a[0]]).length;
      return `<p class="muted">${got} of ${ACHIEVEMENTS.length} unlocked · each pays $250</p><div class="ach-grid">` + ACHIEVEMENTS.map(([id, icon, name, desc]) =>
        `<div class="ach ${S.ach[id] ? 'got' : ''}"><span>${S.ach[id] ? icon : '🔒'}</span><b>${name}</b><small>${desc}</small></div>`).join('') + '</div>';
    },
    recordsHtml() {
      const r = S.rec, rows = [
        ['Tornadoes seen', r.seen || 0], ['Strongest seen', r.strongest != null ? 'EF' + r.strongest : '-'], ['Closest approach', r.closest != null ? r.closest + ' m' : '-'],
        ['Highest wind measured', r.wind ? r.wind + ' mph' : '- (needs anemometer)'], ['Photos taken', r.photos || 0], ['Total earned', fmt(r.earned || 0)],
      ];
      const best = S.best.length ? S.best.map((b, i) => `<tr><td>${i + 1}</td><td>${b.r} ${b.s}</td><td>${b.d} m</td><td>${fmt(b.pay)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No probe hits yet</td></tr>';
      return `<div class="stats">${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
        <h4>🏆 Best probe intercepts</h4><table class="tbl"><tr><th>#</th><th>Tornado</th><th>Distance</th><th>Paid</th></tr>${best}</table>`;
    },
    logHtml() {
      if (!S.log.length) return '<p class="muted">Your chase log fills up as you see tornadoes.</p>';
      return S.log.map(e => `<div class="log"><b>${e.label}</b><small>${when(e.date)} · closest ${e.closest} m${e.probe ? ` · ${e.probe} probe hit${e.probe > 1 ? 's' : ''}` : ''}${e.photos ? ` · ${e.photos} photo${e.photos > 1 ? 's' : ''}` : ''}${e.punched ? ' · 🌀 core punch' : ''}${e.earned ? ` · earned ${fmt(e.earned)}` : ''}</small></div>`).join('');
    },
    albumHtml() {
      if (!S.album.length) return '<p class="muted">Tornado photos you take show up here.</p>';
      return '<div class="album">' + S.album.map(p => `<figure><img src="${p.img}" alt=""><figcaption>${p.label}<br><small>${when(p.date)} · ${fmt(p.pay)}</small></figcaption></figure>`).join('') + '</div>';
    },
  };
}
