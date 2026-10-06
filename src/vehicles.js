import * as THREE from 'three';
import { Kit, box, cyl } from './util.js';

// Side profile (x = forward, y = up) extruded across the width, like the Dionado.
function extrude(s, width, bevel = 0.07) {
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 3, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}
const poly = pts => { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); return s; };
function lower({ L, wb, ar = 0.74, ay = 0.6, bot = 0.5, noseY = 1.15, hoodY = 1.45, hoodEnd = 1.0, beltY = 1.5 }) {
  const h = L / 2, s = new THREE.Shape();
  s.moveTo(-h, bot + 0.12); s.lineTo(-h + 0.07, bot);
  s.lineTo(-wb - ar, bot); s.absarc(-wb, ay, ar, Math.PI, 0, true);
  s.lineTo(wb - ar, bot); s.absarc(wb, ay, ar, Math.PI, 0, true);
  s.lineTo(h - 0.1, bot); s.lineTo(h, bot + 0.22); s.lineTo(h, noseY); s.lineTo(h - 0.2, hoodY - 0.08); s.lineTo(hoodEnd, hoodY);
  s.lineTo(-h + 0.1, beltY); s.lineTo(-h, beltY - 0.2); s.lineTo(-h, bot + 0.12);
  return s;
}
function lights(L, y, ty = y + 0.05, extra) {
  const k = new Kit(), h = L / 2;
  for (const s of [-1, 1]) {
    k.add(box(0.44, 0.22, 0.06), 0xfff9b3, s * 0.66, y, h + 0.03, 0, 0, 0, 0);
    k.add(box(0.28, 0.3, 0.06), 0xff2a2a, s * 0.8, ty, -h - 0.03, 0, 0, 0, 0);
  }
  extra?.(k);
  return k.geometry();
}
const flares = (k, wb, ar, ay, color, x = 1.1) => { for (const s of [-1, 1]) for (const z of [-wb, wb]) k.add(new THREE.TorusGeometry(ar + 0.06, 0.08, 4, 8, Math.PI), color, s * x, ay, z, 0, Math.PI / 2); };

function pickup() {
  const k = new Kit(), C = 0xc0282d, T = 0x1b1b1b;
  k.add(extrude(lower({ L: 5.3, wb: 1.65, hoodEnd: 0.9, hoodY: 1.3, beltY: 1.3, noseY: 1.1 }), 1.95), C, 0, 0, 0, 0, 0, 0, 0.03);
  k.add(extrude(poly([[0.9, 1.28], [0.3, 2.0], [-0.7, 2.02], [-0.8, 1.3]]), 1.8, 0.05), 0x2e3f58);
  k.add(box(1.86, 0.1, 1.05), C, 0, 2.05, -0.2);
  for (const s of [-1, 1]) {
    k.add(box(0.12, 0.45, 2.3), C, s * 0.98, 1.52, -1.45);
    k.add(box(0.05, 0.12, 4.8), T, s * 1.04, 1.0, 0);
    k.add(box(0.25, 0.02, 1.6), T, s * 0.3, 1.33, 1.75);
  }
  k.add(box(2, 0.45, 0.1), C, 0, 1.52, -2.62);
  k.add(box(1.8, 0.05, 2.3), 0x2a2a2a, 0, 1.3, -1.45);
  for (const z of [2.66, -2.66]) k.add(box(2.1, 0.2, 0.25), 0xd0d0d0, 0, 0.66, z);
  k.add(box(1.1, 0.3, 0.05), 0x111111, 0, 0.95, 2.66);
  flares(k, 1.65, 0.74, 0.6, T, 1.02);
  return { body: k.geometry(), lights: lights(5.3, 0.95, 1.1) };
}
function suv() {
  const k = new Kit(), C = 0x2f6b3a, R = 0x264f2e, T = 0xc9b48a;
  k.add(extrude(lower({ L: 4.9, wb: 1.5 }), 2.0), C, 0, 0, 0, 0, 0, 0, 0.03);
  k.add(extrude(poly([[1.05, 1.5], [0.2, 2.25], [-2.05, 2.28], [-2.3, 1.52]]), 1.8, 0.05), 0x35506b);
  k.add(box(1.96, 0.14, 2.3), R, 0, 2.34, -0.95);
  for (const s of [-1, 1]) { k.add(box(0.08, 0.72, 0.14), R, s * 0.93, 1.9, -0.6); k.add(box(0.05, 0.16, 3.8), T, s * 1.09, 1.05, 0); k.add(box(0.06, 0.08, 2), 0x222222, s * 0.8, 2.45, -0.95); }
  k.add(cyl(0.5, 0.5, 0.3, 10), 0x1b1b20, 0, 1.2, -2.62, Math.PI / 2);
  for (const z of [2.5, -2.5]) k.add(box(2.1, 0.22, 0.28), T, 0, 0.66, z);
  flares(k, 1.5, 0.74, 0.6, 0x3a3a3a);
  return { body: k.geometry(), lights: lights(4.9, 1.18, 1.25) };
}
function ambulance() {
  const k = new Kit(), W = 0xf4f4f4, R = 0xd9262b;
  k.add(extrude(lower({ L: 6.2, wb: 2.0, ar: 0.66, ay: 0.55, hoodEnd: 1.9, hoodY: 1.5, beltY: 1.5 }), 2.0), W, 0, 0, 0, 0, 0, 0, 0.03);
  k.add(extrude(poly([[1.9, 1.5], [1.3, 2.3], [0.6, 2.35], [0.6, 1.5]]), 1.84, 0.05), 0x35506b);
  k.add(box(2.3, 2.5, 3.8), W, 0, 1.95, -1.15);
  k.add(box(2.34, 0.3, 3.84), R, 0, 1.35, -1.15);
  k.add(box(2.34, 0.12, 3.84), 0xff8a1f, 0, 1.6, -1.15);
  for (const s of [-1, 1]) { k.add(box(0.05, 0.9, 0.3), R, s * 1.17, 2.4, -1.2); k.add(box(0.05, 0.3, 0.9), R, s * 1.17, 2.4, -1.2); }
  k.add(box(0.9, 0.05, 0.3), R, 0, 3.21, -1.4); k.add(box(0.3, 0.05, 0.9), R, 0, 3.21, -1.4);
  k.add(box(2.1, 0.22, 0.28), 0x9a9a9a, 0, 0.62, 3.1);
  return { body: k.geometry(), lights: lights(6.2, 1.1, 1.0, k2 => { k2.add(box(0.5, 0.2, 0.2), 0xff2020, -0.55, 3.3, 0.6, 0, 0, 0, 0); k2.add(box(0.5, 0.2, 0.2), 0x2060ff, 0.55, 3.3, 0.6, 0, 0, 0, 0); }) };
}
function dow() {
  const k = new Kit(), W = 0xf2f2f2, B = 0x1f4fbf;
  k.add(extrude(lower({ L: 6.4, wb: 2.1, hoodEnd: 1.6, hoodY: 1.45, beltY: 1.3 }), 2.0), W, 0, 0, 0, 0, 0, 0, 0.03);
  k.add(extrude(poly([[1.6, 1.45], [1.1, 2.35], [0.35, 2.4], [0.35, 1.3]]), 1.9, 0.05), 0x35506b);
  k.add(box(1.96, 0.12, 0.8), W, 0, 2.43, 0.75);
  for (const s of [-1, 1]) k.add(box(0.05, 0.2, 6), B, s * 1.09, 1.05, 0);
  k.add(box(2.2, 0.3, 3.7), 0x8a9098, 0, 1.25, -1.3);
  k.add(cyl(0.35, 0.5, 1.2, 8), 0x9aa0a8, 0, 2.0, -1.6);
  k.add(box(0.8, 0.5, 0.8), B, 0, 2.7, -1.6);
  k.add(cyl(1.6, 1.6, 0.22, 14), W, 0, 3.6, -1.6, -0.6);
  k.add(cyl(0.08, 0.08, 1.4, 5), 0x555555, 0, 3.9, -1.0, -0.6);
  flares(k, 2.1, 0.74, 0.6, 0x3a3a3a);
  return { body: k.geometry(), lights: lights(6.4, 1.1, 1.1) };
}
function dominator(C, A, level) {
  const k = new Kit();
  k.add(extrude(lower({ L: 5.6, wb: 1.7, ar: 0.82, ay: 0.7, bot: 0.4, noseY: 1.05, hoodY: 1.45, hoodEnd: 1.1, beltY: 1.55 }), 2.1), C, 0, 0, 0, 0, 0, 0, 0.04);
  k.add(extrude(poly([[1.1, 1.45], [0.1, 2.3], [-1.9, 2.35], [-2.7, 1.55]]), 2.0, 0.06), C, 0, 0, 0, 0, 0, 0, 0.06);
  k.add(box(1.5, 0.22, 0.06), 0x35506b, 0, 1.95, 0.62, 0.86);
  for (const s of [-1, 1]) {
    k.add(box(0.06, 0.2, 1.4), 0x35506b, s * 1.06, 1.95, -0.6);
    k.add(box(0.12, 0.55, 4.9), A, s * 1.42, 1.0, 0);
    for (const z of [-1.5, 0, 1.5]) k.add(box(0.06, 0.08, 0.08), 0x222222, s * 1.49, 1.0, z);
  }
  k.add(box(2.6, 0.6, 0.6), A, 0, 0.72, 2.95, 0.5);
  k.add(box(2.2, 0.5, 0.25), C, 0, 0.85, -2.85);
  k.add(box(1.0, 0.4, 1.0), A, 0, 2.55, -0.9);
  k.add(cyl(0.12, 0.12, 0.8, 6), 0x9aa0a8, 0.6, 2.9, -1.6);
  if (level >= 2) { k.add(box(1.8, 0.1, 0.9), C, 0, 2.45, 0.1, 0.2); k.add(new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2f2f2, -0.6, 2.4, -1.8); }
  if (level >= 3) { k.add(cyl(0.3, 0.38, 1.0, 10), 0x9aa0a8, 0, 1.4, -3.1, Math.PI / 2); k.add(cyl(0.42, 0.34, 0.25, 10), A, 0, 1.4, -3.65, Math.PI / 2); }
  return { body: k.geometry(), lights: lights(5.6, 1.0, 1.2, k2 => { for (const x of [-0.5, -0.17, 0.17, 0.5]) k2.add(box(0.2, 0.12, 0.1), 0xffa51f, x, 2.4, 0.35, 0, 0, 0, 0); }) };
}
function tiv(C, A, turret) {
  const k = new Kit();
  k.add(extrude(poly([[-2.9, 0.5], [2.9, 0.5], [3.1, 0.95], [1.6, 1.95], [-2.4, 2.15], [-2.95, 1.6]]), 2.5, 0.08), C, 0, 0, 0, 0, 0, 0, 0.06);
  k.add(box(1.6, 0.2, 0.06), 0x2a3440, 0, 1.6, 2.28, 0.9);
  for (const s of [-1, 1]) {
    k.add(box(0.14, 0.7, 5.6), A, s * 1.5, 0.95, 0);
    k.add(box(0.06, 0.18, 1.2), 0x2a3440, s * 1.32, 1.75, -0.4);
    for (const z of [-2, -1, 0, 1, 2]) k.add(box(0.06, 0.1, 0.1), 0x222222, s * 1.58, 1.1, z);
  }
  k.add(box(2.8, 0.7, 0.5), A, 0, 0.7, 3.1, 0.6);
  if (turret) {
    k.add(cyl(0.8, 0.9, 0.6, 8), A, 0, 2.45, -0.5);
    k.add(new THREE.SphereGeometry(0.55, 10, 5), 0x1b1b1b, 0, 2.9, -0.5);
    k.add(cyl(0.18, 0.18, 1.3, 8), 0x2a2a2a, 0, 2.9, 0.3, Math.PI / 2);
  } else k.add(box(1.2, 0.6, 1.2), A, 0, 2.45, -0.5);
  return { body: k.geometry(), lights: lights(5.8, 1.05, 1.3) };
}

export const VEHICLES = [
  { id: 'dionado', paint: [0x1700eb, 0x3220a7], bar: [2.64, 0.05], name: 'Dionado (custom)', price: 0, hp: 140, mass: 1.25, armor: 1.3, top: 34, probes: 3, fuel: 100, jet: true, anchor: true, len: 4.9, desc: 'Your SUV: armour plates, jet booster, anchor spikes, metal shutters' },
  { id: 'chevron', paint: [0xc0282d], bar: [2.16, -0.2], name: '1992 Chevron 454 SS', price: 3500, hp: 100, mass: 1.0, armor: 1.0, top: 40, probes: 2, fuel: 90, len: 5.3, wb: 1.65, build: pickup, desc: 'Fast, light, easy to fling' },
  { id: 'sumo', paint: [0x2f6b3a, 0x264f2e], bar: [2.47, -0.4], name: '2018 Sumo Woodlands XT', price: 8000, hp: 130, mass: 1.3, armor: 1.1, top: 36, probes: 3, fuel: 110, len: 4.9, build: suv, desc: 'Solid all-rounder' },
  { id: 'ambulance', paint: [0xf4f4f4], bar: [3.27, 0.4], name: '2015 F350 Ambulance', price: 14000, hp: 180, mass: 1.6, armor: 1.2, top: 33, probes: 3, fuel: 130, len: 6.2, wb: 2.0, wr: 0.55, build: ambulance, perk: 'heal', desc: 'EMS: slowly repairs itself' },
  { id: 'dow', paint: [0xf2f2f2], bar: [2.55, 0.75], name: 'DOW Doppler on Wheels', price: 28000, hp: 170, mass: 2.0, armor: 1.3, top: 31, probes: 4, fuel: 140, anchor: true, len: 6.4, wb: 2.1, build: dow, perk: 'radar', desc: 'Long-range radar, +25% probe pay' },
  { id: 'dom1', paint: [0x2b2b2b], bar: [2.56, 0.15], name: 'Dominator 1', price: 40000, hp: 220, mass: 2.1, armor: 1.8, top: 33, probes: 4, fuel: 140, anchor: true, len: 5.6, wb: 1.7, wr: 0.7, track: 1.12, build: () => dominator(0x2b2b2b, 0xff8a1f, 1), desc: 'Armoured interceptor' },
  { id: 'dom2', paint: [0x5a6068], bar: [2.56, 0.15], name: 'Dominator 2', price: 65000, hp: 260, mass: 2.4, armor: 2.1, top: 35, probes: 5, fuel: 150, anchor: true, hailproof: true, len: 5.6, wb: 1.7, wr: 0.7, track: 1.12, build: () => dominator(0x5a6068, 0xd9362b, 2), desc: 'Heavier, hail-proof glass' },
  { id: 'dom3', paint: [0x15151a], bar: [2.56, 0.15], name: 'Dominator 3', price: 100000, hp: 300, mass: 2.8, armor: 2.4, top: 37, probes: 6, fuel: 160, anchor: true, hailproof: true, jet: true, len: 5.6, wb: 1.7, wr: 0.7, track: 1.12, jetY: 1.4, build: () => dominator(0x15151a, 0x2f7dff, 3), desc: 'Top interceptor with jet boost' },
  { id: 'tiv1', paint: [0x4a4f45], bar: [2.15, 1.0], name: 'TIV 1', price: 85000, hp: 330, mass: 3.2, armor: 2.7, top: 27, probes: 4, fuel: 160, anchor: true, hailproof: true, len: 5.8, wb: 1.8, wr: 0.72, track: 1.2, build: () => tiv(0x4a4f45, 0x3a3e36, false), desc: 'Tank. Slow but almost unflingable' },
  { id: 'tiv2', paint: [0x3b3f44], bar: [2.15, 1.0], name: 'TIV 2', price: 150000, hp: 400, mass: 3.8, armor: 3.1, top: 31, probes: 6, fuel: 180, anchor: true, hailproof: true, len: 5.8, wb: 1.8, wr: 0.72, track: 1.2, build: () => tiv(0x3b3f44, 0xff8a1f, true), perk: 'camera', desc: 'IMAX turret camera: photos pay x1.5' },
];
export const UPGRADES = [
  { id: 'engine', name: 'Engine tune', desc: '+6% top speed, quicker acceleration', prices: [2000, 6000, 14000] },
  { id: 'tyres', name: 'Off-road tyres', desc: 'More grip on grass, fields and corn', prices: [1500, 5000, 11000] },
  { id: 'nitro', name: 'Nitro', desc: 'Stronger boost (gives any vehicle a boost flame)', prices: [3000, 8000, 15000] },
  { id: 'tank', name: 'Bigger fuel tank', desc: '+25% fuel', prices: [1200, 4000] },
  { id: 'weight', name: 'Heavier weight', desc: 'Harder to fling', prices: [3000, 8000, 16000] },
  { id: 'windows', name: 'Hail-proof windows', desc: "Hail can't crack glass", prices: [5000] },
  { id: 'probes', name: 'Bigger probe storage', desc: '+1 probe per level', prices: [2500, 6000, 12000] },
  { id: 'armor', name: 'Extra armour', desc: 'Take less damage', prices: [4000, 9000, 18000] },
];
export const PAINTS = [null, 0xc81e28, 0xff7a1a, 0xf2c12e, 0x2f8a3a, 0x5b6b3a, 0x1fa39a, 0x1f5fd9, 0x1700eb, 0x6b2fd9, 0xe0559a, 0xeeeeee, 0x9aa3ad, 0x1d1f24];
export const DECALS = [['none', 'None'], ['flames', 'Flames'], ['stripes', 'Racing stripes'], ['bolt', 'Lightning bolt'], ['chaser', 'STORM CHASER'], ['number', 'Number 13']];
export const HORNS = [['classic', 'Classic'], ['air', 'Air horn'], ['train', 'Train horn'], ['yelp', 'Police yelp']];
export const GEAR = [
  { id: 'anemometer', name: 'Handheld anemometer', price: 1200, desc: 'Measures peak wind near each tornado, paid when it ends' },
  { id: 'gauge', name: 'Rain gauge', price: 800, desc: 'Sell rainfall data after driving through heavy rain' },
  { id: 'hailbox', name: 'Hail collector', price: 1500, desc: 'Collect hailstones for researchers' },
  { id: 'video', name: 'Video camera', price: 2000, desc: 'REC button: film tornadoes and sell the footage' },
];
