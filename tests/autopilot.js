// Simple autopilot used by tests: flies a Flight from the pad to Lumo and lands (optionally flies home).
import { BODIES, PLANET, relState, localState } from '../js/physics.js';
import { WARPS } from '../js/flight.js';
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

export function* moonMission(f, { home = false, log = () => {} } = {}) {
  const dt = 1 / 30;
  const tick = function* (n = 1) { for (let i = 0; i < n; i++) { f.update(dt); autoStage(); yield; } };
  const autoStage = () => { if (f.ignited && f.bottom.fuel <= 1e-6 && f.sections.length > 1 && f.throttle > 0) f.stage(); };
  const up = () => Math.atan2(f.py, f.px);
  const east = () => up() + Math.PI / 2; // counter-clockwise, same direction Lumo goes
  const setWarp = (i) => { f.warpIdx = Math.min(i, WARPS.length - 1); };
  // 1. ascent (gravity turn toward CCW)
  f.stage(); f.throttle = 1;
  while (f.state === 'flying') {
    const alt = f.alt, pitch = Math.min(1, Math.sqrt(Math.max(0, alt - 800) / 42000)) * (Math.PI / 2) * 0.97;
    f.aim = up() + pitch;
    if (!f.onGround && f.orbit.ap > 80000) break;
    yield* tick();
  }
  f.throttle = 0; f.aim = null; f.hold = 'pro'; log('MECO, Ap ' + Math.round(f.orbit.ap));
  // coast to apoapsis
  while (f.state === 'flying') { const r = Math.hypot(f.px, f.py), vr = (f.vx * f.px + f.vy * f.py) / r; if (vr < 2 && f.alt > 70000) break; setWarp(f.alt > PLANET.atm ? 4 : 3); yield* tick(); }
  setWarp(0); f.throttle = 1;
  while (f.state === 'flying' && f.orbit.pe < 70000) yield* tick();
  f.throttle = 0; log(`orbit Pe ${Math.round(f.orbit.pe)} Ap ${Math.round(f.orbit.ap)} t=${Math.round(f.t)}`);
  // 2. wait for the transfer window
  const L = BODIES.lumo;
  for (;;) {
    const r1 = Math.hypot(f.px, f.py), a = (r1 + L.orbitR) / 2, T = Math.PI * Math.sqrt(a ** 3 / PLANET.mu);
    const want = wrap(Math.PI - L.n * T), ls = localState('lumo', f.t);
    const phase = wrap(Math.atan2(ls.y, ls.x) - Math.atan2(f.py, f.px));
    const d = wrap(phase - want);
    if (d < 0.01 || d > TAU - 0.002) break;
    setWarp(d > 0.4 ? 5 : d > 0.08 ? 4 : 3); yield* tick();
  }
  setWarp(0); f.hold = 'pro'; f.throttle = 1; log('transfer burn at t=' + Math.round(f.t));
  while (f.state === 'flying' && f.body === 'numeria' && f.orbit.ra < L.orbitR - 40000) yield* tick();
  // fine-tune: low throttle until the prediction shows an encounter
  f.throttle = 0.15;
  for (let k = 0; k < 900 && f.state === 'flying' && f.body === 'numeria'; k++) { const p = f.predict(); if (p.enc && p.enc.orbit.pe < 60000) break; yield* tick(); }
  f.throttle = 0; const p0 = f.predict(); log('encounter ' + !!p0.enc + ' lumo Pe ' + (p0.enc && Math.round(p0.enc.orbit.pe)));
  // 3. coast to Lumo
  while (f.state === 'flying' && f.body !== 'lumo') { setWarp(6); yield* tick(); }
  log(`in Lumo SOI t=${Math.round(f.t)} alt=${Math.round(f.alt)} v=${Math.round(f.speed)}`);
  f.hold = 'retro';
  // if we would miss, wait to periapsis-ish then kill speed so we fall in
  if (f.orbit.pe > 0) {
    while (f.state === 'flying') { const r = Math.hypot(f.px, f.py), vr = (f.vx * f.px + f.vy * f.py) / r; if (vr > -5 || f.alt < 30000) break; setWarp(5); yield* tick(); }
    setWarp(0); f.throttle = 1;
    while (f.state === 'flying' && f.orbit.pe > -40000 && f.bottom.fuel + f.fuelTotal > 0) yield* tick();
    f.throttle = 0;
  }
  // 4. suicide burn + gentle touchdown
  const g = L.mu / L.R ** 2;
  while (f.state === 'flying' && !f.onGround) {
    const r = Math.hypot(f.px, f.py), alt = f.alt, v = f.speed;
    const vr = (f.vx * f.px + f.vy * f.py) / r;
    const amax = f.activeInfo.thrust / f.mass;
    const stop = (v * v) / (2 * Math.max(0.5, amax - g));
    if (alt < 6000 && !f.legsDown && f.legs) f.toggleLegs();
    if (alt < 400 && v < 40) {
      // final: point up, hold a slow descent
      f.hold = v > 6 ? 'retro' : 'up';
      const targetVr = -Math.max(1.5, Math.min(12, alt / 15));
      f.throttle = Math.max(0, Math.min(1, (g + (targetVr - vr) * 1.5) / amax));
      setWarp(0);
    } else if (alt < stop * 1.25 + 300) { f.hold = 'retro'; f.throttle = 1; setWarp(0); }
    else { f.throttle = 0; f.hold = 'retro'; setWarp(alt > 60000 ? 4 : alt > 15000 ? 3 : 1); }
    yield* tick();
  }
  f.throttle = 0;
  log(`Lumo: state=${f.state} landed=${f.stats.landedLumo} speed=${f.stats.lumoSpeed && f.stats.lumoSpeed.toFixed(2)} t=${Math.round(f.t)} fuel=${f.fuelTotal.toFixed(2)}`);
  if (!home || f.state !== 'flying') return;
  // 5. home: hop into a low Lumo orbit, then burn when our motion points opposite to Lumo's
  const numeriaPe = () => {
    let x = f.px, y = f.py, vx = f.vx, vy = f.vy, t = f.t; const mu = L.mu;
    for (let i = 0; i < 20000; i++) {
      const r = Math.hypot(x, y); if (r < L.R) return Infinity; if (r > L.soi) break;
      const h = 5, g = -mu / r ** 3; vx += g * x * h; vy += g * y * h; x += vx * h; y += vy * h; t += h;
      if (i === 19999) return Infinity;
    }
    const ls = localState('lumo', t); x += ls.x; y += ls.y; vx += ls.vx; vy += ls.vy;
    const rr = Math.hypot(x, y), v2 = vx * vx + vy * vy, h = x * vy - y * vx, en = v2 / 2 - PLANET.mu / rr;
    const e = Math.sqrt(Math.max(0, 1 + (2 * en * h * h) / PLANET.mu ** 2));
    return (h * h) / PLANET.mu / (1 + e) - PLANET.R;
  };
  yield* tick(30);
  f.hold = 'up'; f.throttle = 1;
  while (f.state === 'flying' && f.alt < 300) yield* tick();
  f.hold = 'free';
  while (f.state === 'flying' && f.orbit.ap < 15000) { f.aim = east() + 0.12; yield* tick(); }
  f.throttle = 0; f.aim = null; f.hold = 'pro';
  while (f.state === 'flying' && f.alt < f.orbit.ap - 200) { setWarp(3); yield* tick(); }
  setWarp(0); f.throttle = 1;
  while (f.state === 'flying' && f.orbit.pe < 8000) yield* tick();
  f.aim = null;
  f.throttle = 0; log(`Lumo orbit Pe ${Math.round(f.orbit.pe)} Ap ${Math.round(f.orbit.ap)}`);
  for (let lead = 0; ; ) {
    const ls = localState('lumo', f.t);
    const d = Math.abs(((Math.atan2(f.vy, f.vx) - Math.atan2(-ls.vy, -ls.vx) - 0.6 + 3 * Math.PI) % TAU) - Math.PI);
    if (d < 0.03) break;
    setWarp(d > 0.3 ? 4 : 2); yield* tick();
  }
  setWarp(0); f.throttle = 1;
  while (f.state === 'flying' && f.body === 'lumo' && numeriaPe() > 15000) { if (f.orbit.e > 1 || f.orbit.ra > L.soi) f.throttle = 0.2; yield* tick(); }
  log('predicted Numeria Pe ' + Math.round(numeriaPe()));
  f.throttle = 0; f.aim = null; log('left Lumo surface, coasting home t=' + Math.round(f.t));
  while (f.state === 'flying' && (f.body !== 'numeria' || f.alt > 60000)) { setWarp(6); yield* tick(); }
  // drop everything but capsule+chute is not needed: just arm chute and point back
  f.hold = 'retro'; f.armChute();
  while (f.state === 'flying') { setWarp(f.alt > PLANET.atm ? 3 : 1); yield* tick(); }
  log(`Home: state=${f.state} safe=${f.stats.landedSafe} back=${f.stats.landedLumoBeforeHome} reason=${f.endReason}`);
}
