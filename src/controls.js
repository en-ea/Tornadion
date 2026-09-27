// Touch joystick (left half of screen), buttons (right), plus keyboard for PC testing.
export function createControls() {
  const input = { throttle: 0, steer: 0, boost: false, brake: false };
  const zone = document.getElementById('stick-zone');
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const R = 52;
  let pid = null, cx = 0, cy = 0, sx = 0, sy = 0;

  const home = () => {
    stick.style.left = 'calc(96px + env(safe-area-inset-left, 0px))';
    stick.style.top = 'calc(100% - 104px - env(safe-area-inset-bottom, 0px))';
    knob.style.transform = '';
  };
  home();

  const move = e => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    sx = dx / R; sy = dy / R;
  };
  zone.addEventListener('pointerdown', e => {
    if (pid !== null) return;
    pid = e.pointerId;
    zone.setPointerCapture(pid);
    cx = e.clientX; cy = e.clientY;
    stick.style.left = cx + 'px'; stick.style.top = cy + 'px';
    move(e);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
  const end = e => { if (e.pointerId !== pid) return; pid = null; sx = sy = 0; home(); };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  const btn = { boost: false, brake: false };
  const bind = (id, key) => {
    const el = document.getElementById(id);
    const on = v => e => { e.preventDefault(); btn[key] = v; el.classList.toggle('on', v); };
    el.addEventListener('pointerdown', on(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, on(false));
  };
  bind('b-boost', 'boost');
  bind('b-brake', 'brake');
  addEventListener('contextmenu', e => e.preventDefault());

  const keys = new Set();
  addEventListener('keydown', e => keys.add(e.code));
  addEventListener('keyup', e => keys.delete(e.code));
  const k = (...codes) => codes.some(c => keys.has(c)) ? 1 : 0;
  const dz = v => Math.abs(v) < 0.12 ? 0 : v;
  const clamp = v => Math.max(-1, Math.min(1, v));

  function update() {
    input.steer = clamp(dz(sx) + k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'));
    input.throttle = clamp(-dz(sy) + k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown'));
    input.boost = btn.boost || !!k('ShiftLeft', 'ShiftRight');
    input.brake = btn.brake || !!k('Space');
  }
  return { input, update };
}
