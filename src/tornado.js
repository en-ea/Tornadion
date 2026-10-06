import * as THREE from 'three';
import { rr, clamp, lerp, smooth } from './util.js';

// Peak wind (m/s) and core radius (m) per EF rating.
export const EF = [
  { v: 36, r: 12 }, { v: 46, r: 18 }, { v: 57, r: 27 },
  { v: 69, r: 40 }, { v: 84, r: 58 }, { v: 100, r: 85 },
];
// Funnel profiles: bottom/top radius factors, widening exponent, and wiggle.
const SHAPES = {
  rope: { bot: 0.45, top: 1.1, add: 8, exp: 2.4, wig: 14 },
  cone: { bot: 0.8, top: 2.0, add: 28, exp: 1.3, wig: 4 },
  wedge: { bot: 1.45, top: 1.8, add: 45, exp: 0.7, wig: 1 },
  stovepipe: { bot: 1.05, top: 1.2, add: 8, exp: 1, wig: 2 },
};
const WET = { a: new THREE.Color(0xc9d4de), b: new THREE.Color(0xa9c3d6) };
export const CLOUD_BASE = 112;
export const SPECIALS = { multi: 'MULTI-VORTEX', fire: 'FIRENADO', mega: 'MEGA WEDGE', drifter: 'DRIFTER' };

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform float uTime, uRb, uRt, uH, uExp, uWig, uSpin;
uniform vec2 uBend;
varying float vY, vAng, vShade;
void main() {
  float y = position.y + 0.5;
  vec2 dir = normalize(position.xz);
  float ang = atan(dir.y, dir.x);
  float r = mix(uRb, uRt, pow(y, uExp));
  r *= 1.0 + 0.12 * sin(ang * 3.0 + y * 9.0 - uTime * uSpin * 0.5) + 0.06 * sin(ang * 7.0 - y * 20.0 + uTime * 3.0);
  vec2 off = uBend * (y * y * (3.0 - 2.0 * y));
  off += vec2(sin(y * 6.0 + uTime * 0.7), cos(y * 5.0 + uTime * 0.6)) * uWig * sin(y * 3.14159);
  vec3 p = vec3(dir.x * r + off.x, y * uH, dir.y * r + off.y);
  vY = y; vAng = ang;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize((modelViewMatrix * vec4(dir.x, 0.0, dir.y, 0.0)).xyz);
  vShade = abs(n.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uTime, uSpin, uOpacity, uForm, uLight;
uniform vec3 uColA, uColB;
varying float vY, vAng, vShade;
void main() {
  float s = sin(vAng * 6.0 + vY * 14.0 - uTime * uSpin) * 0.5 + 0.5;
  float s2 = sin(vAng * 11.0 - vY * 30.0 - uTime * uSpin * 1.7) * 0.5 + 0.5;
  vec3 col = mix(uColA, uColA * 0.7, s * 0.6 + s2 * 0.3);
  col = mix(uColB, col, smoothstep(0.0, 0.2, vY));
  col *= (0.7 + 0.4 * vShade) * uLight;
  float a = uOpacity * (0.5 + 0.5 * vShade);
  a *= smoothstep(1.0 - uForm - 0.04, 1.0 - uForm + 0.08, vY);
  a *= 1.0 - smoothstep(0.92, 1.0, vY) * 0.5;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const funnelGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 28, true);
const dustGeo = new THREE.IcosahedronGeometry(1, 1);
const bitGeo = new THREE.BoxGeometry(1, 0.35, 0.7);

function funnelMat(a, b, opacity) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uRb: { value: 10 }, uRt: { value: 40 }, uH: { value: CLOUD_BASE }, uExp: { value: 1 },
      uWig: { value: 0 }, uSpin: { value: 4 }, uBend: { value: new THREE.Vector2() }, uOpacity: { value: opacity },
      uForm: { value: 0 }, uColA: { value: new THREE.Color(a) }, uColB: { value: new THREE.Color(b) }, uLight: { value: 1 },
    }]),
    vertexShader: VERT, fragmentShader: FRAG,
  });
}

let uid = 0;
const dummy = new THREE.Object3D();

export class Tornado {
  // kind: null (normal), 'satellite' (orbits parent), 'landspout' (weak, early storm), 'devil' (fair-weather dust devil).
  constructor(scene, world, storm, { ef, shape, offset, twin = false, special = null, kind = null, parent = null, rainWrap = false }) {
    this.id = ++uid;
    this.scene = scene; this.world = world; this.storm = storm;
    this.special = special; this.kind = kind; this.parent = parent; this.rainWrap = rainWrap; this.wet = 0;
    if (special === 'mega') { ef = 5; shape = 'wedge'; }
    this.ef = ef; this.shape = shape; this.twin = twin;
    this.offset = offset; this.orbitA = Math.atan2(offset.z, offset.x);
    this.pos = new THREE.Vector3(storm.meso.x + offset.x, 0, storm.meso.z + offset.z);
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.age = 0; this.form = 12; this.life = rr(70, 140) + ef * 12; this.ropeT = 22;
    this.jinkT = rr(15, 30); this.jx = this.jz = this.jtx = this.jtz = 0; this.turned = false;
    this.Rmax = EF[ef].r * rr(0.85, 1.2); this.Vmax = EF[ef].v * rr(0.96, 1.08);
    if (special === 'mega') { this.Rmax = rr(140, 170); this.Vmax = rr(118, 130); this.life += 40; }
    if (special === 'multi') this.Vmax *= 1.12;
    if (kind === 'satellite') this.life = rr(35, 55);
    if (kind === 'landspout') this.life = rr(40, 70);
    if (kind === 'devil') { this.Rmax = rr(3.5, 6); this.Vmax = rr(20, 27); this.life = rr(35, 60); this.form = 5; this.ropeT = 6; this.height = rr(28, 45); }
    this.R = this.Rmax * 0.4; this.V = 0; this.touch = 0;
    this.alive = true; this.track = []; this.trackT = 0; this.damage = []; this.photos = 0; this.probed = false;

    this.group = new THREE.Group();
    const fire = special === 'fire';
    const devil = kind === 'devil';
    this.outer = new THREE.Mesh(funnelGeo, fire ? funnelMat(0xff7a2a, 0x3a2a24, 0.7) : devil ? funnelMat(0xc4a57e, 0xa88a62, 0.4) : funnelMat(0x8f949b, 0x6f5d49, 0.62));
    this.inner = new THREE.Mesh(funnelGeo, fire ? funnelMat(0xffd040, 0x802000, 0.9) : devil ? funnelMat(0xb39470, 0x97795a, 0.5) : funnelMat(0x5f656d, 0x57473a, 0.85));
    this.baseCol = [this.outer, this.inner].map(m => [m.material.uniforms.uColA.value.clone(), m.material.uniforms.uColB.value.clone()]);
    // Rain-wrapped: a grey curtain of rain hides most of the funnel.
    if (rainWrap) { this.shroud = new THREE.Mesh(funnelGeo, funnelMat(0x737d85, 0x66707a, 0.5)); this.shroud.frustumCulled = false; this.shroud.renderOrder = 3; this.group.add(this.shroud); }
    this.subs = [];
    if (special === 'multi') for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(funnelGeo, funnelMat(0x6f757c, 0x6f5d49, 0.8)); m.frustumCulled = false; this.subs.push(m); this.group.add(m); }
    for (const m of [this.outer, this.inner]) { m.frustumCulled = false; this.group.add(m); }
    this.outer.renderOrder = 2; this.inner.renderOrder = 1;

    this.dustCol = new THREE.Color(fire ? 0x3a3030 : devil ? 0xb89a72 : 0x8a7258);
    this.dust = new THREE.InstancedMesh(dustGeo, new THREE.MeshLambertMaterial({ color: this.dustCol.clone(), transparent: true, opacity: 0.5, flatShading: true, depthWrite: false }), 26);
    this.dust.frustumCulled = false;
    this.bits = new THREE.InstancedMesh(bitGeo, fire ? new THREE.MeshBasicMaterial({ color: 0xff6a1a }) : new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true }), 90);
    this.bits.frustumCulled = false;
    this.seeds = Array.from({ length: 90 }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
    scene.add(this.group, this.dust, this.bits);
  }

  get rating() { return this.special === 'mega' ? 'EF6' : 'EF' + this.ef; }
  get roping() { return this.age > this.form + this.life; }
  get label() {
    if (this.kind === 'devil') return 'DUST DEVIL';
    if (this.special) return `MUTANT ${SPECIALS[this.special]} ${this.rating}`;
    const what = this.wet > 0.5 ? 'WATERSPOUT' : this.kind === 'landspout' ? 'LANDSPOUT' : this.shape.toUpperCase();
    return `${this.rating} ${this.rainWrap ? 'RAIN-WRAPPED ' : ''}${this.kind === 'satellite' ? 'SATELLITE ' : ''}${what}`;
  }
  // Tangential wind speed at radius r.
  vtAt(r) { const R = this.R; return r < R ? this.V * r / R : this.V * Math.pow(R / r, 0.75); }

  addWind(x, z, out) {
    const dx = x - this.pos.x, dz = z - this.pos.z, r = Math.hypot(dx, dz), R = this.R;
    if (r > R * 14 + 80 || this.V <= 0) return;
    const vt = this.vtAt(r), inflow = r < R ? 0 : vt * 0.35;
    const nx = r > 0 ? dx / r : 0, nz = r > 0 ? dz / r : 0;
    const carry = smooth(R * 4, R, r);
    out.x += -nz * vt - nx * inflow + this.vel.x * carry;
    out.z += nx * vt - nz * inflow + this.vel.z * carry;
    if (r < R * 1.4) out.up += this.V * 0.4 * (1 - r / (R * 1.4));
  }

  update(dt, t, light) {
    this.age += dt;
    const { age, form } = this, end = form + this.life;
    const grow = smooth(0, form + 15, age);
    const rope = age > end ? clamp((age - end) / this.ropeT, 0, 1) : 0;
    this.touch = smooth(form * 0.3, form, age);
    const breathe = 1 + 0.15 * Math.sin(age * 0.35 + this.id) + 0.08 * Math.sin(age * 1.3);
    this.R = this.Rmax * lerp(0.4, 1, grow) * breathe * lerp(1, 0.25, rope);
    this.V = this.Vmax * lerp(0.45, 1, grow) * this.touch * (1 - 0.6 * rope);
    if (rope >= 1) return this.kill();

    // Follow the storm's mesocyclone; twins orbit it.
    const m = this.storm.meso;
    let tx, tz, follow = 0.8;
    if (this.netPos) { tx = this.netPos.x; tz = this.netPos.z; follow = 4; }
    else if (this.parent) { // satellite: circles its parent, dies with it
      const P = this.parent;
      if (!P.alive || P.roping) this.life = Math.min(this.life, Math.max(0, age - form));
      this.orbitA += dt * 0.35;
      const d = P.R * 2.2 + 30;
      tx = P.pos.x + Math.cos(this.orbitA) * d; tz = P.pos.z + Math.sin(this.orbitA) * d;
    } else if (this.kind === 'devil') { tx = m.x; tz = m.z; }
    else if (this.twin) {
      this.orbitA += dt * 0.12;
      const d = Math.hypot(this.offset.x, this.offset.z);
      tx = m.x + Math.cos(this.orbitA) * d; tz = m.z + Math.sin(this.orbitA) * d;
    } else {
      tx = m.x + this.offset.x + Math.sin(age * 0.11 + this.id) * 22;
      tz = m.z + this.offset.z + Math.cos(age * 0.09 + this.id) * 22;
      if (this.special === 'drifter') { tx += Math.sin(age * 0.33) * 150; tz += Math.sin(age * 0.21 + 1) * 150; }
      // Sudden direction changes: every so often it lurches towards a new spot.
      this.jinkT -= dt;
      if (this.jinkT <= 0 && this.touch > 0.8 && !this.roping) { this.jinkT = rr(14, 30); this.jtx = rr(-110, 110); this.jtz = rr(-110, 110); this.turned = true; }
      this.jx += (this.jtx - this.jx) * Math.min(1, dt * 0.3); this.jz += (this.jtz - this.jz) * Math.min(1, dt * 0.3);
      tx += this.jx; tz += this.jz;
    }
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += (tx - px) * Math.min(1, dt * follow);
    this.pos.z += (tz - pz) * Math.min(1, dt * follow);
    this.pos.y = Math.max(this.world.heightAt(this.pos.x, this.pos.z), this.world.WATER);
    this.vel.set((this.pos.x - px) / dt, 0, (this.pos.z - pz) / dt);
    this.trackT -= dt;
    if (this.trackT <= 0 && this.touch > 0.5) { this.trackT = 1; this.track.push([this.pos.x, this.pos.z]); }

    // Funnel shape
    // Funnel shape. Rope-out: thins, contorts, bends further and lifts off the ground before vanishing.
    const S = SHAPES[this.shape], Ro = SHAPES.rope;
    const bot = lerp(S.bot, Ro.bot * 0.5, rope), top = lerp(S.top, Ro.top, rope), add = lerp(S.add, Ro.add, rope);
    const exp = lerp(S.exp, Ro.exp, rope), wig = lerp(S.wig, 34, rope);
    this.group.position.copy(this.pos);
    const bendK = this.kind === 'devil' ? 0 : 1 + rope * 1.6, bx = clamp((m.x - this.pos.x) * bendK, -160, 160), bz = clamp((m.z - this.pos.z) * bendK, -160, 160);
    const fade = 1 - smooth(0.8, 1, rope), formed = smooth(0, form, age) * (1 - 0.6 * smooth(0.45, 1, rope));
    const H = this.height ?? CLOUD_BASE + 8 - this.pos.y;
    // Over the lake it becomes a pale waterspout with a spray ring.
    this.wet += ((this.world.surfaceAt(this.pos.x, this.pos.z) === 'water' ? 1 : 0) - this.wet) * Math.min(1, dt * 0.8);
    [this.outer, this.inner].forEach((mesh, i) => {
      const u = mesh.material.uniforms, k = i ? 0.62 : 1;
      u.uTime.value = t; u.uRb.value = this.R * bot * k; u.uRt.value = (this.R * top + add) * k;
      u.uH.value = H; u.uExp.value = exp; u.uWig.value = wig; u.uSpin.value = 2 + this.V * 0.07;
      u.uBend.value.set(bx, bz); u.uForm.value = formed; u.uLight.value = light;
      u.uOpacity.value = (k === 1 ? 0.62 : 0.85) * fade * (this.wet > 0.01 ? 1 - this.wet * 0.25 : 1);
      if (this.wet > 0.01 || this.wasWet) { u.uColA.value.copy(this.baseCol[i][0]).lerp(WET.a, this.wet); u.uColB.value.copy(this.baseCol[i][1]).lerp(WET.b, this.wet); }
    });
    this.wasWet = this.wet > 0.01;
    this.dust.material.color.copy(this.dustCol).lerp(WET.a, this.wet);
    if (this.shroud) {
      const u = this.shroud.material.uniforms;
      u.uTime.value = t; u.uRb.value = this.R * 3 + 25; u.uRt.value = this.R * 3.4 + 70; u.uH.value = H; u.uExp.value = 0.5; u.uWig.value = 3;
      u.uSpin.value = 0.8; u.uBend.value.set(bx * 0.5, bz * 0.5); u.uForm.value = 1; u.uLight.value = light; u.uOpacity.value = 0.6 * fade;
    }

    this.subs.forEach((sm, i) => {
      const a = t * 1.6 + i * 2.094, ox = Math.cos(a) * this.R * 0.85, oz = Math.sin(a) * this.R * 0.85, u = sm.material.uniforms;
      sm.position.set(ox, 0, oz);
      u.uTime.value = t; u.uRb.value = this.R * 0.18; u.uRt.value = this.R * 0.35 + 6; u.uH.value = CLOUD_BASE - 20 - this.pos.y;
      u.uExp.value = 1.3; u.uWig.value = 3; u.uSpin.value = 6; u.uBend.value.set(bx - ox, bz - oz);
      u.uForm.value = formed; u.uLight.value = light; u.uOpacity.value = 0.8 * fade;
    });

    // Ground dust cloud
    const w = (this.V + 5) / Math.max(this.R, 8), dustAmt = smooth(form * 0.2, form, age) * fade;
    for (let i = 0; i < 26; i++) {
      const f = (i * 0.618) % 1, a = i * 2.4 + t * w * (0.6 + f * 0.4);
      const rad = this.R * (0.9 + f * 0.8), y = this.pos.y + 1 + ((i * 0.37) % 1) * this.R * 0.35;
      dummy.position.set(this.pos.x + Math.cos(a) * rad, y, this.pos.z + Math.sin(a) * rad);
      dummy.rotation.set(a, a * 0.7, 0);
      dummy.scale.setScalar(Math.max(0.01, this.R * 0.32 * (0.6 + f * 0.7) * dustAmt));
      dummy.updateMatrix();
      this.dust.setMatrixAt(i, dummy.matrix);
    }
    this.dust.instanceMatrix.needsUpdate = true;
    this.dust.material.opacity = 0.5 * fade;

    // Debris swirling up the funnel
    const hmax = this.kind === 'devil' ? 18 : 35 + this.ef * 14, n = Math.floor(90 * this.touch * fade);
    for (let i = 0; i < 90; i++) {
      const [a0, sp, rf, sz] = this.seeds[i];
      const h = ((t * (0.05 + sp * 0.08) + a0) % 1) * hmax;
      const rad = this.R * (1 + rf * 0.8) + h * 0.2, a = a0 * 6.28 + t * w * (1 - h / hmax * 0.5);
      dummy.position.set(this.pos.x + Math.cos(a) * rad, this.pos.y + h, this.pos.z + Math.sin(a) * rad);
      dummy.rotation.set(t * 3 * sp + a0, t * 2 + rf, t * 4 * sz);
      dummy.scale.setScalar(i < n ? 0.4 + sz * 1.3 : 0);
      dummy.updateMatrix();
      this.bits.setMatrixAt(i, dummy.matrix);
    }
    this.bits.instanceMatrix.needsUpdate = true;
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.scene.remove(this.group, this.dust, this.bits);
    this.outer.material.dispose(); this.inner.material.dispose(); this.shroud?.material.dispose(); for (const m of this.subs) m.material.dispose();
    this.dust.material.dispose(); this.bits.material.dispose();
    this.dust.dispose(); this.bits.dispose();
  }
}
