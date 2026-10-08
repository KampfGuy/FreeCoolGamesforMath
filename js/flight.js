// Flight simulation (2D orbital mechanics around a small planet) + rendering.
import { PARTS, W, TAU, G0, drawStack, COL } from './parts.js';
import { PLANET, density, splitSections, sectionInfo, orbitOf, circleSpeed, stiffLimit } from './physics.js';

export const WARPS = [1, 2, 4, 10, 50, 200];
export const WATER = [[0.45, 1.35], [2.2, 3.0], [3.8, 4.6], [5.3, 5.9]];
export const PAD_PHI = Math.PI / 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const norm = (a) => ((a % TAU) + TAU) % TAU;
export function terrainAt(phi) { phi = norm(phi); for (const [a, b] of WATER) if (phi >= a && phi <= b) return 'water'; return 'land'; }
function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

const CLOUDS = Array.from({ length: 420 }, (_, i) => ({ phi: ((i + hash(i)) / 420) * TAU, alt: 1200 + hash(i + 7) * 3400, w: 160 + hash(i + 13) * 380, n: 3 + Math.floor(hash(i + 19) * 3) }));
export const STARS = Array.from({ length: 240 }, (_, i) => ({ x: hash(i + 101), y: hash(i + 202), s: hash(i + 303) < 0.15 ? 2 : 1 }));

export class Flight {
  constructor(stack) {
    this.sections = splitSections(stack.map((p) => ({ ...p }))).map((parts) => { const i = sectionInfo(parts); return { parts, fuel: i.fuel, fuelMax: i.fuel }; });
    this.px = 0; this.py = PLANET.R; this.vx = 0; this.vy = 0;
    this.heading = Math.PI / 2; this.omega = 0;
    this.throttle = 0; this.ignited = false;
    this.chuteArmed = false; this.chute = 0;
    this.onGround = true; this.leftGround = false;
    this.warpIdx = 0; this.t = 0; this.isp = 0;
    this.state = 'flying'; this.endReason = '';
    this.stats = { maxAlt: 0, maxSpeed: 0, maxG: 0, orbit: false, landedSafe: false, splash: false, dvUsed: 0, space: false };
    this.debris = []; this.particles = []; this.events = [];
    this.hold = 'free'; this.aim = null; this.turn = 0;
    this.thrustNow = 0; this.gNow = 0; this.flags = {};
    this.recalc();
    this.orbit = orbitOf(this.px, this.py, this.vx, this.vy);
  }
  emit(msg, kind = 'info') { this.events.push({ msg, kind }); }
  once(key, msg, kind) { if (!this.flags[key]) { this.flags[key] = true; this.emit(msg, kind); } }
  recalc() {
    let dry = 0, fins = 0, struts = 0, n = 0, height = 0, capsule = false, chute = false, te = 0;
    for (const s of this.sections) {
      const i = sectionInfo(s.parts);
      dry += i.dry; fins += i.fins; struts += i.struts; n += s.parts.length; height += i.height;
      capsule = capsule || i.capsule; chute = chute || i.chute; te += i.tanks + i.engines;
    }
    Object.assign(this, { dry, fins, struts, partCount: n, height, hasCapsule: capsule, hasChute: chute });
    this.capsuleOnly = te === 0;
    this.wobbly = n > stiffLimit(struts);
    this.activeInfo = sectionInfo(this.bottom.parts);
    this.allParts = this.sections.flatMap((s) => s.parts);
  }
  get bottom() { return this.sections[this.sections.length - 1]; }
  get fuelTotal() { return this.sections.reduce((a, s) => a + s.fuel, 0); }
  get mass() { return this.dry + this.fuelTotal; }
  get alt() { return Math.hypot(this.px, this.py) - PLANET.R; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get turnRate() { return clamp(1.3 / Math.sqrt(this.mass), 0.3, 0.9); }

  stage() {
    if (this.state !== 'flying') return;
    if (!this.ignited && this.activeInfo.engines > 0) {
      this.ignited = true;
      if (this.throttle < 0.05) this.throttle = 1;
      this.emit(this.onGround ? 'Liftoff! Engines on.' : 'Engines on!');
      return;
    }
    if (this.sections.length > 1) {
      const dropped = this.sections.pop();
      const di = sectionInfo(dropped.parts);
      const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      this.debris.push({ parts: dropped.parts, px: this.px, py: this.py, vx: this.vx - hx * 3, vy: this.vy - hy * 3, heading: this.heading, omega: (Math.random() - 0.5) * 0.5, mass: di.dry + dropped.fuel, t: 0 });
      this.px += hx * di.height; this.py += hy * di.height;
      this.vx += hx * 1; this.vy += hy * 1;
      this.recalc();
      this.ignited = this.activeInfo.engines > 0;
      this.flags.empty = false;
      const left = this.sections.length;
      this.emit(`Stage dropped! ${this.ignited ? 'Next engines on.' : 'Coasting.'} (${left} section${left > 1 ? 's' : ''} left)`);
      return;
    }
    if (this.hasChute && !this.chuteArmed) { this.armChute(); return; }
    this.emit('Nothing left to stage.');
  }
  armChute() {
    if (!this.hasChute) { this.emit('No parachute on this rocket.', 'warn'); return; }
    if (this.chuteArmed) return;
    this.chuteArmed = true;
    this.emit('Parachute armed: it opens in the air below 300 m/s.');
  }

  update(dt) {
    if (this.state === 'flying') {
      let warp = WARPS[this.warpIdx];
      const burning = this.ignited && this.throttle > 0 && this.bottom.fuel > 0;
      const maxIdx = burning || this.onGround ? 2 : this.alt < PLANET.atm ? 3 : WARPS.length - 1;
      if (this.warpIdx > maxIdx) {
        this.warpIdx = maxIdx; warp = WARPS[this.warpIdx];
        this.emit(maxIdx === 2 ? 'Warp is ×4 max while engines burn.' : 'Warp is ×10 max in the air.');
      }
      const simT = dt * warp;
      const hstep = warp <= 4 ? 1 / 120 : warp <= 10 ? 1 / 30 : warp <= 50 ? 0.05 : 0.2;
      const steps = Math.min(400, Math.ceil(simT / hstep));
      for (let i = 0; i < steps && this.state === 'flying'; i++) this.step(simT / steps);
      this.updateDebris(simT);
      if (this.state === 'flying') this.frameChecks(dt);
    } else this.updateDebris(dt);
    this.updateParticles(dt);
  }

  frameChecks(dt) {
    const alt = this.alt, s = this.stats;
    s.maxAlt = Math.max(s.maxAlt, alt);
    if (s.maxAlt > 30) this.leftGround = true;
    s.maxSpeed = Math.max(s.maxSpeed, this.speed);
    if (!this.onGround) s.maxG = Math.max(s.maxG, this.gNow);
    this.orbit = orbitOf(this.px, this.py, this.vx, this.vy);
    if (alt > PLANET.atm) { if (!s.space) { s.space = true; this.emit('You reached space! (above 30 km)', 'good'); } }
    if (alt > PLANET.atm && this.orbit.bound && this.orbit.pe > PLANET.atm && !s.orbit) { s.orbit = true; this.emit('ORBIT! Your low point is above the air. You are falling around the planet.', 'good'); }
    if (this.ignited && this.bottom.fuel <= 1e-6 && this.activeInfo.engines > 0) this.once('empty', this.sections.length > 1 ? 'Stage out of fuel: press STAGE (Space) to drop it.' : 'Out of fuel!', 'warn');
    if (this.wobbly && this.gNow > 3) this.once('wob', 'Wobbly! Too many parts for your struts.', 'warn');
    // exhaust puffs in the air
    const rho = density(alt);
    if (this.thrustNow > 0 && rho > 0.03 && WARPS[this.warpIdx] === 1 && this.particles.length < 140) {
      const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      for (let k = 0; k < 2; k++) this.particles.push({ x: this.px - hx * 1.5 + (Math.random() - 0.5), y: this.py - hy * 1.5 + (Math.random() - 0.5), vx: this.vx * 0.4 - hx * 25 + (Math.random() - 0.5) * 8, vy: this.vy * 0.4 - hy * 25 + (Math.random() - 0.5) * 8, life: 0, max: 2 + Math.random() * 1.5, r: 1 + Math.random(), c: 235 });
    }
  }

  step(dt) {
    const R = PLANET.R, mu = PLANET.mu;
    let r = Math.hypot(this.px, this.py);
    const alt = r - R, ux = this.px / r, uy = this.py / r;
    const rho = density(alt), m = this.mass, v = Math.hypot(this.vx, this.vy);
    // --- rotation
    const rate = this.turnRate;
    let target = 0;
    const toward = (ang) => clamp(angDiff(ang, this.heading) * 3, -rate, rate);
    if (this.turn) target = this.turn * rate;
    else if (this.aim != null) target = toward(this.aim);
    else if (this.hold === 'pro' && v > 3) target = toward(Math.atan2(this.vy, this.vx));
    else if (this.hold === 'retro' && v > 3) target = toward(Math.atan2(-this.vy, -this.vx));
    else if (this.hold !== 'free') target = toward(Math.atan2(uy, ux));
    let alpha = (target - this.omega) * 5;
    if (!this.onGround && rho > 0 && v > 15) {
      const k = (0.5 * rho * v * v) / 40000, vdir = Math.atan2(this.vy, this.vx);
      if (this.capsuleOnly) alpha += k * 3 * Math.sin(angDiff(vdir + Math.PI, this.heading));
      else if (this.fins > 0) alpha += k * 1.6 * Math.min(2, this.fins) * Math.sin(angDiff(vdir, this.heading));
      else alpha -= k * 2.0 * Math.sin(angDiff(vdir, this.heading));
    }
    if (this.onGround) this.omega = 0;
    else { this.omega += alpha * dt; this.heading += this.omega * dt; }
    // --- thrust
    let thrust = 0; const act = this.bottom, info = this.activeInfo;
    if (this.ignited && act.fuel > 0 && info.thrust > 0 && this.throttle > 0) {
      const pr = Math.min(1, rho / PLANET.rho0);
      const isp = info.ispVac + (info.ispAtm - info.ispVac) * pr;
      thrust = info.thrust * this.throttle;
      let used = (thrust / (isp * G0)) * dt;
      if (used > act.fuel) { thrust *= act.fuel / used; used = act.fuel; }
      act.fuel -= used; this.stats.dvUsed += (thrust / m) * dt; this.isp = isp;
    }
    this.thrustNow = thrust;
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    const g = mu / (r * r);
    let ax = -g * ux + (hx * thrust) / m, ay = -g * uy + (hy * thrust) / m;
    let dragA = 0;
    if (rho > 0 && v > 0.01) {
      const q = 0.5 * rho * v * v;
      dragA = (q * (1.6 + 0.12 * this.fins)) / (1000 * m);
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
    const altB = r - R;
    const altT = Math.hypot(this.px + hx * this.height, this.py + hy * this.height) - R;
    if (Math.min(altB, altT) <= 0) {
      const sp = Math.hypot(this.vx, this.vy);
      const phi = Math.atan2(this.py, this.px);
      const water = terrainAt(phi) === 'water';
      const limit = water ? 12 : 10;
      if (sp > limit) { this.crash(`Crunch! Hit the ${water ? 'water' : 'ground'} at ${sp.toFixed(0)} m/s. Safe is under ${limit} m/s.`); return; }
      this.px = Math.cos(phi) * R; this.py = Math.sin(phi) * R; this.vx = 0; this.vy = 0;
      this.heading = phi; this.omega = 0; this.onGround = true;
      if (this.leftGround) this.touchdown(water, sp);
    }
  }

  touchdown(water, sp) {
    this.state = 'landed'; this.throttle = 0; this.thrustNow = 0;
    this.stats.landedSafe = this.hasCapsule; this.stats.splash = water;
    this.endReason = `${water ? 'Splashdown' : 'Touchdown'} at ${sp.toFixed(1)} m/s: soft and safe!`;
    this.emit(this.endReason, 'good');
  }
  crash(msg) {
    this.state = 'crashed'; this.endReason = msg; this.thrustNow = 0;
    this.emit(msg, 'bad');
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, sp = 5 + Math.random() * 25;
      this.particles.push({ x: this.px, y: this.py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.5 + Math.random() * 2, r: 1.5 + Math.random() * 2, c: 200 + Math.floor(Math.random() * 50) });
    }
    this.debris.push({ parts: this.allParts, px: this.px, py: this.py, vx: 0, vy: 0, heading: this.heading + 0.6, omega: 0, mass: 1, t: 0, broken: true });
  }

  updateDebris(dt) {
    const R = PLANET.R, mu = PLANET.mu;
    for (const d of this.debris) {
      if (d.broken) continue;
      const n = Math.max(1, Math.ceil(dt / 0.05)); const h = dt / n;
      for (let i = 0; i < n; i++) {
        const r = Math.hypot(d.px, d.py), alt = r - R, g = mu / (r * r);
        let ax = (-g * d.px) / r, ay = (-g * d.py) / r;
        const v = Math.hypot(d.vx, d.vy), rho = density(alt);
        if (rho > 0 && v > 0.1) { const a = (0.5 * rho * v * v * 1.6) / (1000 * d.mass); ax -= (d.vx / v) * a; ay -= (d.vy / v) * a; }
        d.vx += ax * h; d.vy += ay * h; d.px += d.vx * h; d.py += d.vy * h; d.heading += d.omega * h;
        if (alt <= 0) { d.dead = true; break; }
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

  // --- numbers for the HUD
  hud() {
    const r = Math.hypot(this.px, this.py), ux = this.px / r, uy = this.py / r;
    const o = this.orbit;
    const vVert = this.vx * ux + this.vy * uy;
    const vSide = Math.abs(o.h) / r;
    const cs = circleSpeed(r);
    const m = this.mass;
    const info = this.activeInfo, rho = density(r - PLANET.R);
    const isp = info.thrust ? info.ispVac + (info.ispAtm - info.ispVac) * Math.min(1, rho / PLANET.rho0) : 0;
    const stageDv = info.thrust && this.bottom.fuel > 0 ? isp * G0 * Math.log(m / (m - this.bottom.fuel)) : 0;
    // total remaining (vacuum) across sections, bottom first
    let total = 0, massAbove = 0;
    const secMass = this.sections.map((s) => sectionInfo(s.parts).dry + s.fuel);
    for (let k = 0; k < this.sections.length; k++) {
      const s = this.sections[k], i = sectionInfo(s.parts);
      const wet = massAbove + secMass[k];
      if (i.thrust && s.fuel > 0) total += i.ispVac * G0 * Math.log(wet / (wet - s.fuel));
      massAbove = wet;
    }
    const gLocal = PLANET.mu / (r * r);
    return {
      alt: r - PLANET.R, speed: this.speed, vVert, vSide, cs, ap: o.ap, pe: o.pe, e: o.e, stageDv, totalDv: total,
      twr: this.bottom.fuel > 0 ? info.thrust / (m * gLocal) : 0, g: this.gNow, fuelFrac: this.bottom.fuelMax ? this.bottom.fuel / this.bottom.fuelMax : 0,
      sections: this.sections.length, t: this.t, warp: WARPS[this.warpIdx], mass: m,
    };
  }

  // --- rendering
  render(ctx, w, h, view) {
    if (view.map) { this.renderMap(ctx, w, h, view); return; }
    const R = PLANET.R;
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    const cx = this.px + hx * this.height * 0.5, cy = this.py + hy * this.height * 0.5;
    const phi = Math.atan2(cy, cx), a = Math.PI / 2 - phi;
    const alt = Math.hypot(cx, cy) - R;
    const s = ((h * 0.3) / Math.max(this.height, 5)) * view.zoom / (1 + clamp(alt, 0, 3000) / 1000);
    this.camA = a;
    const t = Math.pow(clamp(alt / PLANET.atm, 0, 1), 0.6);
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, rgb(mix([84, 170, 236], [3, 5, 22], t))); grd.addColorStop(1, rgb(mix([196, 233, 255], [10, 16, 50], t)));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    const sa = clamp((alt - 6000) / 14000, 0, 1);
    if (sa > 0) drawStars(ctx, w, h, a, sa);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(s, -s); ctx.rotate(a);
    const viewR = Math.hypot(w, h) / 2 / s;
    this.drawGround(ctx, cx, cy, viewR, s, phi);
    this.drawClouds(ctx, cx, cy, viewR);
    // particles
    for (const p of this.particles) {
      const f = p.life / p.max;
      ctx.fillStyle = `rgba(${p.c},${p.c},${p.c + 10},${0.55 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x - cx, p.y - cy, p.r * (1 + f * 3), 0, TAU); ctx.fill();
    }
    for (const d of this.debris) {
      const dx = d.px - cx, dy = d.py - cy;
      if (Math.hypot(dx, dy) > viewR + 40) continue;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(d.heading - Math.PI / 2); ctx.scale(1, -1);
      if (d.broken) ctx.globalAlpha = 0.5;
      drawStack(ctx, d.parts, { lw: 1.3 / s });
      ctx.restore();
    }
    if (this.state !== 'crashed') {
      let bend = 0;
      if (this.wobbly && this.gNow > 1.5) bend = 0.03 * Math.min(1, (this.gNow - 1.5) / 3) * Math.sin(this.t * 9);
      ctx.save(); ctx.translate(this.px - cx, this.py - cy); ctx.rotate(this.heading - Math.PI / 2); ctx.scale(1, -1);
      drawStack(ctx, this.allParts, { lw: 1.4 / s, bend, chute: this.chute, flame: this.thrustNow > 0 ? this.throttle : 0, vac: density(alt) < 0.05, t: this.t });
      ctx.restore();
    }
    ctx.restore();
    if (this.height * s < 14 && this.state !== 'crashed') {
      const sa2 = this.heading + a;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-sa2);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath();
      ctx.fillStyle = COL.orange; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
  }

  drawGround(ctx, cx, cy, viewR, s, phi) {
    const R = PLANET.R;
    if (Math.hypot(cx, cy) - R > viewR * 1.05) return;
    const span = Math.min(Math.PI, (viewR * 1.5) / R + 0.0005);
    const depth = Math.min(R, viewR * 2 + 100);
    const N = 120;
    const band = (lo, hi, color) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const p = lo + ((hi - lo) * i) / N; ctx.lineTo(Math.cos(p) * R - cx, Math.sin(p) * R - cy); }
      for (let i = N; i >= 0; i--) { const p = lo + ((hi - lo) * i) / N; ctx.lineTo(Math.cos(p) * (R - depth) - cx, Math.sin(p) * (R - depth) - cy); }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    const lo = phi - span, hi = phi + span;
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
    const R = PLANET.R;
    ctx.fillStyle = '#050818'; ctx.fillRect(0, 0, w, h);
    drawStars(ctx, w, h, 0, 0.8);
    const o = this.orbit;
    let ext = R + PLANET.atm;
    if (o.bound) ext = Math.max(ext, Math.min(o.ra, R * 5));
    ext = Math.max(ext, Math.min(Math.hypot(this.px, this.py) * 1.2, R * 5));
    const s = ((Math.min(w, h) * 0.42) / ext) * view.mapZoom;
    const X = (x) => w / 2 + x * s, Y = (y) => h / 2 - y * s;
    // atmosphere
    ctx.beginPath(); ctx.arc(X(0), Y(0), (R + PLANET.atm) * s, 0, TAU); ctx.fillStyle = 'rgba(120,190,255,0.28)'; ctx.fill();
    ctx.strokeStyle = 'rgba(160,210,255,0.6)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    // orbit path (drawn before planet so the underground part is hidden)
    if (!this.onGround && Math.abs(o.h) > 1) {
      ctx.beginPath();
      let maxNu = Math.PI;
      if (o.e >= 1) maxNu = Math.acos(Math.max(-1, -1 / o.e)) * 0.98;
      const N = 240;
      for (let i = 0; i <= N; i++) {
        const nu = -maxNu + (2 * maxNu * i) / N;
        const rr = o.p / (1 + o.e * Math.cos(nu));
        if (rr <= 0 || rr > R * 8) continue;
        const ang = o.argPe + nu;
        ctx.lineTo(X(Math.cos(ang) * rr), Y(Math.sin(ang) * rr));
      }
      ctx.strokeStyle = this.stats.orbit && o.pe > PLANET.atm ? '#5dffb0' : '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
    }
    // planet
    ctx.beginPath(); ctx.arc(X(0), Y(0), R * s, 0, TAU); ctx.fillStyle = '#2f78c4'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(X(0), Y(0), R * s, 0, TAU); ctx.clip();
    ctx.fillStyle = '#4f9d5b';
    let prev = WATER[WATER.length - 1][1] - TAU;
    for (const [w0, w1] of WATER) {
      const a0 = w0, a1 = prev, b0 = w0; prev = w1; // land runs from the end of the last sea to the start of this one
      const n = Math.max(2, Math.round((b0 - a1) * 4));
      for (let i = 0; i <= n; i++) {
        const ang = a1 + ((b0 - a1) * i) / n, rr = R * (0.88 - 0.12 * Math.sin(i * 2.3 + a0));
        ctx.beginPath(); ctx.ellipse(X(Math.cos(ang) * rr), Y(Math.sin(ang) * rr), R * s * 0.24, R * s * 0.15, -ang, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    const sh = ctx.createRadialGradient(X(0) - R * s * 0.35, Y(0) - R * s * 0.35, R * s * 0.1, X(0), Y(0), R * s);
    sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(1, 'rgba(0,0,30,0.35)');
    ctx.beginPath(); ctx.arc(X(0), Y(0), R * s, 0, TAU); ctx.fillStyle = sh; ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(X(0), Y(R), 3, 0, TAU); ctx.fill();
    ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Numeria', X(0), Y(0) + 5);
    // Ap / Pe markers
    const mark = (ang, rr, label, col) => {
      const x = X(Math.cos(ang) * rr), y = Y(Math.sin(ang) * rr);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = '#000a'; ctx.fillText(label, x + 9, y + 5); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 8, y + 4);
    };
    if (!this.onGround && Math.abs(o.h) > 1) {
      if (o.bound && o.ra < R * 8) mark(o.argPe + Math.PI, o.ra, `Ap ${fmtKm(o.ap)}`, '#4dd0ff');
      if (o.rp > R && o.e > 0.001) mark(o.argPe, o.rp, `Pe ${fmtKm(o.pe)}`, '#ff8a3d');
    }
    for (const d of this.debris) { ctx.fillStyle = '#8890a8'; ctx.fillRect(X(d.px) - 2, Y(d.py) - 2, 4, 4); }
    // rocket marker
    ctx.save(); ctx.translate(X(this.px), Y(this.py)); ctx.rotate(-this.heading);
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fillStyle = COL.orange; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    this.camA = 0;
  }
}

export function fmtKm(m) {
  if (!isFinite(m)) return 'escape!';
  if (m < 0) return 'below ground';
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
