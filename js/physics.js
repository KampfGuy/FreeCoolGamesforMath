// Planet, staging math (delta-v, TWR) and orbit math.
import { PARTS, G0, FAIR_SHAPES, FAIR_LEN, fairShellMass, fairShellCost, boosterParts } from './parts.js?v=fleet1';

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

// Solid fuel left in an SRB part (flight copies carry p.sf; fresh parts are full).
export const srbFuel = (p) => (p.sf != null ? p.sf : PARTS[p.type].sfuel || 0);

export function sectionInfo(parts) {
  const o = { dry: 0, fuel: 0, sfuel: 0, thrust: 0, ispVac: 0, ispAtm: 0, liqThrust: 0, liqIspVac: 0, liqIspAtm: 0, srbs: 0, fins: 0, struts: 0, legs: 0, sides: 0, height: 0, cost: 0, engines: 0, tanks: 0, capsule: false, command: false, chute: false, solar: 0, antenna: 0, battery: 0, probe: 0, payDec: 0 };
  let flowV = 0, flowA = 0, lflowV = 0, lflowA = 0;
  for (const p of parts) {
    const P = PARTS[p.type];
    o.dry += P.mass; o.cost += P.cost; o.height += P.h;
    if (P.fuel) { o.fuel += P.fuel; o.tanks++; }
    if (P.srb) { o.sfuel += srbFuel(p); o.srbs++; }
    if (P.thrust) {
      o.thrust += P.thrust; flowV += P.thrust / P.ispVac; flowA += P.thrust / P.ispAtm; o.engines++;
      if (!P.srb) { o.liqThrust += P.thrust; lflowV += P.thrust / P.ispVac; lflowA += P.thrust / P.ispAtm; }
    }
    if (p.type === 'fairing') { o.cost += fairShellCost(p.len); if (!p.jett) o.dry += fairShellMass(p.len); }
    if (p.fins) { o.fins++; o.dry += PARTS.fins.mass; o.cost += PARTS.fins.cost; }
    if (p.legs) { o.legs++; o.dry += PARTS.legs.mass; o.cost += PARTS.legs.cost; }
    if (p.solar) { o.solar++; o.dry += PARTS.solar.mass; o.cost += PARTS.solar.cost; }
    if (P.antenna) o.antenna++;
    if (P.battery) o.battery++;
    if (p.type === 'probe') o.probe++;
    if (p.type === 'payDec') o.payDec++;
    if (p.struts) { o.struts++; o.dry += PARTS.struts.mass; o.cost += PARTS.struts.cost; }
    // side boosters: the decoupler pair is counted here; booster mass is tracked separately (it drops first)
    if (p.side) { o.sides++; o.dry += PARTS.radDec.mass; o.cost += PARTS.radDec.cost + 2 * boosterParts(p.side).reduce((a, q) => a + PARTS[q.type].cost, 0); }
    if (p.type === 'capsule') o.capsule = true;
    if (P.command) o.command = true;
    if (p.type === 'chute') o.chute = true;
  }
  if (o.thrust) { o.ispVac = o.thrust / flowV; o.ispAtm = o.thrust / flowA; }
  if (o.liqThrust) { o.liqIspVac = o.liqThrust / lflowV; o.liqIspAtm = o.liqThrust / lflowA; }
  return o;
}

// One side booster (multiply by 2 for the pair).
export function boosterInfo(side) {
  const i = sectionInfo(boosterParts(side));
  return { ...i, nose: side.nose ? PARTS[side.nose].nose : 1 };
}
// All side-booster pairs on a stack, with their current fuel (flight copies keep side.fuel / side.sf per side).
export function sideBoosters(stack) {
  const out = [];
  stack.forEach((p, idx) => {
    if (!p.side) return;
    const info = boosterInfo(p.side);
    const side = p.side; // live getters: flight burns side.fuel / side.sf in place
    out.push({ host: p, idx, side, info, get fuel() { return side.fuel != null ? side.fuel : info.fuel; }, get sf() { return side.sf != null ? side.sf : info.sfuel; } });
  });
  return out;
}
export const boosterWet = (b) => 2 * (b.info.dry + b.fuel + b.sf);

// ---- Air drag (kept simple). Drag force = q × CdA / 1000 (kN), q = ½ρv².
// CdA = 1.6 × top factor + 1.0 × nose factor per side booster + 0.12 per fin pair + 0.3 for open legs.
//   top factor: blunt top = 1, small nose cone 0.8, large nose cone 0.7,
//   closed fairing: Ogive 0.55, Cone 0.62, Bullet 0.75, Bulbous 0.85 (a fairing covers any nose cone).
export function dragFactor(stack, boosters = sideBoosters(stack)) {
  const fair = stack.find((p) => p.type === 'fairing' && !p.jett);
  let top = 1;
  if (fair) top = (FAIR_SHAPES[fair.shape] || FAIR_SHAPES.ogive).cd;
  else if (stack.length && PARTS[stack[0].type].nose) top = PARTS[stack[0].type].nose;
  let cd = 1.6 * top;
  for (const b of boosters) cd += 2 * 0.5 * b.info.nose;
  return cd;
}

export const stiffLimit = (struts) => 6 + 4 * struts;

// ---- Stage plan with PARALLEL staging. sections: top-first [{ parts, fuel }]; boosters: from sideBoosters().
// Side boosters burn together with Stage 1 (the bottom section). Every engine group (core liquid engines,
// each SRB, each booster pair) burns at full power; a phase lasts until the first group runs dry:
//   exhaust speed of the mix  c = (T1 + T2 + ...) / (ṁ1 + ṁ2 + ...),  ṁ = T / (Isp·g0)
//   Δv of the phase           = c × ln(m_start / m_end)
// When the boosters are empty they are dropped (their dry mass leaves), then the core keeps burning.
// pr = 0 vacuum Isp, 1 = sea-level Isp.
export function planDv(sections, boosters = [], pr = 0) {
  const isp = (a, v) => v + (a - v) * pr;
  const infos = sections.map((s) => sectionInfo(s.parts));
  const wet = sections.map((s, k) => infos[k].dry + s.fuel + infos[k].sfuel);
  const bWet = boosters.reduce((a, b) => a + boosterWet(b), 0);
  const stages = []; let above = 0;
  for (let k = 0; k < sections.length; k++) {
    const bottom = k === sections.length - 1, I = infos[k], s = sections[k];
    const G = [];
    if (I.liqThrust > 0 && s.fuel > 0) G.push({ T: I.liqThrust, isp: isp(I.liqIspAtm, I.liqIspVac), f: s.fuel, b: false });
    for (const p of s.parts) { const P = PARTS[p.type]; if (P.srb && srbFuel(p) > 0) G.push({ T: P.thrust, isp: isp(P.ispAtm, P.ispVac), f: srbFuel(p), b: false }); }
    let bAtt = bottom && boosters.length > 0;
    if (bAtt) for (const b of boosters) {
      if (b.info.liqThrust > 0 && b.fuel > 0) G.push({ T: 2 * b.info.liqThrust, isp: isp(b.info.liqIspAtm, b.info.liqIspVac), f: 2 * b.fuel, b: true });
      for (const q of boosterParts(b.side)) { const P = PARTS[q.type]; if (P.srb && b.sf > 0) G.push({ T: 2 * P.thrust, isp: isp(P.ispAtm, P.ispVac), f: 2 * b.sf, b: true }); }
    }
    let m = above + wet[k] + (bAtt ? bWet : 0);
    const startWet = m;
    const rows = []; let cur = { boosters: bAtt, dv: 0, burn: 0, m0: m, T0: null };
    for (let guard = 0; guard < 40; guard++) {
      if (bAtt && !G.some((g) => g.b && g.f > 1e-9)) {
        // boosters empty: drop them (dry mass + any unburnable fuel)
        rows.push(cur); m -= boosters.reduce((a, b) => a + 2 * b.info.dry + 2 * (b.info.liqThrust ? 0 : b.fuel), 0);
        for (const g of G) if (g.b) g.f = 0;
        bAtt = false; cur = { boosters: false, dv: 0, burn: 0, m0: m, T0: null };
      }
      const A = G.filter((g) => g.f > 1e-9); if (!A.length) break;
      const md = A.map((g) => g.T / (g.isp * G0));
      const T = A.reduce((a, g) => a + g.T, 0), mdt = md.reduce((a, v) => a + v, 0);
      const t = Math.min(...A.map((g, i) => g.f / md[i]));
      if (cur.T0 == null) { cur.T0 = T; cur.m0 = m; }
      const m1 = m - mdt * t;
      cur.dv += (T / mdt) * Math.log(m / m1); cur.burn += t;
      A.forEach((g, i) => (g.f = Math.max(0, g.f - md[i] * t)));
      m = m1;
    }
    rows.push(cur);
    const R = rows.filter((r, i) => r.dv > 0 || i === 0 || r.T0 != null).map((r) => ({ ...r, twr: (r.T0 != null ? r.T0 : I.thrust + (r.boosters ? boosters.reduce((a, b) => a + 2 * b.info.thrust, 0) : 0)) / (r.m0 * G0) }));
    const dv = R.reduce((a, r) => a + r.dv, 0);
    stages.push({ info: I, wet: startWet, dry: startWet - s.fuel - I.sfuel - (bottom ? bWet : 0), fuel: s.fuel + I.sfuel, thrust: I.thrust + (bottom ? boosters.reduce((a, b) => a + 2 * b.info.thrust, 0) : 0), dv, twr: R[0].twr, burn: R.reduce((a, r) => a + r.burn, 0), rows: R, boosters: bottom ? boosters.length : 0, sectionIndex: k });
    above += wet[k];
  }
  stages.reverse(); stages.forEach((s, n) => (s.num = n + 1));
  return stages;
}

// Full design analysis. Stages returned in firing order (Stage 1 = bottom).
export function designSummary(stack) {
  const secs = splitSections(stack); const infos = secs.map(sectionInfo);
  const sections = secs.map((parts, k) => ({ parts, fuel: infos[k].fuel }));
  const boosters = sideBoosters(stack);
  const stages = planDv(sections, boosters, 0);
  const atm = planDv(sections, boosters, 1);
  stages.forEach((s, i) => { s.dvAtm = atm[i].dv; s.rows.forEach((r, j) => (r.dvAtm = atm[i].rows[j] ? atm[i].rows[j].dv : 0)); });
  const cost = infos.reduce((a, i) => a + i.cost, 0);
  const struts = infos.reduce((a, i) => a + i.struts, 0);
  const fins = infos.reduce((a, i) => a + i.fins, 0);
  const height = infos.reduce((a, i) => a + i.height, 0);
  const mass = stages.length ? stages[0].wet : 0;
  const dvTotal = stages.reduce((a, s) => a + s.dv, 0);
  const stiff = stack.length <= stiffLimit(struts);
  const errors = [], warns = [];
  const cmdIdx = stack.findIndex((p) => PARTS[p.type].command);
  if (!stack.length) errors.push('Drag a Pilot Capsule or Probe Core in to start.');
  else if (cmdIdx < 0) errors.push('Add a Pilot Capsule or a Probe Core (something has to steer!).');
  else {
    const topReal = stack.findIndex((p) => p.type !== 'chute' && !PARTS[p.type].nose && !PARTS[p.type].antenna);
    if (topReal !== cmdIdx) errors.push('Put the capsule or probe core on top (only a parachute, nose cone or antenna can sit above it).');
  }
  const fairs = stack.map((p, i) => (p.type === 'fairing' ? i : -1)).filter((i) => i >= 0);
  if (fairs.length > 1) errors.push('Only one fairing per rocket, please.');
  if (fairs.length && fairs[0] === 0) errors.push('A fairing goes UNDER the payload it covers. Move it down.');
  if (stack.length && stages.length && stages[0].info.engines === 0 && !boosters.length) errors.push('The bottom stage needs an engine.');
  stages.forEach((s) => {
    if (s.info.liqThrust && !s.info.tanks) warns.push(`Stage ${s.num} has an engine but no fuel tank.`);
    if (s.info.tanks && !s.info.liqThrust && !s.info.command) warns.push(`Stage ${s.num} has fuel but no engine to burn it.`);
  });
  const pd = stack.findIndex((p) => p.type === 'payDec');
  if (pd === 0) errors.push('A Payload Separator goes UNDER the payload it releases.');
  else if (pd > 0 && fairs.length && fairs[0] < pd) warns.push('The fairing is above the Payload Separator: it will be released together with the payload.');
  for (const b of boosters) if (b.info.fuel && !b.info.liqThrust) warns.push('A side booster has a tank but no engine: pick an engine for it.');
  if (stack.some((p, i) => i > 0 && PARTS[p.type].nose && !(i === 1 && stack[0].type === 'chute'))) warns.push('Nose cones only help on the very top.');
  if (stages.length && stages[0].thrust && stages[0].twr < 1) warns.push(`Stage 1 TWR is ${stages[0].twr.toFixed(2)}. Below 1 = too heavy to lift off!`);
  if (!stiff) warns.push(`Wobbly! ${stack.length} parts but struts only hold ${stiffLimit(struts)}. Add struts or it may snap at high g.`);
  if (stack.length > 2 && fins === 0) warns.push('No fins: the rocket may drift sideways in the air.');
  if (stack.length && !stack.some((p) => p.type === 'chute') && stack.some((p) => p.type === 'capsule')) warns.push('No parachute: soft landings will be very hard.');
  return { stages, cost, struts, fins, height, mass, dvTotal, stiff, errors, warns, parts: stack.length, boosters: boosters.length, cd: dragFactor(stack, boosters) };
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

// ---- Kepler propagation on rails (universal variables; works for ellipses and hyperbolas).
const stumpC = (z) => (z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24);
const stumpS = (z) => { if (z > 1e-8) { const q = Math.sqrt(z); return (q - Math.sin(q)) / (q * q * q); } if (z < -1e-8) { const q = Math.sqrt(-z); return (Math.sinh(q) - q) / (q * q * q); } return 1 / 6 - z / 120; };
export function keplerStep(px, py, vx, vy, mu, dt) {
  const r0 = Math.hypot(px, py), v2 = vx * vx + vy * vy, vr0 = (px * vx + py * vy) / r0, sm = Math.sqrt(mu);
  const alpha = 2 / r0 - v2 / mu;
  let chi = alpha > 1e-12 ? sm * alpha * dt : (sm * dt) / r0, C = 0.5, S = 1 / 6, z = 0;
  for (let i = 0; i < 60; i++) {
    z = alpha * chi * chi; C = stumpC(z); S = stumpS(z);
    const F = ((r0 * vr0) / sm) * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sm * dt;
    const dF = ((r0 * vr0) / sm) * chi * (1 - z * S) + (1 - alpha * r0) * chi * chi * C + r0;
    const d = F / dF; chi -= d;
    if (Math.abs(d) < 1e-10 * (1 + Math.abs(chi))) break;
  }
  z = alpha * chi * chi; C = stumpC(z); S = stumpS(z);
  const f = 1 - ((chi * chi) / r0) * C, g = dt - ((chi * chi * chi) / sm) * S;
  const x = f * px + g * vx, y = f * py + g * vy, r = Math.hypot(x, y);
  const fd = (sm / (r * r0)) * (z * chi * S - chi), gd = 1 - ((chi * chi) / r) * C;
  return { px: x, py: y, vx: fd * px + gd * vx, vy: fd * py + gd * vy };
}

// ---- Vessel type from its parts.
export const VESSEL_TYPES = ['Rocket', 'Satellite', 'Lander', 'Probe', 'Station', 'Capsule', 'Debris'];
export function classifyParts(parts, boosters = 0) {
  const i = sectionInfo(parts);
  if (!i.command) return 'Debris';
  const engines = i.engines > 0 || boosters > 0;
  if (i.payDec && engines) return 'Rocket'; // a carrier with a payload on top
  if (i.legs && engines) return 'Lander';
  if (i.antenna && i.solar && !i.capsule) return 'Satellite';
  if (i.capsule && i.solar && i.battery && !engines) return 'Station';
  if (engines) return 'Rocket';
  if (i.antenna && i.solar) return 'Satellite';
  return i.probe ? 'Probe' : 'Capsule';
}
