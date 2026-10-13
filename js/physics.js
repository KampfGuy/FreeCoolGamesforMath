// Planet, staging math (delta-v, TWR) and orbit math.
import { PARTS, G0 } from './parts.js';

export const PLANET = { key: 'numeria', name: 'Numeria', R: 300000, atm: 30000, rho0: 1.2, H: 4500 };
PLANET.mu = G0 * PLANET.R * PLANET.R;
export const ORBIT_DV = 2300; // rough delta-v needed to reach a low orbit

// ---- Solar system (patched conics). Every body moves on a circle around its parent.
// Sphere of influence: r_SOI = a * (m / M)^(2/5); masses are proportional to mu, so we use mu ratios.
export const soiRadius = (a, m, M) => a * Math.pow(m / M, 0.4);
export const BODIES = {
  ember: { key: 'ember', name: 'Ember', R: 1.5e8, atm: 0, mu: PLANET.mu * 1e6, parent: null, soi: Infinity, color: '#ffb23f' },
  numeria: Object.assign(PLANET, { parent: 'ember', orbitR: 3.0e9, phase0: 2.2, color: '#2f78c4' }),
  lumo: { key: 'lumo', name: 'Lumo', R: 80000, atm: 0, mu: 1.6 * 80000 * 80000, parent: 'numeria', orbitR: 3.0e6, phase0: 1.9, color: '#a9a9b8' },
};
export const MOON = BODIES.lumo, STAR = BODIES.ember;
for (const b of Object.values(BODIES)) {
  b.children = Object.values(BODIES).filter((c) => c.parent === b.key).map((c) => c.key);
  if (!b.parent) continue;
  const P = BODIES[b.parent];
  b.n = Math.sqrt(P.mu / b.orbitR ** 3); // angular speed (rad/s)
  b.period = (2 * Math.PI) / b.n;
  b.soi = soiRadius(b.orbitR, b.mu, P.mu);
}
// Position / velocity of a body relative to its parent at time t.
export function localState(key, t) {
  const b = BODIES[key]; if (!b.parent) return { x: 0, y: 0, vx: 0, vy: 0 };
  const a = b.phase0 + b.n * t, r = b.orbitR, c = Math.cos(a), s = Math.sin(a);
  return { x: r * c, y: r * s, vx: -r * b.n * s, vy: r * b.n * c };
}
// Relative to the star (the root frame).
export function absState(key, t) {
  const o = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let k = key; k && BODIES[k].parent; k = BODIES[k].parent) { const l = localState(k, t); o.x += l.x; o.y += l.y; o.vx += l.vx; o.vy += l.vy; }
  return o;
}
// State of body `key` as seen from body `frame`.
export function relState(key, frame, t) {
  const a = absState(key, t), b = absState(frame, t);
  return { x: a.x - b.x, y: a.y - b.y, vx: a.vx - b.vx, vy: a.vy - b.vy };
}
// Convert a rocket state from one body frame to another (positions/velocities stay continuous).
export function convertFrame(st, from, to, t) {
  const d = relState(from, to, t);
  return { px: st.px + d.x, py: st.py + d.y, vx: st.vx + d.vx, vy: st.vy + d.vy };
}
// Which body's SOI contains this state (given frame)? Returns new frame key (one hop per call).
export function soiCheck(frame, px, py, t) {
  const b = BODIES[frame];
  if (b.parent && Math.hypot(px, py) > b.soi) return b.parent;
  for (const c of b.children) { const s = localState(c, t); if (Math.hypot(px - s.x, py - s.y) < BODIES[c].soi) return c; }
  return frame;
}

export function density(alt, body = PLANET) {
  if (!body.atm || alt >= body.atm) return 0;
  const a = Math.max(0, alt);
  let d = PLANET.rho0 * Math.exp(-a / PLANET.H);
  if (a > PLANET.atm * 0.7) d *= (PLANET.atm - a) / (PLANET.atm * 0.3);
  return d;
}

export const circleSpeed = (r, body = PLANET) => Math.sqrt(body.mu / r);

// Split a top-first stack into sections at each Stage Separator (separator falls with the lower section).
export function splitSections(stack) {
  const secs = []; let cur = [];
  for (const p of stack) {
    if (p.type === 'dec' && cur.length) { secs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) secs.push(cur);
  return secs;
}

export function sectionInfo(parts) {
  const o = { dry: 0, fuel: 0, thrust: 0, ispVac: 0, ispAtm: 0, fins: 0, struts: 0, legs: 0, height: 0, cost: 0, engines: 0, tanks: 0, capsule: false, chute: false };
  let flowV = 0, flowA = 0;
  for (const p of parts) {
    const P = PARTS[p.type];
    o.dry += P.mass; o.cost += P.cost; o.height += P.h;
    if (P.fuel) { o.fuel += P.fuel; o.tanks++; }
    if (P.thrust) { o.thrust += P.thrust; flowV += P.thrust / P.ispVac; flowA += P.thrust / P.ispAtm; o.engines++; }
    if (p.fins) { o.fins++; o.dry += PARTS.fins.mass; o.cost += PARTS.fins.cost; }
    if (p.legs) { o.legs++; o.dry += PARTS.legs.mass; o.cost += PARTS.legs.cost; }
    if (p.struts) { o.struts++; o.dry += PARTS.struts.mass; o.cost += PARTS.struts.cost; }
    if (p.type === 'capsule') o.capsule = true;
    if (p.type === 'chute') o.chute = true;
  }
  if (o.thrust) { o.ispVac = o.thrust / flowV; o.ispAtm = o.thrust / flowA; }
  return o;
}

export const stiffLimit = (struts) => 6 + 4 * struts;

// Full design analysis. Stages returned in firing order (Stage 1 = bottom).
export function designSummary(stack) {
  const secs = splitSections(stack); const infos = secs.map(sectionInfo);
  const stages = []; let above = 0;
  infos.forEach((i, k) => {
    const wet = above + i.dry + i.fuel; const dry = wet - i.fuel;
    const ok = i.thrust > 0 && i.fuel > 0;
    stages.push({
      info: i, wet, dry, fuel: i.fuel, thrust: i.thrust,
      dv: ok ? i.ispVac * G0 * Math.log(wet / dry) : 0,
      dvAtm: ok ? i.ispAtm * G0 * Math.log(wet / dry) : 0,
      twr: i.thrust / (wet * G0),
      burn: ok ? (i.fuel * i.ispVac * G0) / i.thrust : 0,
      sectionIndex: k,
    });
    above = wet;
  });
  stages.reverse(); stages.forEach((s, n) => (s.num = n + 1));
  const cost = infos.reduce((a, i) => a + i.cost, 0);
  const struts = infos.reduce((a, i) => a + i.struts, 0);
  const fins = infos.reduce((a, i) => a + i.fins, 0);
  const height = infos.reduce((a, i) => a + i.height, 0);
  const mass = stages.length ? stages[0].wet : 0;
  const dvTotal = stages.reduce((a, s) => a + s.dv, 0);
  const stiff = stack.length <= stiffLimit(struts);
  const errors = [], warns = [];
  const capIdx = stack.findIndex((p) => p.type === 'capsule');
  if (!stack.length) errors.push('Drag a Pilot Capsule in to start.');
  else if (capIdx < 0) errors.push('Add a Pilot Capsule (your pilot bot needs a seat).');
  else {
    const topReal = stack.findIndex((p) => p.type !== 'chute');
    if (topReal !== capIdx) errors.push('Put the capsule on top (only a parachute can sit above it).');
  }
  if (stack.length && stages.length && stages[0].info.engines === 0) errors.push('The bottom stage needs an engine.');
  stages.forEach((s) => {
    if (s.info.engines && !s.info.tanks) warns.push(`Stage ${s.num} has an engine but no fuel tank.`);
    if (s.info.tanks && !s.info.engines && s.num > 0 && !s.info.capsule) warns.push(`Stage ${s.num} has fuel but no engine to burn it.`);
  });
  if (stages.length && stages[0].info.engines && stages[0].twr < 1) warns.push(`Stage 1 TWR is ${stages[0].twr.toFixed(2)}. Below 1 = too heavy to lift off!`);
  if (!stiff) warns.push(`Wobbly! ${stack.length} parts but struts only hold ${stiffLimit(struts)}. Add struts or it may snap at high g.`);
  if (stack.length > 2 && fins === 0) warns.push('No fins: the rocket may drift sideways in the air.');
  if (stack.length && !stack.some((p) => p.type === 'chute')) warns.push('No parachute: soft landings will be very hard.');
  return { stages, cost, struts, fins, height, mass, dvTotal, stiff, errors, warns, parts: stack.length };
}

// Orbit from state vectors (2D). Altitudes are above the surface.
export function orbitOf(px, py, vx, vy, body = PLANET) {
  const mu = body.mu, r = Math.hypot(px, py), v2 = vx * vx + vy * vy;
  const h = px * vy - py * vx;
  const rv = px * vx + py * vy;
  const ex = ((v2 - mu / r) * px - rv * vx) / mu, ey = ((v2 - mu / r) * py - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = (h * h) / mu;
  const energy = v2 / 2 - mu / r;
  const bound = energy < 0;
  const rp = p / (1 + e);
  const ra = bound ? Math.max(rp, -mu / energy - rp) : Infinity; // 2a - rp (stable even for straight-up flight)
  return { e, h, p, rp, ra, bound, pe: rp - body.R, ap: ra - body.R, argPe: Math.atan2(ey, ex), energy };
}

// Landing rules. Without legs: total speed under 10 m/s (12 on water). With legs deployed:
// vertical speed up to 12 m/s, sideways up to 5 m/s and a tilt up to 15 degrees are also fine.
export const LEG_VMAX = 12, LEG_HMAX = 5, LEG_TILT = (15 * Math.PI) / 180;
export function landingResult({ vDown, vSide, tilt, water = false, legs = false }) {
  const limit = water ? 12 : 10, sp = Math.hypot(vDown, vSide);
  if (sp <= limit) return { safe: true, why: 'soft' };
  if (legs && vDown <= LEG_VMAX && vSide <= LEG_HMAX && Math.abs(tilt) <= LEG_TILT) return { safe: true, why: 'legs' };
  return { safe: false, limit, sp };
}
