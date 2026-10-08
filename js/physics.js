// Planet, staging math (delta-v, TWR) and orbit math.
import { PARTS, G0 } from './parts.js';

export const PLANET = { name: 'Numeria', R: 300000, atm: 30000, rho0: 1.2, H: 4500 };
PLANET.mu = G0 * PLANET.R * PLANET.R;
export const ORBIT_DV = 2300; // rough delta-v needed to reach a low orbit

export function density(alt) {
  if (alt >= PLANET.atm) return 0;
  const a = Math.max(0, alt);
  let d = PLANET.rho0 * Math.exp(-a / PLANET.H);
  if (a > PLANET.atm * 0.7) d *= (PLANET.atm - a) / (PLANET.atm * 0.3);
  return d;
}

export const circleSpeed = (r) => Math.sqrt(PLANET.mu / r);

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
  const o = { dry: 0, fuel: 0, thrust: 0, ispVac: 0, ispAtm: 0, fins: 0, struts: 0, height: 0, cost: 0, engines: 0, tanks: 0, capsule: false, chute: false };
  let flowV = 0, flowA = 0;
  for (const p of parts) {
    const P = PARTS[p.type];
    o.dry += P.mass; o.cost += P.cost; o.height += P.h;
    if (P.fuel) { o.fuel += P.fuel; o.tanks++; }
    if (P.thrust) { o.thrust += P.thrust; flowV += P.thrust / P.ispVac; flowA += P.thrust / P.ispAtm; o.engines++; }
    if (p.fins) { o.fins++; o.dry += PARTS.fins.mass; o.cost += PARTS.fins.cost; }
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
export function orbitOf(px, py, vx, vy) {
  const mu = PLANET.mu, r = Math.hypot(px, py), v2 = vx * vx + vy * vy;
  const h = px * vy - py * vx;
  const rv = px * vx + py * vy;
  const ex = ((v2 - mu / r) * px - rv * vx) / mu, ey = ((v2 - mu / r) * py - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = (h * h) / mu;
  const energy = v2 / 2 - mu / r;
  const bound = energy < 0;
  const rp = p / (1 + e);
  const ra = bound ? Math.max(rp, -mu / energy - rp) : Infinity; // 2a - rp (stable even for straight-up flight)
  return { e, h, p, rp, ra, bound, pe: rp - PLANET.R, ap: ra - PLANET.R, argPe: Math.atan2(ey, ex), energy };
}
