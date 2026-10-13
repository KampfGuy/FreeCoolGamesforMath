// Flight simulation (2D patched-conic orbital mechanics: star Ember, planet Numeria, moon Lumo) + rendering.
import { PARTS, W, TAU, G0, drawStack, COL, legFootDrop, boosterParts, SIDE_DX, FAIR_LEN, drawFairingShell, fairShellMass } from './parts.js?v=fleet1';
import { PLANET, BODIES, density, splitSections, sectionInfo, orbitOf, circleSpeed, stiffLimit, relState, localState, convertFrame, soiCheck, landingResult, sideBoosters, boosterWet, boosterInfo, dragFactor, planDv, srbFuel, classifyParts } from './physics.js?v=fleet1';

export const WARPS = [1, 2, 5, 10, 50, 500, 5000];
const WARP_BURN = 2, WARP_AIR = 3; // max warp index while burning / on the ground, and inside the air
export const WATER = [[0.45, 1.35], [2.2, 3.0], [3.8, 4.6], [5.3, 5.9]];
export const PAD_PHI = Math.PI / 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const norm = (a) => ((a % TAU) + TAU) % TAU;
export function terrainAt(phi, body = 'numeria') { if (body !== 'numeria') return 'land'; phi = norm(phi); for (const [a, b] of WATER) if (phi >= a && phi <= b) return 'water'; return 'land'; }
function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

const CLOUDS = Array.from({ length: 420 }, (_, i) => ({ phi: ((i + hash(i)) / 420) * TAU, alt: 1200 + hash(i + 7) * 3400, w: 160 + hash(i + 13) * 380, n: 3 + Math.floor(hash(i + 19) * 3) }));
export const STARS = Array.from({ length: 240 }, (_, i) => ({ x: hash(i + 101), y: hash(i + 202), s: hash(i + 303) < 0.15 ? 2 : 1 }));
// Lumo's craters (visual only): angle on the surface and radius in meters.
export const CRATERS = Array.from({ length: 70 }, (_, i) => ({ phi: hash(i + 501) * TAU, r: 400 + Math.pow(hash(i + 601), 2.2) * 9000 }));
const T_LOCAL = (r, b) => TAU * Math.sqrt((r * r * r) / b.mu);

const SAVE_KEYS = ['id', 'name', 'vtype', 'autoName', 'body', 'px', 'py', 'vx', 'vy', 'heading', 'onGround', 'leftGround', 'state', 'legsDown', 'chuteArmed', 'chute', 't', 't0', 'stats', 'released', 'mission', 'endReason'];
export class Flight {
  constructor(stack, o = {}) {
    const copy = (stack || []).map((p) => {
      const q = { ...p };
      if (PARTS[q.type].srb) q.sf = PARTS[q.type].sfuel;
      if (q.side) { const bi = boosterInfo(q.side); q.side = { ...q.side, fuel: bi.fuel, sf: bi.sfuel }; }
      if (q.type === 'fairing') q.jett = false;
      return q;
    });
    this.sections = o.sections || splitSections(copy).map((parts) => { const i = sectionInfo(parts); return { parts, fuel: i.fuel, fuelMax: i.fuel, sfMax: i.sfuel }; });
    this.boostersLit = false; this.coreFlame = 0; this.sideFlame = 0;
    this.body = 'numeria';
    this.px = 0; this.py = PLANET.R; this.vx = 0; this.vy = 0;
    this.heading = Math.PI / 2; this.omega = 0;
    this.throttle = 0; this.ignited = false;
    this.chuteArmed = false; this.chute = 0;
    this.legsDown = false; this.legAnim = 0;
    this.onGround = true; this.leftGround = false;
    this.warpIdx = 0; this.t = o.t || 0; this.t0 = this.t; this.isp = 0;
    this.world = null; this.spawned = []; this.name = ''; this.vtype = ''; this.released = false;
    this.state = 'flying'; this.endReason = '';
    this.stats = { usedBoosters: false, fairingJett: false, maxAlt: 0, maxSpeed: 0, maxG: 0, orbit: false, landedSafe: false, splash: false, dvUsed: 0, space: false, soi: { numeria: true }, landedLumo: false, lumoSpeed: 0, landedLumoBeforeHome: false };
    this.debris = []; this.particles = []; this.events = [];
    this.hold = 'free'; this.aim = null; this.turn = 0;
    this.thrustNow = 0; this.gNow = 0; this.flags = {};
    this.pred = null; this.predT = -1;
    this.recalc();
    this.orbit = orbitOf(this.px, this.py, this.vx, this.vy, this.B);
  }
  get B() { return BODIES[this.body]; }
  emit(msg, kind = 'info') { this.events.push({ msg, kind }); }
  once(key, msg, kind) { if (!this.flags[key]) { this.flags[key] = true; this.emit(msg, kind); } }
  // Vessel type tag from the parts (Rocket, Satellite, Lander, Probe, Station, Capsule, Debris).
  classify() { return classifyParts(this.allParts, this.boosters.length); }
  get powered() { return this.allParts.some((p) => p.solar); }
  // A new craft made from some of our sections, placed `offset` m along our heading, pushed by `dv` m/s.
  spawnChild(sections, offset, dv) {
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    const c = new Flight(null, { sections, t: this.t });
    Object.assign(c, { body: this.body, px: this.px + hx * offset, py: this.py + hy * offset, vx: this.vx + hx * dv, vy: this.vy + hy * dv, heading: this.heading, onGround: false, leftGround: true, stats: this.stats, released: true });
    c.recalc();
    c.vtype = c.classify();
    if (c.vtype === 'Debris') c.omega = (Math.random() - 0.5) * 0.5;
    c.orbit = orbitOf(c.px, c.py, c.vx, c.vy, c.B);
    this.spawned.push(c);
    return c;
  }
  // Payload Separator: everything above the top-most one flies off as its own craft.
  release() {
    if (this.state !== 'flying') return false;
    const all = this.allParts, i = all.findIndex((p) => p.type === 'payDec');
    if (i < 0) { this.emit('No Payload Separator on this craft.', 'warn'); return false; }
    if (this.hasFairing && this.fairingIdx > i) { this.emit('Open the fairing first (F): the payload is still inside.', 'warn'); return false; }
    const upper = [], lower = []; let k = 0;
    for (const s of this.sections) {
      const n = s.parts.length;
      if (k + n <= i) upper.push(s);
      else if (k > i) lower.push(s);
      else {
        const j = i - k, up = s.parts.slice(0, j), lo = s.parts.slice(j);
        const cap = (ps) => ps.reduce((a, p) => a + (PARTS[p.type].fuel || 0), 0), cu = cap(up), cl = cap(lo), tot = cu + cl;
        const fu = tot ? (s.fuel * cu) / tot : 0;
        if (up.length) upper.push({ parts: up, fuel: fu, fuelMax: tot ? (s.fuelMax * cu) / tot : 0, sfMax: sectionInfo(up).sfuel });
        lower.push({ parts: lo, fuel: s.fuel - fu, fuelMax: tot ? (s.fuelMax * cl) / tot : 0, sfMax: sectionInfo(lo).sfuel });
      }
      k += n;
    }
    if (!upper.length) { this.emit('Nothing above the Payload Separator.', 'warn'); return false; }
    const ui = sectionInfo(upper.flatMap((s) => s.parts)), li = sectionInfo(lower.flatMap((s) => s.parts));
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    let payload;
    if (li.command || !ui.command) {
      // the carrier keeps control; the payload drifts away forward
      this.sections = lower; payload = this.spawnChild(upper, li.height, 0.8);
      this.vx -= hx * 0.3; this.vy -= hy * 0.3;
    } else {
      // the carrier has no brain: control moves to the payload, the carrier becomes debris
      this.sections = upper; payload = this;
      this.spawnChild(lower, 0, -0.5);
      this.px += hx * li.height; this.py += hy * li.height; this.vx += hx * 0.3; this.vy += hy * 0.3;
    }
    this.recalc();
    this.ignited = this.ignited && this.activeInfo.engines > 0 && payload !== this;
    if (payload === this) { this.ignited = false; this.throttle = 0; }
    this.stats.released = true; this.flags.empty = false;
    const pt = classifyParts(upper.flatMap((s) => s.parts));
    this.emit(`Payload released! ${pt === 'Debris' ? 'It has no probe core, so it is just debris.' : `New ${pt.toLowerCase()} in the world.${payload === this ? '' : ' Press ] to switch to it.'}`}`, 'good');
    return payload;
  }
  recalc() {
    let dry = 0, fins = 0, struts = 0, legs = 0, n = 0, height = 0, capsule = false, chute = false, te = 0;
    for (const s of this.sections) {
      const i = sectionInfo(s.parts);
      dry += i.dry; fins += i.fins; struts += i.struts; legs += i.legs; n += s.parts.length; height += i.height;
      capsule = capsule || i.command; chute = chute || i.chute; te += i.tanks + i.engines;
    }
    Object.assign(this, { dry, fins, struts, legs, partCount: n, height, hasCapsule: capsule, hasChute: chute });
    this.capsuleOnly = te === 0;
    this.wobbly = n > stiffLimit(struts);
    this.activeInfo = sectionInfo(this.bottom.parts);
    this.allParts = this.sections.flatMap((s) => s.parts);
    this.boosters = sideBoosters(this.allParts);
    this.cd = dragFactor(this.allParts, this.boosters);
    const fi = this.allParts.findIndex((p) => p.type === 'fairing' && !p.jett);
    this.fairingIdx = fi;
    if (fi >= 0) { let cov = 0; for (let j = 0; j < fi; j++) cov += PARTS[this.allParts[j].type].h; this.fairingCover = cov; height += FAIR_LEN[this.allParts[fi].len || 2].ext + (this.allParts[fi].shape === 'bulb' ? 0.4 : 0); }
    this.height = height;
    this.footDrop = legFootDrop(this.allParts);
    if (!legs) this.legsDown = false;
  }
  get bottom() { return this.sections[this.sections.length - 1]; }
  get fuelTotal() { return this.sections.reduce((a, s) => a + s.fuel + s.parts.reduce((b, p) => b + (p.sf || 0), 0), 0); }
  get boosterMass() { return this.boosters.reduce((a, b) => a + boosterWet(b), 0); }
  get mass() { return this.dry + this.fuelTotal + this.boosterMass; }
  // SRBs in the active section + side-booster SRBs that are lit and still have fuel
  get srbBurning() { return this.ignited && (this.bottom.parts.some((p) => p.sf > 0) || (this.boostersLit && this.boosters.some((b) => PARTS[b.side.body].srb && b.side.sf > 0))); }
  get hasFairing() { return this.fairingIdx >= 0; }
  jettisonFairing() {
    if (this.state !== 'flying') return false;
    const i = this.fairingIdx;
    if (i < 0) { this.emit('No fairing to open.', 'warn'); return false; }
    const p = this.allParts[i];
    // where the fairing base is along the rocket (meters up from the bottom)
    let below = 0; for (let j = this.allParts.length - 1; j >= i; j--) below += PARTS[this.allParts[j].type].h;
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading), nx = -hy, ny = hx;
    const cover = this.fairingCover, m = fairShellMass(p.len) / 2;
    for (const side of [-1, 1]) {
      this.debris.push({ fairing: { shape: p.shape || 'ogive', len: p.len || 2, cover, half: side }, body: this.body, px: this.px + hx * below, py: this.py + hy * below, vx: this.vx + nx * side * 6, vy: this.vy + ny * side * 6, heading: this.heading, omega: -side * 0.8, mass: m, t: 0 });
    }
    p.jett = true; this.stats.fairingJett = true;
    this.recalc();
    this.emit('Fairing open! The two halves fall away.', 'good');
    return true;
  }
  dropBoosters() {
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading), nx = -hy, ny = hx;
    for (const b of this.boosters) {
      let below = 0; for (let j = this.allParts.length - 1; j > b.idx; j--) below += PARTS[this.allParts[j].type].h;
      const parts = boosterParts(b.side), m = b.info.dry + b.fuel + b.sf;
      for (const side of [-1, 1]) this.debris.push({ parts, body: this.body, px: this.px + hx * below + nx * side * SIDE_DX, py: this.py + hy * below + ny * side * SIDE_DX, vx: this.vx + nx * side * 4 - hx * 2, vy: this.vy + ny * side * 4 - hy * 2, heading: this.heading, omega: -side * 0.35, mass: Math.max(0.2, m), cd: 0.5 * b.info.nose, t: 0, burn: b.side.sf > 0 && PARTS[b.side.body].srb });
      delete b.host.side;
    }
    const n = this.boosters.length * 2;
    this.recalc(); this.flags.boostEmpty = false;
    this.emit(`Side boosters away! (${n} dropped) The core keeps burning.`, 'good');
  }
  get alt() { return Math.hypot(this.px, this.py) - this.B.R; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get turnRate() { return clamp(1.3 / Math.sqrt(this.mass), 0.3, 0.9); }
  get footOff() { return this.legsDown ? this.footDrop * Math.min(1, this.legAnim) : 0; }
  // altitude above Numeria from anywhere (used by the old missions)
  get altNumeria() {
    if (this.body === 'numeria') return this.alt;
    const d = relState('numeria', this.body, this.t);
    return Math.hypot(this.px - d.x, this.py - d.y) - PLANET.R;
  }

  toggleLegs() {
    if (this.state !== 'flying') return;
    if (!this.legs) { this.emit('No landing legs on this rocket.', 'warn'); return; }
    this.legsDown = !this.legsDown;
    this.emit(this.legsDown ? 'Landing legs down: safe up to 12 m/s and 15° tilt.' : 'Landing legs up.');
  }

  stage() {
    if (this.state !== 'flying') return;
    if (!this.ignited && (this.activeInfo.engines > 0 || this.boosters.length)) {
      this.ignited = true;
      if (this.throttle < 0.05) this.throttle = 1;
      if (this.boosters.length) { this.boostersLit = true; this.stats.usedBoosters = true; }
      const srb = this.activeInfo.srbs > 0 || this.boosters.some((b) => PARTS[b.side.body].srb);
      this.emit((this.onGround ? 'Liftoff! Engines on.' : 'Engines on!') + (this.boosters.length ? ' Side boosters firing.' : '') + (srb ? ' Solid boosters burn at full power until empty.' : ''));
      return;
    }
    if (this.boosters.length) { this.dropBoosters(); return; }
    if (this.sections.length > 1) {
      const dropped = this.sections.pop();
      const di = sectionInfo(dropped.parts);
      const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      if (this.world || di.command) { const c = this.spawnChild([dropped], 0, -3); if (di.command) this.emit(`The dropped stage has a ${di.capsule ? 'capsule' : 'probe core'}: it is now its own ${c.vtype.toLowerCase()}. Press ] to fly it.`, 'good'); }
      else this.debris.push({ parts: dropped.parts, body: this.body, px: this.px, py: this.py, vx: this.vx - hx * 3, vy: this.vy - hy * 3, heading: this.heading, omega: (Math.random() - 0.5) * 0.5, mass: di.dry + dropped.fuel, t: 0 });
      this.px += hx * di.height; this.py += hy * di.height;
      this.vx += hx * 1; this.vy += hy * 1;
      this.recalc();
      this.ignited = this.activeInfo.engines > 0;
      this.flags.empty = false;
      const left = this.sections.length;
      this.emit(`Stage dropped! ${this.ignited ? 'Next engines on.' : 'Coasting.'} (${left} section${left > 1 ? 's' : ''} left)`);
      return;
    }
    if (this.hasFairing) { this.jettisonFairing(); return; }
    if (this.allParts.some((p) => p.type === 'payDec')) { this.release(); return; }
    if (this.hasChute && !this.chuteArmed) { this.armChute(); return; }
    this.emit('Nothing left to stage.');
  }
  armChute() {
    if (!this.hasChute) { this.emit('No parachute on this rocket.', 'warn'); return; }
    if (this.chuteArmed) return;
    this.chuteArmed = true;
    this.emit(this.B.atm ? 'Parachute armed: it opens in the air below 300 m/s.' : `Parachute armed. ${this.B.name} has no air, so it will wait until you are back in Numeria's air.`);
  }

  // Highest warp allowed right now (index into WARPS) and why.
  warpCap() {
    const burning = this.thrustNow > 0 || this.srbBurning;
    if (burning || this.onGround) return [WARP_BURN, `Warp is ×${WARPS[WARP_BURN]} max while engines burn or on the ground.`];
    const alt = this.alt, b = this.B;
    if (b.atm && alt < b.atm) return [WARP_AIR, `Warp is ×${WARPS[WARP_AIR]} max in the air.`];
    // don't let one frame of warp jump through the ground
    const r = Math.hypot(this.px, this.py), vDown = Math.max(20, -(this.vx * this.px + this.vy * this.py) / r);
    let i = WARPS.length - 1;
    while (i > WARP_AIR && WARPS[i] * 0.05 * vDown > 0.25 * alt) i--;
    return [i, 'Warp lowered: getting close to the ground.'];
  }

  update(dt) {
    if (this.state === 'flying') {
      const [maxIdx, why] = this.warpCap();
      if (this.warpIdx > maxIdx) { this.warpIdx = maxIdx; this.emit(why); }
      const warp = WARPS[this.warpIdx];
      const simT = dt * warp;
      let hstep = warp <= 5 ? 1 / 120 : warp <= 10 ? 1 / 30 : warp <= 50 ? 0.05 : clamp(0.002 * T_LOCAL(Math.hypot(this.px, this.py), this.B), 0.2, 20);
      const steps = Math.min(3000, Math.ceil(simT / hstep));
      for (let i = 0; i < steps && this.state === 'flying'; i++) this.step(simT / steps);
      this.updateDebris(simT);
      if (this.state === 'flying') this.frameChecks(dt);
    } else this.updateDebris(dt);
    this.legAnim = clamp(this.legAnim + (this.legsDown ? dt : -dt) / 0.8, 0, 1);
    this.updateParticles(dt);
  }

  frameChecks(dt) {
    const alt = this.alt, s = this.stats, b = this.B;
    s.maxAlt = Math.max(s.maxAlt, this.altNumeria);
    if (s.maxAlt > 30) this.leftGround = true;
    s.maxSpeed = Math.max(s.maxSpeed, this.speed);
    if (!this.onGround) s.maxG = Math.max(s.maxG, this.gNow);
    this.orbit = orbitOf(this.px, this.py, this.vx, this.vy, b);
    if (this.altNumeria > PLANET.atm) { if (!s.space) { s.space = true; this.emit('You reached space! (above 30 km)', 'good'); } }
    if (this.body === 'numeria' && alt > PLANET.atm && this.orbit.bound && this.orbit.pe > PLANET.atm && !s.orbit) { s.orbit = true; this.emit('ORBIT! Your low point is above the air. You are falling around the planet.', 'good'); }
    if (this.body === 'lumo' && !this.onGround && this.orbit.bound && this.orbit.pe > 3000 && this.orbit.ra < b.soi) this.once('lumoOrbit', 'You are orbiting Lumo!', 'good');
    if (this.boostersLit && this.boosters.length && this.boosters.every((b) => b.side.fuel <= 1e-6 && b.side.sf <= 1e-6)) this.once('boostEmpty', 'Side boosters burned out: press STAGE (Space) to drop them.', 'warn');
    if (this.ignited && this.bottom.fuel <= 1e-6 && !this.bottom.parts.some((p) => p.sf > 0) && this.activeInfo.engines > 0) this.once('empty', this.sections.length > 1 ? 'Stage out of fuel: press STAGE (Space) to drop it.' : 'Out of fuel!', 'warn');
    if (this.wobbly && this.gNow > 3) this.once('wob', 'Wobbly! Too many parts for your struts.', 'warn');
    if (this.body === 'lumo' && this.legs && !this.legsDown && alt < 3000 && !this.onGround) this.once('legHint', 'Tip: press G to put your landing legs down!', 'warn');
    // exhaust puffs in the air
    const rho = density(alt, b);
    if (this.thrustNow > 0 && rho > 0.03 && WARPS[this.warpIdx] === 1 && this.particles.length < 140) {
      const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      for (let k = 0; k < 2; k++) this.particles.push({ x: this.px - hx * 1.5 + (Math.random() - 0.5), y: this.py - hy * 1.5 + (Math.random() - 0.5), vx: this.vx * 0.4 - hx * 25 + (Math.random() - 0.5) * 8, vy: this.vy * 0.4 - hy * 25 + (Math.random() - 0.5) * 8, life: 0, max: 2 + Math.random() * 1.5, r: 1 + Math.random(), c: 235 });
    }
  }

  // Change reference body (patched conics): position & velocity are shifted so the motion is continuous.
  switchFrame(to) {
    const from = this.body;
    const st = convertFrame(this, from, to, this.t);
    Object.assign(this, st);
    this.body = to; this.particles = []; this.pred = null; this.encounter = null;
    this.stats.soi[to] = true;
    const B = BODIES[to];
    const verb = BODIES[from].parent === to ? `Left ${BODIES[from].name}'s sphere of influence.` : `Entered ${B.name}'s sphere of influence!`;
    this.emit(`${verb} Now orbiting ${B.name}.`, 'good');
    this.events[this.events.length - 1].soi = true;
  }

  step(dt) {
    const b = this.B, R = b.R, mu = b.mu;
    let r = Math.hypot(this.px, this.py);
    const alt = r - R, ux = this.px / r, uy = this.py / r;
    const rho = density(alt, b), m = this.mass, v = Math.hypot(this.vx, this.vy);
    // --- rotation
    const rate = this.turnRate;
    let want = null;
    if (this.aim != null) want = this.aim;
    else if (this.hold === 'pro' && v > 3) want = Math.atan2(this.vy, this.vx);
    else if (this.hold === 'retro' && v > 3) want = Math.atan2(-this.vy, -this.vx);
    else if (this.hold === 'up') want = Math.atan2(uy, ux);
    if (this.onGround) this.omega = 0;
    else if (dt > 0.1 && !this.turn) { // big warp steps: snap to the auto-point target, no spin
      if (want != null) this.heading = want;
      this.omega = 0;
    } else {
      let target = 0;
      if (this.turn) target = this.turn * rate;
      else if (want != null) target = clamp(angDiff(want, this.heading) * 3, -rate, rate);
      let alpha = (target - this.omega) * 5;
      if (rho > 0 && v > 15) {
        const k = (0.5 * rho * v * v) / 40000, vdir = Math.atan2(this.vy, this.vx);
        if (this.capsuleOnly) alpha += k * 3 * Math.sin(angDiff(vdir + Math.PI, this.heading));
        else if (this.fins > 0) alpha += k * 1.6 * Math.min(2, this.fins) * Math.sin(angDiff(vdir, this.heading));
        else alpha -= k * 2.0 * Math.sin(angDiff(vdir, this.heading));
      }
      this.omega += alpha * Math.min(dt, 0.1); this.heading += this.omega * dt;
    }
    // --- thrust
    // Liquid engines follow the throttle. SRBs ignore it: once lit, full thrust until empty.
    let thrust = 0, flow = 0, coreT = 0, coreMax = 0, sideT = 0, sideMax = 0; const act = this.bottom, info = this.activeInfo;
    const pr = Math.min(1, rho / PLANET.rho0);
    const burn = (T, ia, iv, have) => { // returns [thrust, fuel used]
      if (T <= 0 || have <= 0) return [0, 0];
      const isp = iv + (ia - iv) * pr; let used = (T / (isp * G0)) * dt;
      if (used > have) { T *= have / used; used = have; }
      thrust += T; flow += T / (isp * G0); return [T, used];
    };
    if (this.ignited) {
      coreMax = info.thrust;
      if (info.liqThrust > 0 && this.throttle > 0) { const [T, u] = burn(info.liqThrust * this.throttle, info.liqIspAtm, info.liqIspVac, act.fuel); act.fuel -= u; coreT += T; }
      for (const p of act.parts) if (p.sf > 0) { const P = PARTS[p.type]; const [T, u] = burn(P.thrust, P.ispAtm, P.ispVac, p.sf); p.sf -= u; coreT += T; }
      if (this.boostersLit) for (const b of this.boosters) {
        const sd = b.side; sideMax += b.info.thrust;
        if (b.info.liqThrust > 0 && this.throttle > 0) { const [T, u] = burn(2 * b.info.liqThrust * this.throttle, b.info.liqIspAtm, b.info.liqIspVac, 2 * sd.fuel); sd.fuel -= u / 2; sideT += T / 2; }
        const P = PARTS[sd.body];
        if (P.srb && sd.sf > 0) { const [T, u] = burn(2 * P.thrust, P.ispAtm, P.ispVac, 2 * sd.sf); sd.sf -= u / 2; sideT += T / 2; }
      }
      if (thrust > 0) { this.stats.dvUsed += (thrust / m) * dt; this.isp = thrust / (flow * G0); }
    }
    this.coreFlame = coreMax ? coreT / coreMax : 0; this.sideFlame = sideMax ? sideT / sideMax : 0;
    this.thrustNow = thrust;
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    const g = mu / (r * r);
    let ax = -g * ux + (hx * thrust) / m, ay = -g * uy + (hy * thrust) / m;
    let dragA = 0;
    if (rho > 0 && v > 0.01) {
      const q = 0.5 * rho * v * v;
      dragA = (q * (this.cd + 0.12 * this.fins + 0.3 * this.legAnim * Math.min(1, this.legs))) / (1000 * m);
      if (this.chute > 0) dragA += Math.min(40, (q * 600 * this.chute) / (1000 * m));
      ax -= (this.vx / v) * dragA; ay -= (this.vy / v) * dragA;
    }
    if (this.chuteArmed && this.chute < 1 && rho > 0.0005 && v < 300) {
      this.chute = Math.min(1, this.chute + dt / 2.5);
      this.once('chuteOpen', 'Parachute open!', 'good');
    }
    this.gNow = (thrust / m + dragA) / G0;
    this.t += dt;
    if (this.onGround) {
      if (ax * ux + ay * uy <= 0) { this.vx = 0; this.vy = 0; return; }
      this.onGround = false;
    }
    this.vx += ax * dt; this.vy += ay * dt;
    this.px += this.vx * dt; this.py += this.vy * dt;
    if (this.wobbly && this.gNow > 4.5) { this.crash(`Snap! The tall rocket wobbled apart at ${this.gNow.toFixed(1)} g. Add struts.`); return; }
    // --- ground contact
    r = Math.hypot(this.px, this.py);
    const foot = this.footOff;
    const altB = r - R - foot;
    const altT = Math.hypot(this.px + hx * this.height, this.py + hy * this.height) - R;
    if (Math.min(altB, altT) <= 0) {
      this.contact(foot);
      return;
    }
    // --- spheres of influence
    const nb = soiCheck(this.body, this.px, this.py, this.t);
    if (nb !== this.body) this.switchFrame(nb);
    if (this.body === 'ember' && Math.hypot(this.px, this.py) < BODIES.ember.R) this.crash('Too hot! You fell into the star Ember.');
  }

  contact(foot) {
    const b = this.B, R = b.R;
    const phi = Math.atan2(this.py, this.px), ux = Math.cos(phi), uy = Math.sin(phi);
    const vr = this.vx * ux + this.vy * uy, vDown = Math.max(0, -vr);
    const vSide = Math.abs(-this.vx * uy + this.vy * ux);
    const tilt = angDiff(this.heading, phi);
    const water = terrainAt(phi, this.body) === 'water';
    if (this.body === 'ember') { this.crash('Too hot! You fell into the star Ember.'); return; }
    const res = landingResult({ vDown, vSide, tilt, water, legs: this.legsDown && this.legs > 0 && this.legAnim > 0.95 });
    const sp = Math.hypot(this.vx, this.vy);
    if (!res.safe) {
      const legTxt = this.legsDown && this.legs ? ` Legs need ≤ 12 m/s down, ≤ 5 m/s sideways and ≤ 15° tilt (you had ${vDown.toFixed(0)} down, ${vSide.toFixed(0)} sideways, ${Math.round(Math.abs(tilt) * 180 / Math.PI)}°).` : this.legs ? ' Tip: put your landing legs down (G).' : '';
      this.crash(`Crunch! Hit ${water ? 'the water' : b.key === 'numeria' ? 'the ground' : b.name} at ${sp.toFixed(0)} m/s. Safe is under ${res.limit} m/s.${legTxt}`);
      return;
    }
    this.px = ux * (R + foot); this.py = uy * (R + foot); this.vx = 0; this.vy = 0;
    this.heading = phi; this.omega = 0; this.onGround = true;
    if (this.leftGround) this.touchdown(water, sp, res.why === 'legs');
  }

  touchdown(water, sp, legs) {
    const how = legs ? ' The landing legs soaked it up!' : '';
    if (this.body !== 'numeria') {
      // landing on the moon is a stop on the way: you can take off again
      this.throttle = 0; this.thrustNow = 0;
      if (this.hasCapsule) {
        if (!this.stats.landedLumo) this.emit(`Touchdown on ${this.B.name} at ${sp.toFixed(1)} m/s!${how} You can take off again.`, 'good');
        if (this.released && this.legs) this.stats.dropLanded = true;
        this.stats.landedLumo = true; this.stats.lumoSpeed = this.stats.lumoSpeed ? Math.min(this.stats.lumoSpeed, sp) : sp;
      }
      return;
    }
    this.state = 'landed'; this.throttle = 0; this.thrustNow = 0;
    this.stats.landedSafe = this.hasCapsule; this.stats.splash = water;
    this.stats.landedLumoBeforeHome = this.stats.landedLumo && this.hasCapsule;
    this.endReason = `${water ? 'Splashdown' : 'Touchdown'} at ${sp.toFixed(1)} m/s: soft and safe!${how}`;
    this.emit(this.endReason, 'good');
  }
  crash(msg) {
    this.state = 'crashed'; this.endReason = msg; this.thrustNow = 0;
    this.emit(msg, 'bad');
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, sp = 5 + Math.random() * 25;
      this.particles.push({ x: this.px, y: this.py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.5 + Math.random() * 2, r: 1.5 + Math.random() * 2, c: 200 + Math.floor(Math.random() * 50) });
    }
    this.debris.push({ parts: this.allParts, body: this.body, px: this.px, py: this.py, vx: 0, vy: 0, heading: this.heading + 0.6, omega: 0, mass: 1, t: 0, broken: true });
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      if (d.broken) continue;
      const b = BODIES[d.body], R = b.R, mu = b.mu;
      const n = Math.max(1, Math.min(200, Math.ceil(dt / 0.05))); const h = dt / n;
      for (let i = 0; i < n; i++) {
        const r = Math.hypot(d.px, d.py), alt = r - R, g = mu / (r * r);
        let ax = (-g * d.px) / r, ay = (-g * d.py) / r;
        const v = Math.hypot(d.vx, d.vy), rho = density(alt, b);
        if (rho > 0 && v > 0.1) { const a = (0.5 * rho * v * v * (d.cd || 1.6)) / (1000 * d.mass); ax -= (d.vx / v) * a; ay -= (d.vy / v) * a; }
        d.vx += ax * h; d.vy += ay * h; d.px += d.vx * h; d.py += d.vy * h; d.heading += d.omega * h;
        if (alt <= 0 || r > b.soi) { d.dead = true; break; }
      }
      d.t += dt;
      if (d.t > 120) d.dead = true;
    }
    this.debris = this.debris.filter((d) => !d.dead);
  }
  updateParticles(dt) {
    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; const k = Math.exp(-dt * 1.5); p.vx *= k; p.vy *= k; }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  // ---- save / load (world persistence)
  toSave() {
    const o = { sections: this.sections };
    for (const k of SAVE_KEYS) o[k] = this[k];
    return JSON.parse(JSON.stringify(o));
  }
  static fromSave(o) {
    const f = new Flight(null, { sections: o.sections, t: o.t });
    for (const k of SAVE_KEYS) if (o[k] !== undefined) f[k] = o[k];
    f.stats = Object.assign(f.stats, o.stats || {});
    f.recalc(); f.legAnim = f.legsDown ? 1 : 0; f.chute = f.chuteArmed ? f.chute : 0;
    if (f.state === 'flying' && !f.onGround) f.leftGround = true;
    f.orbit = orbitOf(f.px, f.py, f.vx, f.vy, f.B);
    return f;
  }
  // Debug / test hook: put the rocket somewhere. opts: { body, alt, circular, angle, vx, vy, legs }
  debugPlace(o = {}) {
    if (o.body && o.body !== this.body) this.body = o.body;
    const b = this.B, ang = o.angle != null ? o.angle : Math.PI / 2, r = b.R + (o.alt || 0);
    this.px = Math.cos(ang) * r; this.py = Math.sin(ang) * r;
    if (o.circular) { const v = Math.sqrt(b.mu / r) * (o.speedFactor || 1); this.vx = -Math.sin(ang) * v; this.vy = Math.cos(ang) * v; }
    else { this.vx = o.vx || 0; this.vy = o.vy || 0; }
    this.heading = o.heading != null ? o.heading : ang; this.omega = 0;
    this.onGround = false; this.leftGround = true; this.state = 'flying';
    this.stats.soi[this.body] = true; this.stats.maxAlt = Math.max(this.stats.maxAlt, 31000);
    if (o.legs != null) { this.legsDown = !!o.legs && this.legs > 0; this.legAnim = this.legsDown ? 1 : 0; }
    this.particles = []; this.pred = null;
    this.orbit = orbitOf(this.px, this.py, this.vx, this.vy, b);
  }

  // --- numbers for the HUD
  hud() {
    const b = this.B;
    const r = Math.hypot(this.px, this.py), ux = this.px / r, uy = this.py / r;
    const o = this.orbit;
    const vVert = this.vx * ux + this.vy * uy;
    const vSide = Math.abs(o.h) / r;
    const cs = circleSpeed(r, b);
    const m = this.mass;
    const info = this.activeInfo, rho = density(r - b.R, b);
    const isp = info.thrust ? info.ispVac + (info.ispAtm - info.ispVac) * Math.min(1, rho / PLANET.rho0) : 0;
    const prNow = Math.min(1, rho / PLANET.rho0);
    const plan = planDv(this.sections, this.boosters, prNow), planV = planDv(this.sections, this.boosters, 0);
    const stageDv = plan.length ? plan[0].dv : 0;
    const total = planV.reduce((a, s) => a + s.dv, 0);
    // thrust available right now (liquid at full throttle + every SRB that still has fuel)
    let avail = 0;
    if (this.bottom.fuel > 0) avail += info.liqThrust;
    for (const p of this.bottom.parts) if (srbFuel(p) > 0) avail += PARTS[p.type].thrust;
    for (const bb of this.boosters) { if (bb.side.fuel > 0) avail += 2 * bb.info.liqThrust; if (PARTS[bb.side.body].srb && bb.side.sf > 0) avail += 2 * PARTS[bb.side.body].thrust; }
    // SRB status for the HUD
    let srbTxt = '–', srbLeft = 0, srbReady = false;
    const srbList = [...this.bottom.parts.filter((p) => PARTS[p.type].srb).map((p) => [PARTS[p.type], p.sf]), ...this.boosters.filter((bb) => PARTS[bb.side.body].srb).map((bb) => [PARTS[bb.side.body], bb.side.sf])];
    for (const [P, f] of srbList) { if (f > 0) { srbReady = true; srbLeft = Math.max(srbLeft, f / (P.thrust / (P.ispVac + (P.ispAtm - P.ispVac) * prNow) / G0)); } }
    if (srbList.length) srbTxt = this.srbBurning ? `🔥 ${Math.ceil(srbLeft)} s left` : srbReady ? 'ready' : 'burned out';
    const fuelMax = this.bottom.fuelMax + this.bottom.sfMax, fuelNow = this.bottom.fuel + this.bottom.parts.reduce((a, p) => a + (p.sf || 0), 0);
    const gLocal = b.mu / (r * r);
    const leaves = o.ra > b.soi || !o.bound;
    return {
      body: b.name, bodyKey: b.key, soi: b.soi, leaves,
      alt: r - b.R - (this.onGround ? this.footOff : 0), speed: this.speed, vVert, vSide, cs, ap: o.ap, pe: o.pe, e: o.e, stageDv, totalDv: total,
      twr: avail / (m * gLocal), g: this.gNow, fuelFrac: fuelMax ? fuelNow / fuelMax : 0, srb: srbTxt, boosters: this.boosters.length * 2, fairing: this.hasFairing,
      sections: this.sections.length, t: this.t - this.t0, warp: WARPS[this.warpIdx], mass: m,
    };
  }

  // --- trajectory prediction (numeric, current body's gravity only; looks for Lumo encounters)
  predict() {
    const b = this.B;
    const o = orbitOf(this.px, this.py, this.vx, this.vy, b);
    const res = { pts: [], enc: null, frame: this.body };
    if (this.onGround) return res;
    let x = this.px, y = this.py, vx = this.vx, vy = this.vy, t = this.t;
    const horizon = o.bound ? Math.min(TAU * Math.sqrt(Math.pow((o.rp + o.ra) / 2, 3) / b.mu), 4 * 86400) : 4 * 86400;
    const tEnd = t + horizon;
    for (let i = 0; i < 2500 && t < tEnd; i++) {
      const r = Math.hypot(x, y);
      if (r < b.R) break;
      if (r > b.soi) { res.exit = { x, y, t }; break; }
      const h = clamp(0.004 * T_LOCAL(r, b), 0.5, 2000);
      // leapfrog (kick-drift-kick)
      let g = -b.mu / (r * r * r); vx += g * x * h / 2; vy += g * y * h / 2;
      x += vx * h; y += vy * h; t += h;
      const r2 = Math.hypot(x, y); g = -b.mu / (r2 * r2 * r2); vx += g * x * h / 2; vy += g * y * h / 2;
      if (i % 2 === 0) res.pts.push([x, y]);
      for (const c of b.children) {
        const s = localState(c, t);
        if (Math.hypot(x - s.x, y - s.y) < BODIES[c].soi) {
          const rel = { px: x - s.x, py: y - s.y, vx: vx - s.vx, vy: vy - s.vy };
          res.enc = { body: c, x, y, t, cx: s.x, cy: s.y, rel, orbit: orbitOf(rel.px, rel.py, rel.vx, rel.vy, BODIES[c]) };
          break;
        }
      }
      if (res.enc) break;
    }
    res.pts.push([x, y]);
    return res;
  }

  // --- rendering
  render(ctx, w, h, view) {
    if (view.map) { this.renderMap(ctx, w, h, view); return; }
    const b = this.B, R = b.R;
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    const cx = this.px + hx * this.height * 0.5, cy = this.py + hy * this.height * 0.5;
    const phi = Math.atan2(cy, cx), a = Math.PI / 2 - phi;
    const alt = Math.hypot(cx, cy) - R;
    const s = ((h * 0.3) / Math.max(this.height, 5)) * view.zoom / (1 + clamp(alt, 0, 3000) / 1000);
    this.camA = a;
    const t = b.atm ? Math.pow(clamp(alt / b.atm, 0, 1), 0.6) : 1;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, rgb(mix([84, 170, 236], [3, 5, 22], t))); grd.addColorStop(1, rgb(mix([196, 233, 255], [10, 16, 50], t)));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    const sa = b.atm ? clamp((alt - 6000) / 14000, 0, 1) : 1;
    if (sa > 0) drawStars(ctx, w, h, a, sa);
    this.drawSkyBodies(ctx, w, h, a, cx, cy, sa);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(s, -s); ctx.rotate(a);
    const viewR = Math.hypot(w, h) / 2 / s;
    this.drawGround(ctx, cx, cy, viewR, s, phi);
    if (this.body === 'numeria') this.drawClouds(ctx, cx, cy, viewR);
    // particles
    for (const p of this.particles) {
      const f = p.life / p.max;
      ctx.fillStyle = `rgba(${p.c},${p.c},${p.c + 10},${0.55 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x - cx, p.y - cy, p.r * (1 + f * 3), 0, TAU); ctx.fill();
    }
    for (const d of this.debris) {
      if (d.body !== this.body) continue;
      const dx = d.px - cx, dy = d.py - cy;
      if (Math.hypot(dx, dy) > viewR + 40) continue;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(d.heading - Math.PI / 2); ctx.scale(1, -1);
      if (d.broken) ctx.globalAlpha = 0.5;
      if (d.fairing) drawFairingShell(ctx, d.fairing.shape, d.fairing.cover, d.fairing.len, 1.3 / s, d.fairing.half);
      else drawStack(ctx, d.parts, { lw: 1.3 / s, legs: d.broken ? 1 : 0, flame: d.burn && d.t < 1.5 ? 1 - d.t / 1.5 : 0, t: this.t });
      ctx.restore();
    }
    const labels = [];
    if (this.world) for (const v of this.world.vessels) {
      if (v === this || v.body !== this.body || v.state === 'crashed') continue;
      const dx = v.px - cx, dy = v.py - cy;
      if (Math.hypot(dx, dy) > viewR + 60) continue; // far away: skip drawing
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(v.heading - Math.PI / 2); ctx.scale(1, -1);
      drawStack(ctx, v.allParts, { lw: 1.3 / s, legs: v.legAnim, chute: v.chute, t: this.t });
      ctx.restore();
      if (v.vtype !== 'Debris') labels.push([dx + Math.cos(v.heading) * (v.height + 2), dy + Math.sin(v.heading) * (v.height + 2), v.name]);
    }
    if (this.state !== 'crashed') {
      let bend = 0;
      if (this.wobbly && this.gNow > 1.5) bend = 0.03 * Math.min(1, (this.gNow - 1.5) / 3) * Math.sin(this.t * 9);
      ctx.save(); ctx.translate(this.px - cx, this.py - cy); ctx.rotate(this.heading - Math.PI / 2); ctx.scale(1, -1);
      drawStack(ctx, this.allParts, { lw: 1.4 / s, bend, chute: this.chute, legs: this.legAnim, flame: this.coreFlame, sideFlame: this.sideFlame, vac: density(alt, b) < 0.05, t: this.t });
      ctx.restore();
    }
    ctx.restore();
    const ca = Math.cos(a), sn = Math.sin(a);
    ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const [lx, ly, name] of labels) {
      const X = w / 2 + (lx * ca - ly * sn) * s, Y = h / 2 - (lx * sn + ly * ca) * s;
      ctx.fillStyle = '#000a'; ctx.fillText(name, X + 1, Y - 5); ctx.fillStyle = '#c9f7ff'; ctx.fillText(name, X, Y - 6);
    }
    if (this.height * s < 14 && this.state !== 'crashed') {
      const sa2 = this.heading + a;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-sa2);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath();
      ctx.fillStyle = COL.orange; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
  }

  // Ember / Numeria / Lumo as small discs in the sky (direction is real, size is exaggerated a bit).
  drawSkyBodies(ctx, w, h, a, cx, cy, alpha) {
    const ca = Math.cos(a), sn = Math.sin(a), rC = Math.hypot(cx, cy), R0 = this.B.R;
    const hide = Math.asin(Math.min(1, R0 / rC)); // the body below us blocks this cone
    const downAng = Math.atan2(-cy, -cx);
    for (const key of Object.keys(BODIES)) {
      if (key === this.body) continue;
      const st = relState(key, this.body, this.t), B = BODIES[key];
      const dx = st.x - cx, dy = st.y - cy, d = Math.hypot(dx, dy);
      if (Math.abs(angDiff(Math.atan2(dy, dx), downAng)) < hide) continue;
      const sx = dx * ca - dy * sn, sy = -(dx * sn + dy * ca);
      const k = Math.min(w, h) * 0.36 / Math.hypot(sx, sy);
      const X = w / 2 + sx * k, Y = h / 2 + sy * k;
      const rad = clamp((B.R / d) * 900, key === 'ember' ? 14 : 4, key === 'ember' ? 34 : 40);
      ctx.save(); ctx.globalAlpha = key === 'ember' ? Math.max(0.55, alpha) : alpha;
      if (alpha > 0.01 || key === 'ember') drawBodyIcon(ctx, key, X, Y, rad, this.t, this.body);
      ctx.restore();
    }
  }

  drawGround(ctx, cx, cy, viewR, s, phi) {
    const b = this.B, R = b.R;
    if (this.body === 'ember') return;
    if (Math.hypot(cx, cy) - R > viewR * 1.05) return;
    const span = Math.min(Math.PI, (viewR * 1.5) / R + 0.0005);
    const depth = Math.min(R, viewR * 2 + 100);
    const N = 120;
    const bandPath = (lo, hi, r0 = R) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const p = lo + ((hi - lo) * i) / N; ctx.lineTo(Math.cos(p) * r0 - cx, Math.sin(p) * r0 - cy); }
      for (let i = N; i >= 0; i--) { const p = lo + ((hi - lo) * i) / N; ctx.lineTo(Math.cos(p) * (R - depth) - cx, Math.sin(p) * (R - depth) - cy); }
      ctx.closePath();
    };
    const band = (lo, hi, color) => { bandPath(lo, hi); ctx.fillStyle = color; ctx.fill(); };
    const lo = phi - span, hi = phi + span;
    if (this.body === 'lumo') {
      band(lo, hi, '#9c9cab');
      ctx.save(); bandPath(lo, hi); ctx.clip();
      for (const c of CRATERS) {
        const dphi = angDiff(c.phi, phi);
        if (Math.abs(dphi) > span + c.r / R) continue;
        const p = phi + dphi, x = Math.cos(p) * R - cx, y = Math.sin(p) * R - cy;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p + Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, 0, c.r, c.r * 0.22, 0, 0, TAU); ctx.fillStyle = '#7d7d8e'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -c.r * 0.05, c.r * 0.82, c.r * 0.14, 0, 0, TAU); ctx.fillStyle = '#6d6d7e'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, c.r, c.r * 0.22, 0, Math.PI, TAU); ctx.strokeStyle = '#b9b9c6'; ctx.lineWidth = Math.max(c.r * 0.03, 1.5 / s); ctx.stroke();
        ctx.restore();
      }
      // pebbles near the surface
      ctx.fillStyle = '#878796';
      for (let i = 0; i < 160; i++) {
        const p = phi + (hash(i + 900) - 0.5) * 2 * Math.min(span, 300 / R), rr = R - 0.4 - hash(i + 950) * 6;
        ctx.beginPath(); ctx.arc(Math.cos(p) * rr - cx, Math.sin(p) * rr - cy, 0.1 + hash(i + 990) * 0.35, 0, TAU); ctx.fill();
      }
      ctx.restore();
      return;
    }
    band(lo, hi, '#4f9d5b');
    const strip = Math.max(3 / s, 1.5);
    // darker soil under the grass
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const p = lo + ((hi - lo) * i) / N; ctx.lineTo(Math.cos(p) * (R - strip * 4) - cx, Math.sin(p) * (R - strip * 4) - cy); }
    ctx.strokeStyle = 'rgba(40,80,45,0.5)'; ctx.lineWidth = strip * 4; ctx.stroke();
    for (const [a0, b0] of WATER) {
      for (const k of [-1, 0, 1]) {
        const a1 = Math.max(lo, a0 + k * TAU), b1 = Math.min(hi, b0 + k * TAU);
        if (b1 > a1) band(a1, b1, '#2f78c4');
      }
    }
    // launch pad + tower (pad sits at the top of the planet)
    const dx = 0 - cx, dy = R - cy;
    if (Math.hypot(dx, dy) < viewR + 60) {
      ctx.save(); ctx.translate(dx, dy);
      ctx.fillStyle = '#6b7088'; ctx.fillRect(-4.5, -1.2, 9, 1.2);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-4.5, -0.15, 9, 0.15);
      ctx.strokeStyle = '#8890a8'; ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, 18); ctx.moveTo(-4.8, 0); ctx.lineTo(-4.8, 18);
      for (let y = 0; y < 18; y += 1.5) { ctx.moveTo(-6, y); ctx.lineTo(-4.8, y + 1.5); ctx.moveTo(-4.8, y); ctx.lineTo(-6, y + 1.5); }
      ctx.moveTo(-6, 18); ctx.lineTo(-4.8, 18); ctx.stroke();
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.arc(-5.4, 18.5, 0.35, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawClouds(ctx, cx, cy, viewR) {
    const R = PLANET.R;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    for (const c of CLOUDS) {
      const rr = R + c.alt; const x = Math.cos(c.phi) * rr - cx, y = Math.sin(c.phi) * rr - cy;
      if (Math.abs(x) > viewR + c.w || Math.abs(y) > viewR + c.w) continue;
      const tx = -Math.sin(c.phi), ty = Math.cos(c.phi);
      ctx.beginPath();
      for (let i = 0; i < c.n; i++) {
        const off = (i - (c.n - 1) / 2) * c.w * 0.32, rad = c.w * (i % 2 ? 0.26 : 0.2);
        ctx.moveTo(x + tx * off + rad, y + ty * off);
        ctx.arc(x + tx * off, y + ty * off, rad, 0, TAU);
      }
      ctx.fill();
    }
  }

  renderMap(ctx, w, h, view) {
    const b = this.B, R = b.R;
    ctx.fillStyle = '#050818'; ctx.fillRect(0, 0, w, h);
    drawStars(ctx, w, h, 0, 0.8);
    const o = this.orbit;
    let ext = R + (b.atm || R * 0.1);
    const cap = isFinite(b.soi) ? b.soi : R * 40;
    if (o.bound) ext = Math.max(ext, Math.min(o.ra, cap));
    ext = Math.max(ext, Math.min(Math.hypot(this.px, this.py) * 1.2, cap));
    const s = ((Math.min(w, h) * 0.42) / ext) * view.mapZoom;
    this.mapScale = s;
    const X = (x) => w / 2 + x * s, Y = (y) => h / 2 - y * s;
    const t = this.t;
    if (!this.pred || this.pred.frame !== this.body || Math.abs(t - this.predT) > Math.max(1, WARPS[this.warpIdx] * 0.3) || performance.now() - (this.predWall || 0) > 400) {
      this.pred = this.predict(); this.predT = t; this.predWall = performance.now();
    }
    const P = this.pred;
    // bodies (positions relative to the current body)
    const bod = Object.keys(BODIES).map((k) => ({ k, B: BODIES[k], st: relState(k, this.body, t) }));
    const onScreen = (x, y, r) => X(x) + r * s > -50 && X(x) - r * s < w + 50 && Y(y) + r * s > -50 && Y(y) - r * s < h + 50;
    // orbit circles of the moon / planet
    for (const { k, B, st } of bod) {
      if (!B.parent) continue;
      const ps = relState(B.parent, this.body, t), rr = B.orbitR * s;
      if (rr < 4 || rr > 2e5) continue;
      ctx.beginPath(); ctx.arc(X(ps.x), Y(ps.y), rr, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // spheres of influence (dashed)
    for (const { k, B, st } of bod) {
      if (!isFinite(B.soi)) continue;
      const rr = B.soi * s; if (rr < 6 || rr > 2e5 || !onScreen(st.x, st.y, B.soi)) continue;
      ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), rr, 0, TAU);
      ctx.strokeStyle = k === 'lumo' ? 'rgba(200,200,255,0.55)' : 'rgba(120,255,200,0.45)'; ctx.setLineDash([6, 7]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,230,255,0.6)';
      ctx.fillText(`${B.name} SOI`, X(st.x), Y(st.y) - rr - 4);
    }
    // atmosphere
    if (b.atm) { ctx.beginPath(); ctx.arc(X(0), Y(0), (R + b.atm) * s, 0, TAU); ctx.fillStyle = 'rgba(120,190,255,0.28)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,210,255,0.6)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
    // predicted path
    if (!this.onGround && P.pts.length > 1) {
      ctx.beginPath(); ctx.moveTo(X(this.px), Y(this.py));
      for (const [x, y] of P.pts) ctx.lineTo(X(x), Y(y));
      ctx.strokeStyle = this.body === 'numeria' && this.stats.orbit && o.pe > PLANET.atm && !P.enc ? '#5dffb0' : '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
    }
    // bodies
    const labels = [];
    for (const { k, B, st } of bod) {
      const rpx = Math.max(B.R * s, k === 'ember' ? 9 : k === 'numeria' ? 6 : 4);
      if (!onScreen(st.x, st.y, rpx / s)) continue;
      drawBodyIcon(ctx, k, X(st.x), Y(st.y), rpx, t, this.body, true);
      if (labels.some(([a, c]) => Math.hypot(a - X(st.x), c - Y(st.y)) < 30)) continue;
      labels.push([X(st.x), Y(st.y)]);
      ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(B.name, X(st.x), rpx > 40 ? Y(st.y) + 5 : Y(st.y) + rpx + 15);
    }
    if (this.body === 'numeria' && R * s > 3) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(X(0), Y(R), 3, 0, TAU); ctx.fill(); }
    const rx = X(this.px), ry = Y(this.py), placed = [];
    const mark = (x0, y0, label, col) => {
      const x = X(x0), y = Y(y0);
      if (Math.hypot(x - rx, y - ry) < 24 || placed.some(([a, b]) => Math.hypot(a - x, b - y) < 22)) return;
      placed.push([x, y]);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = '#000a'; ctx.fillText(label, x + 9, y + 5); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 8, y + 4);
    };
    // encounter: ghost of the moon where it will be + path inside its SOI
    if (P.enc) {
      const E = P.enc, EB = BODIES[E.body];
      ctx.beginPath(); ctx.arc(X(E.cx), Y(E.cy), Math.max(EB.R * s, 4), 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(X(E.cx), Y(E.cy), EB.soi * s, 0, TAU); ctx.strokeStyle = 'rgba(255,170,255,0.5)'; ctx.setLineDash([6, 7]); ctx.stroke(); ctx.setLineDash([]);
      const eo = E.orbit;
      if (Math.abs(eo.h) > 1) {
        ctx.beginPath();
        const maxNu = eo.e >= 1 ? Math.acos(Math.max(-1, -1 / eo.e)) * 0.98 : Math.PI;
        for (let i = 0; i <= 200; i++) {
          const nu = -maxNu + (2 * maxNu * i) / 200, rr = eo.p / (1 + eo.e * Math.cos(nu));
          if (rr <= 0 || rr > EB.soi) continue;
          const ang = eo.argPe + nu; ctx.lineTo(X(E.cx + Math.cos(ang) * rr), Y(E.cy + Math.sin(ang) * rr));
        }
        ctx.strokeStyle = '#ff9df5'; ctx.lineWidth = 2; ctx.stroke();
      }
      const peTxt = eo.pe < 0 ? 'impact!' : fmtKm(eo.pe);
      mark(E.x, E.y, `Encounter: ${EB.name} · Pe ${peTxt}`, '#ff9df5');
      this.encounter = E;
    } else this.encounter = null;
    // Ap / Pe markers
    if (!this.onGround && Math.abs(o.h) > 1) {
      const rCap = isFinite(b.soi) ? b.soi : Infinity;
      if (o.bound && o.ra < rCap) mark(Math.cos(o.argPe + Math.PI) * o.ra, Math.sin(o.argPe + Math.PI) * o.ra, `Ap ${fmtKm(o.ap)}`, '#4dd0ff');
      if (o.rp > R && o.e > 0.001) mark(Math.cos(o.argPe) * o.rp, Math.sin(o.argPe) * o.rp, `Pe ${fmtKm(o.pe)}`, '#ff8a3d');
      if (P.exit && !P.enc) mark(P.exit.x, P.exit.y, `Leaves ${b.name} SOI`, '#5dffb0');
    }
    for (const d of this.debris) { if (d.body !== this.body) continue; ctx.fillStyle = '#8890a8'; ctx.fillRect(X(d.px) - 2, Y(d.py) - 2, 4, 4); }
    if (this.world) {
      const vl = [];
      for (const v of this.world.vessels) {
        if (v === this || v.state === 'crashed') continue;
        const off = v.body === this.body ? { x: 0, y: 0 } : relState(v.body, this.body, t);
        const x = off.x + v.px, y = off.y + v.py, VB = BODIES[v.body];
        if (v.vtype !== 'Debris' && !v.onGround) {
          const vo = v.orbit || orbitOf(v.px, v.py, v.vx, v.vy, VB);
          drawConic(ctx, vo, VB, (px, py) => [X(off.x + px), Y(off.y + py)], VESSEL_COL[v.vtype] || '#fff');
        }
        if (X(x) < -20 || X(x) > w + 20 || Y(y) < -20 || Y(y) > h + 20) continue;
        vl.push([v, X(x), Y(y)]);
      }
      for (const [v, sx, sy] of vl) {
        drawVesselIcon(ctx, v.vtype, sx, sy, v.vtype === 'Debris' ? 0.6 : 1);
        if (v.vtype === 'Debris') continue;
        ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'left';
        ctx.fillStyle = '#000a'; ctx.fillText(v.name, sx + 10, sy + 5); ctx.fillStyle = VESSEL_COL[v.vtype] || '#fff'; ctx.fillText(v.name, sx + 9, sy + 4);
      }
    }
    // rocket marker
    ctx.save(); ctx.translate(X(this.px), Y(this.py)); ctx.rotate(-this.heading);
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fillStyle = COL.orange; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    if (this.name) { ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#000a'; ctx.fillText(this.name + ' (you)', X(this.px) + 13, Y(this.py) - 7); ctx.fillStyle = COL.orange; ctx.fillText(this.name + ' (you)', X(this.px) + 12, Y(this.py) - 8); }
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(220,230,255,0.75)';
    ctx.fillText(`Map: centered on ${b.name}. Scroll or −/+ to zoom out to see Lumo and Ember.`, 12, h - 86);
    this.camA = 0;
  }
}

// Draw a body as a disc with simple lighting from Ember. `big` = map view (more detail).
export function drawBodyIcon(ctx, key, x, y, r, t, frame, big) {
  const B = BODIES[key];
  ctx.save();
  if (key === 'ember') {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.6);
    g.addColorStop(0, 'rgba(255,230,140,0.9)'); g.addColorStop(0.4, 'rgba(255,160,60,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#ffd36b'; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = '#ff9a3d'; ctx.stroke();
    ctx.restore(); return;
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = B.color; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  if (key === 'numeria' && r > 5) {
    ctx.fillStyle = '#4f9d5b';
    let prev = WATER[WATER.length - 1][1] - TAU;
    for (const [w0, w1] of WATER) {
      const a1 = prev; prev = w1;
      const n = Math.max(2, Math.round((w0 - a1) * 4));
      for (let i = 0; i <= n; i++) {
        const ang = a1 + ((w0 - a1) * i) / n, rr = r * (0.88 - 0.12 * Math.sin(i * 2.3 + w0));
        ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * rr, y - Math.sin(ang) * rr, r * 0.24, r * 0.15, -ang, 0, TAU); ctx.fill();
      }
    }
  }
  if (key === 'lumo' && r > 3) {
    for (let i = 0; i < 18; i++) {
      const a = hash(i + 41) * TAU, d = Math.sqrt(hash(i + 77)) * r * 0.85, cr = r * (0.05 + hash(i + 99) * 0.16);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, TAU); ctx.fillStyle = '#87879a'; ctx.fill();
      ctx.lineWidth = Math.max(0.5, cr * 0.18); ctx.strokeStyle = '#c4c4d0'; ctx.stroke();
    }
  }
  ctx.restore();
  // night side: shade away from Ember
  const sun = relState('ember', key, t), la = Math.atan2(-sun.y, sun.x); // screen angle (y flipped)
  const lx = Math.cos(la), ly = Math.sin(la);
  const sh = ctx.createLinearGradient(x + lx * r, y + ly * r, x - lx * r, y - ly * r);
  sh.addColorStop(0, 'rgba(255,255,230,0.12)'); sh.addColorStop(0.5, 'rgba(0,0,30,0.05)'); sh.addColorStop(1, 'rgba(0,0,30,0.55)');
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = sh; ctx.fill();
  ctx.restore();
}

export function fmtKm(m) {
  if (!isFinite(m)) return 'escape!';
  if (m < 0) return 'below ground';
  if (m >= 1e7) return `${Math.round(m / 1000).toLocaleString()} km`;
  return m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m).toLocaleString()} m`;
}

export function drawStars(ctx, w, h, a, alpha) {
  const d = Math.hypot(w, h);
  const ca = Math.cos(a), sa = Math.sin(a);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const st of STARS) {
    const x = (st.x - 0.5) * d, y = (st.y - 0.5) * d;
    const sx = w / 2 + x * ca - y * sa, sy = h / 2 + x * sa + y * ca;
    if (sx < 0 || sy < 0 || sx > w || sy > h) continue;
    ctx.fillRect(sx, sy, st.s, st.s);
  }
}

// ---- other vessels on the map
export const VESSEL_COL = { Rocket: '#ffb27f', Satellite: '#7fe3ff', Lander: '#ffe07f', Probe: '#c9b6ff', Station: '#9dffb9', Capsule: '#ffc9e0', Debris: '#8890a8' };
export const VESSEL_ICON = { Rocket: '🚀', Satellite: '🛰️', Lander: '🛬', Probe: '📡', Station: '🏠', Capsule: '🧑‍🚀', Debris: '🔩' };
// Orbit (conic) drawn faintly; tr maps body-frame coords to screen.
export function drawConic(ctx, o, B, tr, col) {
  if (!o || Math.abs(o.h) < 1) return;
  const maxNu = o.e >= 1 ? Math.acos(Math.max(-1, -1 / o.e)) * 0.97 : Math.PI;
  ctx.beginPath(); let pen = false;
  for (let i = 0; i <= 120; i++) {
    const nu = -maxNu + (2 * maxNu * i) / 120, rr = o.p / (1 + o.e * Math.cos(nu));
    if (rr <= 0 || rr > B.soi || rr < B.R) { pen = false; continue; }
    const [sx, sy] = tr(Math.cos(o.argPe + nu) * rr, Math.sin(o.argPe + nu) * rr);
    if (pen) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); pen = true; }
  }
  ctx.save(); ctx.globalAlpha = 0.4; ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.restore();
}
// Small vector icon per vessel type (canvas shapes, no images).
export function drawVesselIcon(ctx, type, x, y, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  const c = VESSEL_COL[type] || '#fff';
  ctx.fillStyle = c; ctx.strokeStyle = '#0b1236'; ctx.lineWidth = 1.2;
  if (type === 'Debris') { ctx.fillRect(-2, -2, 4, 4); ctx.restore(); return; }
  if (type === 'Satellite' || type === 'Station') {
    ctx.fillRect(-9, -2.5, 6, 5); ctx.fillRect(3, -2.5, 6, 5); ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (type === 'Lander') {
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 2); ctx.lineTo(-5, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(-7, 7); ctx.moveTo(4, 2); ctx.lineTo(7, 7); ctx.stroke();
  } else if (type === 'Rocket') {
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3.5, -2); ctx.lineTo(3.5, 6); ctx.lineTo(-3.5, 6); ctx.lineTo(-3.5, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else { ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
