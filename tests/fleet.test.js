// Multiple vessels: splitting, rails, SOI changes, save/load, classification, switching. node tests/fleet.test.js
import { World, DEBRIS_CAP } from '../js/world.js';
import { Flight } from '../js/flight.js';
import { BODIES, PLANET, orbitOf, classifyParts, designSummary, keplerStep, localState } from '../js/physics.js';
import { orbitMission } from './autopilot.js';
import { EX_SAT, EX_LANDER } from '../js/examples.js';

let fail = 0, pass = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ok  ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const SAT = [{ type: 'antenna' }, { type: 'probe' }, { type: 'battery', solar: 1 }];

console.log('Vessel type classification');
ok(classifyParts(SAT) === 'Satellite', 'probe + antenna + solar panels = Satellite');
ok(classifyParts([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS', legs: 1 }]) === 'Lander', 'command + engine + legs = Lander');
ok(classifyParts([{ type: 'capsule' }, { type: 'tankM' }, { type: 'engS' }]) === 'Rocket', 'capsule + engine = Rocket');
ok(classifyParts([{ type: 'probe' }]) === 'Probe', 'lone probe core = Probe');
ok(classifyParts([{ type: 'tankL' }, { type: 'engB' }]) === 'Debris', 'no command = Debris');
ok(classifyParts([{ type: 'capsule' }, { type: 'battery', solar: 1 }]) === 'Station', 'capsule + battery + solar, no engine = Station');

console.log('Splitting with a Stage Separator');
{
  const w = new World();
  const a = w.launch([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS' }, { type: 'dec' }, { type: 'probe' }, { type: 'tankM' }, { type: 'engS', legs: 1 }]);
  a.stage(); a.debugPlace({ body: 'numeria', alt: 60000, circular: true }); a.stage(); w.update(1 / 60);
  ok(w.vessels.length === 2 && w.vessels[1].vtype === 'Lander' && /^Lander-\d$/.test(w.vessels[1].name) && w.controllable.length === 2, `dropped section with a probe core becomes its own controllable craft (${w.vessels[1].name})`);
  const b = w.launch([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS' }, { type: 'dec' }, { type: 'tankM' }, { type: 'engS' }]);
  b.stage(); b.debugPlace({ body: 'numeria', alt: 60000, circular: true }); b.stage(); w.update(1 / 60);
  const deb = w.vessels.filter((v) => v.vtype === 'Debris');
  ok(deb.length === 1 && !w.controllable.includes(deb[0]), 'dropped section without command becomes a Debris vessel (not controllable)');
  for (let i = 0; i < DEBRIS_CAP + 10; i++) { const d = new Flight([{ type: 'tankS' }]); d.debugPlace({ alt: 90000, circular: true }); w.add(d); }
  ok(w.vessels.filter((v) => v.vtype === 'Debris').length === DEBRIS_CAP, `debris capped at ${DEBRIS_CAP}`);
}

console.log('Payload release');
{
  const w = new World();
  const a = w.launch([...SAT, { type: 'payDec' }, { type: 'probe' }, { type: 'tankM' }, { type: 'engV' }]);
  a.debugPlace({ body: 'numeria', alt: 80000, circular: true });
  const p = a.release(); w.update(1 / 60);
  ok(p && p !== a && p.vtype === 'Satellite' && p.name === 'Sat-1' && a.vtype === 'Rocket', 'R releases the satellite as Sat-1; carrier keeps control');
  ok(Math.hypot(p.px - a.px, p.py - a.py) > 1 && p.powered, 'satellite sits above the carrier and is powered');
  const m = sectionsMass(a) + sectionsMass(p);
  ok(Math.abs(m - designSummary([...SAT, { type: 'payDec' }, { type: 'probe' }, { type: 'tankM' }, { type: 'engV' }]).mass) < 1e-9, 'mass is conserved by the split');
  const s = w.cycle(1);
  ok(s === p && w.active === p && !a.throttle, '] switches control to the satellite');
  p.throttle = 1; w.update(0.1);
  ok(Math.abs(a.throttle) === 0, 'switching vessels changes which craft takes the controls');
  // no-brain carrier: control moves to the payload
  const w2 = new World();
  const c = w2.launch([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS', legs: 1 }, { type: 'payDec' }, { type: 'tankM' }, { type: 'engV' }]);
  c.debugPlace({ body: 'numeria', alt: 80000, circular: true }); c.release(); w2.update(1 / 60);
  ok(w2.active === c && c.vtype === 'Lander' && w2.vessels.some((v) => v.vtype === 'Debris'), 'carrier without probe core: you keep flying the payload, carrier is debris');
}
function sectionsMass(f) { return f.mass; }

console.log('On rails');
{
  const w = new World();
  const a = w.launch([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS' }]);
  a.debugPlace({ body: 'numeria', alt: 1e6, circular: true });
  const sat = new Flight(SAT); sat.debugPlace({ body: 'numeria', alt: 200000, circular: true, speedFactor: 1.15 }); w.add(sat);
  const e0 = orbitOf(sat.px, sat.py, sat.vx, sat.vy, PLANET).energy;
  a.warpIdx = 6; for (let i = 0; i < 2000; i++) { a.warpIdx = 6; w.update(1 / 30); }
  const e1 = orbitOf(sat.px, sat.py, sat.vx, sat.vy, PLANET).energy;
  ok(w.t > 3e5 && Math.abs(e1 - e0) / Math.abs(e0) < 1e-6, `orbit energy constant over ${Math.round(w.t / 3600)} h of warp (rel. change ${(Math.abs(e1 - e0) / Math.abs(e0)).toExponential(1)})`);
  // Kepler step vs fine numeric integration
  let st = { px: PLANET.R + 1e5, py: 0, vx: 0, vy: 1900 }; const k = keplerStep(st.px, st.py, st.vx, st.vy, PLANET.mu, 3000);
  let x = st.px, y = st.py, vx = st.vx, vy = st.vy; for (let i = 0; i < 300000; i++) { const h = 0.01, r = Math.hypot(x, y), g = -PLANET.mu / r ** 3; vx += g * x * h / 2; vy += g * y * h / 2; x += vx * h; y += vy * h; const r2 = Math.hypot(x, y), g2 = -PLANET.mu / r2 ** 3; vx += g2 * x * h / 2; vy += g2 * y * h / 2; }
  ok(Math.hypot(k.px - x, k.py - y) < 50, `Kepler step matches numeric integration (${Math.hypot(k.px - x, k.py - y).toFixed(2)} m off after 3000 s)`);
  // landed vessel on Lumo stays put (body frame)
  const l = new Flight([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS', legs: 1 }]); l.body = 'lumo'; l.px = 0; l.py = BODIES.lumo.R; l.onGround = true; w.add(l);
  for (let i = 0; i < 50; i++) w.update(1 / 30);
  ok(l.px === 0 && l.py === BODIES.lumo.R && l.body === 'lumo', 'landed vessel stays put on Lumo (moves with Lumo)');
}

console.log('SOI change on rails');
{
  const w = new World();
  const a = w.launch([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS' }]); a.debugPlace({ body: 'numeria', alt: 2e5, circular: true });
  const t0 = 1000; w.t = t0; a.t = t0;
  const L = localState('lumo', t0);
  const pr = new Flight([{ type: 'probe' }]); pr.t = t0; pr.body = 'numeria'; pr.px = L.x + BODIES.lumo.soi * 1.3; pr.py = L.y; pr.vx = L.vx - 600; pr.vy = L.vy; pr.leftGround = true; pr.onGround = false; w.add(pr);
  for (let i = 0; i < 4000 && pr.body === 'numeria'; i++) { a.warpIdx = 5; w.update(1 / 30); }
  ok(pr.body === 'lumo', 'inactive probe enters Lumo SOI on rails');
  const near = Math.abs(Math.hypot(pr.px, pr.py) - BODIES.lumo.soi) / BODIES.lumo.soi;
  ok(near < 0.1, `frame switched near the SOI edge (${(near * 100).toFixed(1)}% off)`);
}

console.log('World save / load');
{
  const w = new World();
  const a = w.launch([...SAT, { type: 'payDec' }, { type: 'probe' }, { type: 'tankM' }, { type: 'engV' }]);
  a.debugPlace({ body: 'numeria', alt: 80000, circular: true }); a.release(); w.update(0.5);
  w.rename(w.vessels[1], 'Weather Eye');
  const txt = JSON.stringify(w.serialize());
  const w2 = World.load(JSON.parse(txt));
  ok(w2.vessels.length === 2 && Math.abs(w2.t - w.t) < 1e-9, `round trip keeps ${w2.vessels.length} vessels and world time`);
  const s1 = w.vessels[1], s2 = w2.vessels[1];
  ok(s2.name === 'Weather Eye' && s2.vtype === 'Satellite' && Math.abs(s2.px - s1.px) < 1e-6 && Math.abs(s2.vy - s1.vy) < 1e-9 && Math.abs(s2.mass - s1.mass) < 1e-9, 'name, type, position, velocity and mass survive');
  const n = w2.launch([{ type: 'probe' }, { type: 'tankS' }, { type: 'engS' }]);
  ok(w2.vessels.length === 3 && n.t === w2.t && n.name === 'Rocket-2', 'launching again adds a new craft; old ones stay (names keep counting)');
}

console.log('Examples');
{
  for (const [name, ex] of [['Satellite Launcher', EX_SAT], ['Lander Carrier', EX_LANDER]]) { const S = designSummary(ex); ok(S.errors.length === 0, `${name} valid (cost ${S.cost} cr, Δv ${Math.round(S.dvTotal)} m/s, warnings: ${S.warns.join(' | ') || 'none'})`); }
  const w = new World(); const f = w.launch(EX_SAT);
  const it = orbitMission(f, { peTarget: 45000 }); let n = 0; while (!it.next().done && n++ < 3e6);
  ok(f.stats.orbit, `Satellite Launcher reaches orbit (Pe ${Math.round(f.orbit.pe)} m)`);
  if (f.hasFairing) f.jettisonFairing();
  const sat = f.release(); w.update(1 / 30);
  ok(sat && sat.vtype === 'Satellite' && sat.orbit.pe > 30000, `satellite deployed into orbit (Pe ${Math.round(sat && sat.orbit.pe)} m)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
