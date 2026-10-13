// Headless physics checks: node tests/physics.test.js
import { BODIES, soiRadius, convertFrame, relState, soiCheck, orbitOf, landingResult, designSummary, PLANET } from '../js/physics.js';
import { Flight } from '../js/flight.js';

let fail = 0, pass = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ok  ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('SOI radii');
for (const k of ['numeria', 'lumo']) {
  const b = BODIES[k], P = BODIES[b.parent];
  const f = b.orbitR * Math.pow(b.mu / P.mu, 2 / 5);
  ok(near(b.soi, f, 1e-6 * f) && near(soiRadius(b.orbitR, b.mu, P.mu), f, 1e-6 * f), `${b.name} SOI = a(m/M)^(2/5) = ${(f / 1000).toFixed(0)} km`);
}
ok(BODIES.lumo.orbitR + BODIES.lumo.soi < BODIES.numeria.soi, 'Lumo SOI sits inside Numeria SOI');
ok(near(BODIES.lumo.mu / BODIES.lumo.R ** 2, 1.6, 1e-9), 'Lumo surface gravity 1.6 m/s²');
ok(near(PLANET.mu, 9.81 * PLANET.R ** 2, 1), 'Numeria mu = 9.81 R²');

console.log('Frame transitions');
for (const t of [0, 1234.5, 98765]) {
  const st = { px: 2.9e6, py: 1.1e5, vx: 120, vy: 640 };
  const a = convertFrame(st, 'numeria', 'lumo', t), back = convertFrame(a, 'lumo', 'numeria', t);
  const L = relState('lumo', 'numeria', t);
  ok(near(a.px + L.x, st.px, 1e-6) && near(a.vy + L.vy, st.vy, 1e-9) && near(back.px, st.px, 1e-6) && near(back.vx, st.vx, 1e-9), `numeria<->lumo round trip continuous at t=${t}`);
  const e = convertFrame(st, 'numeria', 'ember', t), eb = convertFrame(e, 'ember', 'numeria', t);
  ok(near(eb.px, st.px, 1e-3) && near(eb.vy, st.vy, 1e-6), `numeria<->ember round trip continuous at t=${t}`);
}
// Flight-level: crossing Lumo's SOI keeps the absolute (Numeria-frame) state continuous
{
  const f = new Flight([{ type: 'capsule' }, { type: 'tankS' }, { type: 'engV' }]);
  const t0 = 500; f.t = t0;
  const L = relState('lumo', 'numeria', t0);
  const d = BODIES.lumo.soi + 2000; // just outside, falling straight at Lumo
  f.debugPlace({ body: 'numeria', alt: 0 });
  f.px = L.x + d; f.py = L.y; f.vx = L.vx - 400; f.vy = L.vy; f.t = t0;
  let before = null; let switched = false;
  for (let i = 0; i < 4000 && !switched; i++) {
    const L2 = relState('lumo', 'numeria', f.t);
    before = { x: f.px, y: f.py, vx: f.vx, vy: f.vy, t: f.t };
    f.step(0.05);
    if (f.body === 'lumo') switched = true;
  }
  ok(switched, 'rocket switched into Lumo SOI');
  const L3 = relState('lumo', 'numeria', f.t);
  const absX = f.px + L3.x, absVx = f.vx + L3.vx;
  ok(Math.abs(absX - (before.x + before.vx * 0.05)) < 30 && Math.abs(absVx - before.vx) < 1, `continuity at SOI crossing (Δx=${(absX - before.x).toFixed(1)} m in one 0.05 s step, Δv=${(absVx - before.vx).toFixed(3)} m/s)`);
  ok(soiCheck('lumo', f.px, f.py, f.t) === 'lumo', 'soiCheck stays in lumo just inside');
  const evt = f.events.find((e) => e.soi);
  ok(evt && /Lumo/.test(evt.msg), 'SOI-change toast emitted: ' + (evt && evt.msg));
}
// Leaving Numeria → Ember
{
  const f = new Flight([{ type: 'capsule' }, { type: 'tankS' }, { type: 'engV' }]);
  f.debugPlace({ body: 'numeria', alt: BODIES.numeria.soi - PLANET.R - 500, vx: 0, vy: 0, angle: -Math.PI / 2 });
  f.vy = -800;
  for (let i = 0; i < 100 && f.body === 'numeria'; i++) f.step(0.1);
  ok(f.body === 'ember' && f.stats.soi.ember, 'escaping Numeria SOI puts you in Ember orbit');
  const o = orbitOf(f.px, f.py, f.vx, f.vy, BODIES.ember);
  ok(o.bound && o.e < 0.1, `solar orbit is bound, e=${o.e.toFixed(4)}`);
}

console.log('Landing rules');
ok(landingResult({ vDown: 3, vSide: 0, tilt: 0, legs: true }).safe, 'legs, 3 m/s: safe');
ok(!landingResult({ vDown: 20, vSide: 0, tilt: 0, legs: true }).safe, 'legs, 20 m/s: crash');
ok(landingResult({ vDown: 11.5, vSide: 1, tilt: 0.1, legs: true }).safe, 'legs, 11.5 m/s & 6°: safe');
ok(!landingResult({ vDown: 11.5, vSide: 1, tilt: 0.1, legs: false }).safe, 'no legs, 11.5 m/s: crash (old 10 m/s rule)');
ok(!landingResult({ vDown: 11, vSide: 0, tilt: 0.4, legs: true }).safe, 'legs, 11 m/s but 23° tilt: crash');
ok(landingResult({ vDown: 9, vSide: 0, tilt: 0, legs: false }).safe, 'no legs, 9 m/s: safe (unchanged)');
function moonDrop(speed, legs) {
  const f = new Flight([{ type: 'capsule' }, { type: 'tankS' }, { type: 'engV', legs: 1 }]);
  f.debugPlace({ body: 'lumo', alt: 2, vx: 0, vy: -speed, legs, angle: Math.PI / 2 });
  for (let i = 0; i < 2000 && f.state === 'flying' && !f.onGround; i++) f.step(1 / 120);
  return f;
}
let f = moonDrop(3, true); ok(f.state === 'flying' && f.onGround && f.stats.landedLumo, 'Moon landing with legs @3 m/s: safe (landed on Lumo)');
f = moonDrop(20, true); ok(f.state === 'crashed', 'Moon landing with legs @20 m/s: crash');
f = moonDrop(11, true); ok(f.stats.landedLumo, 'Moon landing with legs @11 m/s: safe');
f = moonDrop(11, false); ok(f.state === 'crashed', 'Moon landing without legs @11 m/s: crash');

console.log('Old missions still sane');
const EX_HOPPER = [{ type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engS', fins: 1 }];
{
  const f = new Flight(EX_HOPPER); f.stage();
  for (let i = 0; i < 60 * 1500 && f.state === 'flying'; i++) { f.update(1 / 60); if (f.bottom.fuel <= 0 && !f.chuteArmed) f.armChute(); }
  ok(f.stats.maxAlt > 5000 && f.state === 'landed' && f.stats.landedSafe, `Hopper: First Hop works (max ${Math.round(f.stats.maxAlt)} m, ${f.state})`);
}
const S = designSummary([{ type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engV', legs: 1 }]);
ok(Math.abs(S.cost - (100 + 300 + 170 + 360 + 60)) < 1e-9, 'legs cost 60 counted');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
