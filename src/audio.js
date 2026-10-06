// All sounds are synthesised with the Web Audio API, so there are no audio files to load.
export function createAudio() {
  let ctx = null, master, noiseBuf;
  let eng, engGain, engFilt, jet, wind, rain, sirenGain, hornGain, hornFilt, hornOsc = [], hornType = 'classic';
  let enabled = true;

  function loop(type, freq, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(master);
    src.start();
    return { f, g };
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Engine: detuned saw + square through a lowpass that opens with revs.
    engFilt = ctx.createBiquadFilter(); engFilt.type = 'lowpass'; engFilt.frequency.value = 500;
    engGain = ctx.createGain(); engGain.gain.value = 0;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; g2.gain.value = 0.5;
    o1.connect(engFilt); o2.connect(g2).connect(engFilt);
    engFilt.connect(engGain).connect(master);
    o1.start(); o2.start();
    eng = [o1, o2];

    jet = loop('bandpass', 900, 0.7);
    wind = loop('lowpass', 400);
    rain = loop('highpass', 3000);

    // Tornado siren: sine swept by a slow LFO.
    const siren = ctx.createOscillator(), lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    siren.frequency.value = 650; lfo.frequency.value = 0.12; lfoGain.gain.value = 280;
    lfo.connect(lfoGain).connect(siren.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    siren.connect(sirenGain).connect(master);
    siren.start(); lfo.start();

    hornGain = ctx.createGain(); hornGain.gain.value = 0;
    hornFilt = ctx.createBiquadFilter(); hornFilt.type = 'lowpass';
    hornGain.connect(hornFilt).connect(master);
    buildHorn();
  }
  // Horn styles: oscillator chords (the yelp adds a fast LFO on pitch).
  const HORN = {
    classic: { type: 'square', f: [392, 494], cut: 1800 },
    air: { type: 'sawtooth', f: [220, 277, 330], cut: 1400 },
    train: { type: 'sawtooth', f: [311, 370, 466, 554], cut: 1100 },
    yelp: { type: 'square', f: [900], cut: 2500, lfo: [7, 350] },
  };
  function buildHorn() {
    for (const o of hornOsc) o.stop();
    hornOsc = [];
    const h = HORN[hornType] || HORN.classic;
    hornFilt.frequency.value = h.cut;
    let lfoGain = null;
    if (h.lfo) { const l = ctx.createOscillator(); lfoGain = ctx.createGain(); l.frequency.value = h.lfo[0]; lfoGain.gain.value = h.lfo[1]; l.connect(lfoGain); l.start(); hornOsc.push(l); }
    for (const f of h.f) { const o = ctx.createOscillator(); o.type = h.type; o.frequency.value = f; lfoGain?.connect(o.frequency); o.connect(hornGain); o.start(); hornOsc.push(o); }
  }
  addEventListener('pointerdown', init);
  addEventListener('keydown', init);

  const set = (p, v, tc = 0.08) => p.setTargetAtTime(v, ctx.currentTime, tc);

  function burst({ dur = 0.3, freq = 800, type = 'lowpass', vol = 0.4, delay = 0, q = 1 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.2, delay = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  return {
    update({ speed, throttle, boost, wind: w, roar, rain: r, siren, horn }) {
      if (!ctx) return;
      const rpm = 45 + Math.abs(speed) * 2.4 + Math.abs(throttle) * 18;
      set(eng[0].frequency, rpm); set(eng[1].frequency, rpm * 0.5);
      set(engFilt.frequency, 300 + Math.abs(throttle) * 900 + Math.abs(speed) * 15);
      set(engGain.gain, 0.05 + Math.abs(throttle) * 0.06);
      set(jet.g.gain, boost ? 0.35 : 0, 0.05);
      set(jet.f.frequency, 700 + Math.abs(speed) * 20);
      const windAmt = Math.min(1, w / 60) * 0.35 + roar * 0.7;
      set(wind.g.gain, windAmt, 0.2);
      set(wind.f.frequency, 250 + w * 8 + roar * 500, 0.2);
      set(rain.g.gain, r * 0.18, 0.3);
      set(sirenGain.gain, siren * 0.07, 0.3);
      set(hornGain.gain, horn ? 0.12 : 0, 0.02);
    },
    thunder(dist) {
      const near = Math.max(0, 1 - dist / 1500);
      const delay = Math.min(5, dist / 343);
      burst({ dur: 0.25, freq: 3000, vol: near * near * 0.5, delay });
      burst({ dur: 3.2, freq: 140 + near * 300, vol: 0.2 + near * 0.6, delay: delay + 0.05 });
    },
    crash(v = 1) { burst({ dur: 0.35, freq: 500, vol: 0.3 + v * 0.3 }); tone(70, 0.25, 'triangle', 0.3); },
    clink() { tone(2400 + Math.random() * 900, 0.05, 'triangle', 0.05); },
    shutter() { burst({ dur: 0.08, freq: 4000, type: 'highpass', vol: 0.35 }); burst({ dur: 0.06, freq: 2500, type: 'highpass', vol: 0.3, delay: 0.09 }); },
    cash() { tone(880, 0.1, 'square', 0.08); tone(1320, 0.18, 'square', 0.08, 0.09); },
    beep() { tone(1000, 0.08, 'sine', 0.15); tone(1500, 0.1, 'sine', 0.15, 0.1); },
    clunk() { tone(90, 0.2, 'square', 0.18); burst({ dur: 0.15, freq: 600, vol: 0.2 }); },
    zap() { burst({ dur: 0.2, freq: 2000, type: 'bandpass', vol: 0.3, q: 4 }); },
    levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.08, i * 0.1)); },
    setHorn(t) { hornType = t || 'classic'; if (ctx) buildHorn(); },
    rec() { tone(660, 0.08, 'sine', 0.12); tone(990, 0.12, 'sine', 0.12, 0.08); },
    whoosh() { burst({ dur: 0.9, freq: 1200, type: 'bandpass', vol: 0.3, q: 0.8 }); },
    setEnabled(v) { enabled = v; if (master) master.gain.value = v ? 0.8 : 0; },
  };
}
