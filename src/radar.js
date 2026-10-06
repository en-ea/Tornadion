// Radar / storm map: reflectivity, tornado tracks + projected paths, probes, surveys, mesonets, places.
export function createRadar(world, weather) {
  const cv = document.getElementById('radar'), ctx = cv.getContext('2d');
  const H = world.HALF, MAP = 240;
  const base = document.createElement('canvas');
  base.width = base.height = MAP;
  const b = base.getContext('2d'), img = b.createImageData(MAP, MAP);
  for (let j = 0; j < MAP; j++) for (let i = 0; i < MAP; i++) {
    const [r, g, bl] = world.mapColor(H - (i + 0.5) * 2 * H / MAP, H - (j + 0.5) * 2 * H / MAP), o = (j * MAP + i) * 4;
    img.data[o] = r * 0.75; img.data[o + 1] = g * 0.75; img.data[o + 2] = bl * 0.75; img.data[o + 3] = 255;
  }
  b.putImageData(img, 0, 0);
  const m = v => (H - v) / (2 * H) * MAP;
  for (const R of world.ROADS) {
    b.strokeStyle = R.type === 'highway' ? '#2d2d33' : '#8a6a44';
    b.lineWidth = R.type === 'highway' ? 2.2 : 1.2;
    b.beginPath();
    if (R.v) { b.moveTo(m(R.c), 0); b.lineTo(m(R.c), MAP); } else { b.moveTo(0, m(R.c)); b.lineTo(MAP, m(R.c)); }
    b.stroke();
  }

  let big = false;
  cv.addEventListener('pointerdown', e => { e.stopPropagation(); big = !big; cv.classList.toggle('big', big); });
  const ECHO = [[0.9, '224,64,251'], [0.7, '255,59,48'], [0.45, '255,214,10'], [0, '52,199,89']];

  function draw(car, { probes = [], surveys = [], rescues = [], friends = [], range = 450 } = {}) {
    const dpr = Math.min(devicePixelRatio, 2), W = Math.round(cv.clientWidth * dpr);
    if (!W) return;
    if (cv.width !== W) cv.width = cv.height = W;
    const R = big ? H * 1.02 : range, cx = big ? 0 : car.pos.x, cz = big ? 0 : car.pos.z, sc = W / 2 / R;
    const X = x => W / 2 - (x - cx) * sc, Y = z => W / 2 - (z - cz) * sc;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    if (big) ctx.rect(0, 0, W, W); else ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#56753f'; ctx.fillRect(0, 0, W, W);
    ctx.drawImage(base, X(H), Y(H), 2 * H * sc, 2 * H * sc);

    // Reflectivity
    for (const s of weather.storms) {
      for (const e of s.echo) {
        const [x, z] = s.point(e.f, e.l), c = ECHO.find(k => e.v >= k[0])[1], r = e.r * sc;
        const g = ctx.createRadialGradient(X(x), Y(z), 0, X(x), Y(z), r);
        g.addColorStop(0, `rgba(${c},${0.6 * s.power})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(X(x) - r, Y(z) - r, r * 2, r * 2);
      }
    }
    ctx.font = `${Math.round(11 * dpr)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Places, mesonets, towns
    for (const p of world.places) ctx.fillText({ gas: '⛽', repair: '🔧', dealer: '🚗' }[p.type], X(p.x), Y(p.z));
    for (const ms of world.mesonets) {
      const mph = Math.round(weather.windAt(ms.x, ms.z).speed * 2.237), x = X(ms.x), y = Y(ms.z);
      if (x < 0 || y < 0 || x > W || y > W) continue;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 11 * dpr, y - 7 * dpr, 22 * dpr, 14 * dpr);
      ctx.fillStyle = mph > 60 ? '#ff6b6b' : '#fff'; ctx.fillText(mph, x, y);
    }
    if (big) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(13 * dpr)}px sans-serif`;
      for (const t of world.TOWNS) ctx.fillText(t.name, X(t.x), Y(t.z) - 14 * dpr);
    }
    // Surveys and probes
    for (const s of surveys) { ctx.fillStyle = '#ff9f1a'; ctx.fillRect(X(s.x) - 4 * dpr, Y(s.z) - 4 * dpr, 8 * dpr, 8 * dpr); }
    for (const p of probes) if (p.state !== 'hit') { ctx.fillStyle = p.state === 'armed' ? '#3ff' : '#fff'; ctx.beginPath(); ctx.arc(X(p.pos.x), Y(p.pos.z), (p.state === 'armed' ? 4 : 3) * dpr, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#ffd21a';
    for (const r of rescues) { const x = X(r.x), y = Y(r.z), k = 6 * dpr; ctx.beginPath(); ctx.moveTo(x, y - k); ctx.lineTo(x + k, y); ctx.lineTo(x, y + k); ctx.lineTo(x - k, y); ctx.fill(); }
    // Tornadoes: past track, projected path, icon
    for (const t of weather.tornadoes) {
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(255,70,70,.9)';
      ctx.beginPath();
      t.track.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z))));
      ctx.lineTo(X(t.pos.x), Y(t.pos.z));
      ctx.stroke();
      const v = t.storm.vel;
      ctx.setLineDash([5 * dpr, 5 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.moveTo(X(t.pos.x), Y(t.pos.z)); ctx.lineTo(X(t.pos.x + v.x * 90), Y(t.pos.z + v.z * 90)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = t.special ? '#c04dff' : '#ff3b30'; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(X(t.pos.x), Y(t.pos.z), Math.max(5 * dpr, t.R * sc), 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(11 * dpr)}px sans-serif`;
      ctx.fillText(t.rating, X(t.pos.x), Y(t.pos.z) - 12 * dpr);
    }
    // Other players (co-op)
    for (const f of friends) {
      const x = X(f.x), y = Y(f.z), k = 6 * dpr;
      ctx.fillStyle = f.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, k, 0, 7); ctx.fill(); ctx.stroke();
      if (big) { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(11 * dpr)}px sans-serif`; ctx.fillText(f.name, x, y - 13 * dpr); }
    }
    // Player arrow
    const px = X(car.pos.x), py = Y(car.pos.z), dx = -Math.sin(car.heading), dy = -Math.cos(car.heading), s = 7 * dpr;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1700eb'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(px + dx * s * 1.4, py + dy * s * 1.4);
    ctx.lineTo(px - dx * s - dy * s * 0.8, py - dy * s + dx * s * 0.8);
    ctx.lineTo(px - dx * s + dy * s * 0.8, py - dy * s - dx * s * 0.8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(12 * dpr)}px sans-serif`;
    ctx.fillText('N', W / 2, 10 * dpr);
    ctx.restore();
  }
  return { draw, get big() { return big; }, setBig(v) { big = v; cv.classList.toggle('big', v); } };
}
