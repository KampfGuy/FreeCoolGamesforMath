// The world: many craft (vessels) sharing one clock. The active vessel is flown with full physics;
// the others move "on rails" (Kepler orbits around the body whose SOI they are in), landed ones stay put.
import { Flight, terrainAt } from './flight.js?v=mp1';
import { BODIES, orbitOf, soiCheck, convertFrame, density, keplerStep, landingResult } from './physics.js?v=mp1';

export const DEBRIS_CAP = 30;
const NAME_PREFIX = { Rocket: 'Rocket', Satellite: 'Sat', Lander: 'Lander', Probe: 'Probe', Station: 'Station', Capsule: 'Capsule', Debris: 'Debris' };
const W_PERIOD = (r, b) => 2 * Math.PI * Math.sqrt((r * r * r) / b.mu);

export class World {
  constructor() { this.t = 0; this.vessels = []; this.active = null; this.nextId = 1; this.counters = {}; this.events = []; }
  emit(msg, kind = 'info') { this.events.push({ msg, kind }); }
  autoName(type) { const n = (this.counters[type] = (this.counters[type] || 0) + 1); return `${NAME_PREFIX[type] || type}-${n}`; }
  // Add a vessel (a Flight object). It joins the world clock.
  add(v, { active = false, name } = {}) {
    v.world = this; v.id = v.id || this.nextId++;
    if (!v.vtype) v.vtype = v.classify();
    if (name) { v.name = name; v.autoName = false; } else if (!v.name) { v.name = this.autoName(v.vtype); v.autoName = true; }
    v.age = 0;
    if (!this.vessels.includes(v)) this.vessels.push(v);
    if (active) this.setActive(v);
    this.capDebris();
    return v;
  }
  launch(stack, opts = {}) { const f = new Flight(stack, { t: this.t }); f.mission = opts.mission || ''; return this.add(f, { active: true }); }
  get controllable() { return this.vessels.filter((v) => v.vtype !== 'Debris' && v.state !== 'crashed'); }
  setActive(v) {
    const old = this.active;
    if (old && old !== v) { old.throttle = 0; old.thrustNow = 0; old.turn = 0; old.aim = null; old.warpIdx = 0; old.particles = []; old.debris = []; if (old.state === 'crashed') this.remove(old); }
    this.propagate(v, this.t);
    this.active = v; v.world = this; v.t = this.t;
    if (v.state === 'landed') { v.state = 'flying'; v.onGround = true; v.leftGround = false; v.endReason = ''; }
    v.warpIdx = 0; v.throttle = 0; v.pred = null; v.events = [];
    return v;
  }
  // Switch control: dir = +1 next, -1 previous (only craft with a probe core or capsule).
  cycle(dir) {
    const list = this.controllable; if (list.length < 2) return null;
    const i = list.indexOf(this.active);
    return this.setActive(list[(i + dir + list.length) % list.length]);
  }
  remove(v) { this.vessels = this.vessels.filter((x) => x !== v); if (this.active === v) this.active = null; }
  rename(v, name) { name = String(name || '').trim().slice(0, 24); if (!name) return false; v.name = name; v.autoName = false; return true; }

  update(dt) {
    const a = this.active;
    if (a) {
      const t0 = a.t;
      a.update(dt);
      this.t = Math.max(this.t, a.t);
      for (const c of a.spawned.splice(0)) this.add(c);
      const nt = a.classify();
      if (nt !== a.vtype) a.vtype = nt;
      dt = a.t - t0;
    } else this.t += dt;
    for (const v of this.vessels) if (v !== a) { v.age += Math.max(0, dt); this.propagate(v, this.t); }
    this.cleanup();
  }
  capDebris() {
    const deb = this.vessels.filter((v) => v.vtype === 'Debris');
    if (deb.length > DEBRIS_CAP) for (const d of deb.slice(0, deb.length - DEBRIS_CAP)) this.remove(d);
  }
  cleanup() {
    const a = this.active;
    for (const v of [...this.vessels]) {
      if (v === a) continue;
      if (v.state === 'crashed') { this.remove(v); if (v.vtype !== 'Debris') this.emit(`${v.name} crashed${v.endReason ? ': ' + v.endReason : '.'}`, 'bad'); continue; }
      if (v.vtype !== 'Debris') continue;
      // debris only lives briefly: landed, gone to another SOI, or old and far away
      const far = !a || v.body !== a.body || Math.hypot(v.px - a.px, v.py - a.py) > 200000;
      if (v.onGround || (far && v.age > 120) || v.age > 3600) this.remove(v);
    }
    this.capDebris();
  }

  // Move an inactive vessel to time t: Kepler on rails in space, simple drag integration near the ground.
  propagate(v, t) {
    if (v.state === 'crashed' || v.onGround || v.state === 'landed') { v.t = Math.max(v.t, t); return; }
    let guard = 0;
    while (t - v.t > 1e-6 && guard++ < 400) {
      const b = BODIES[v.body], r = Math.hypot(v.px, v.py), alt = r - b.R, left = t - v.t;
      const vDown = Math.max(1, -(v.vx * v.px + v.vy * v.py) / r);
      if ((b.atm && alt < b.atm) || alt < 3000) {
        // near the ground or in the air: small numeric steps with drag (parachute if armed)
        const h = Math.min(left, 0.5);
        this.airStep(v, b, h);
        if (v.onGround || v.state !== 'flying') { v.t = t; return; }
      } else {
        const h = Math.min(left, Math.max(1, W_PERIOD(r, b) / 60), Math.max(1, (0.5 * (alt - (b.atm || 2000))) / vDown));
        Object.assign(v, keplerStep(v.px, v.py, v.vx, v.vy, b.mu, h));
        v.t += h;
        if (v.omega) v.heading += v.omega * h;
      }
      const nb = soiCheck(v.body, v.px, v.py, v.t);
      if (nb !== v.body) { Object.assign(v, convertFrame(v, v.body, nb, v.t)); v.body = nb; if (v.vtype !== 'Debris') this.emit(`${v.name} is now in ${BODIES[nb].name}'s sphere of influence.`); }
      if (v.body === 'ember' && Math.hypot(v.px, v.py) < BODIES.ember.R) { v.state = 'crashed'; v.endReason = 'fell into Ember'; return; }
    }
    v.orbit = orbitOf(v.px, v.py, v.vx, v.vy, BODIES[v.body]);
  }
  airStep(v, b, h) {
    const r = Math.hypot(v.px, v.py), ux = v.px / r, uy = v.py / r, g = b.mu / (r * r);
    let ax = -g * ux, ay = -g * uy;
    const sp = Math.hypot(v.vx, v.vy), rho = density(r - b.R, b), m = Math.max(0.05, v.mass);
    if (rho > 0 && sp > 0.01) {
      if (v.chuteArmed && sp < 300) v.chute = Math.min(1, (v.chute || 0) + h / 2.5);
      const q = 0.5 * rho * sp * sp;
      let d = (q * (v.cd + 0.12 * v.fins)) / (1000 * m);
      if (v.chute > 0) d += Math.min(40, (q * 600 * v.chute) / (1000 * m));
      d = Math.min(d, sp / h); // never reverse direction in one step
      ax -= (v.vx / sp) * d; ay -= (v.vy / sp) * d;
    }
    v.vx += ax * h; v.vy += ay * h; v.px += v.vx * h; v.py += v.vy * h; v.t += h;
    if (v.omega) v.heading += v.omega * h;
    const r2 = Math.hypot(v.px, v.py);
    if (r2 - b.R - (v.footOff || 0) <= 0) {
      const phi = Math.atan2(v.py, v.px), cx = Math.cos(phi), cy = Math.sin(phi);
      const vDown = Math.max(0, -(v.vx * cx + v.vy * cy)), vSide = Math.abs(-v.vx * cy + v.vy * cx);
      const res = landingResult({ vDown, vSide, tilt: 0, water: terrainAt(phi, v.body) === 'water', legs: v.legsDown && v.legs > 0 });
      if (!res.safe || v.body === 'ember') { v.state = 'crashed'; v.endReason = `hit ${b.name} at ${Math.round(Math.hypot(v.vx, v.vy))} m/s`; return; }
      v.px = cx * (b.R + (v.footOff || 0)); v.py = cy * (b.R + (v.footOff || 0)); v.vx = 0; v.vy = 0; v.heading = phi; v.onGround = true;
      if (v.vtype !== 'Debris') this.emit(`${v.name} landed on ${b.name}.`, 'good');
    }
  }

  // ---- persistence
  serialize() {
    return { v: 1, t: this.t, nextId: this.nextId, counters: this.counters, activeId: this.active ? this.active.id : null, vessels: this.vessels.filter((v) => v.state !== 'crashed' && v.vtype !== 'Debris').map((v) => v.toSave()) };
  }
  static load(data) {
    const w = new World();
    if (!data || data.v !== 1) return w;
    w.t = data.t || 0; w.nextId = data.nextId || 1; w.counters = data.counters || {};
    for (const o of data.vessels || []) { const f = Flight.fromSave(o); f.t = w.t; f.world = w; f.age = 0; w.vessels.push(f); }
    return w;
  }
  // Rows for the Tracking screen / vessel list.
  summary() {
    return this.vessels.filter((v) => v.vtype !== 'Debris').map((v) => {
      const B = BODIES[v.body], o = v.orbit || orbitOf(v.px, v.py, v.vx, v.vy, B);
      let status = v.state === 'crashed' ? 'Crashed' : v.onGround || v.state === 'landed' ? `Landed on ${B.name}` : !o.bound || o.ra > B.soi ? 'Escaping' : o.pe > (B.atm || 0) ? 'Orbiting' : 'Sub-orbital';
      return { v, id: v.id, name: v.name, type: v.vtype, body: B.name, ap: v.onGround ? null : o.ap, pe: v.onGround ? null : o.pe, status, powered: v.powered, active: v === this.active };
    });
  }
}
