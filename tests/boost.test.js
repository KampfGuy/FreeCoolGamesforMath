// SRBs, side boosters (parallel staging), nose cones, probe core, fairings: node tests/boost.test.js
import { designSummary, planDv, sectionInfo, sideBoosters, dragFactor } from '../js/physics.js';
import { PARTS, G0, fairShellMass } from '../js/parts.js';
import { Flight } from '../js/flight.js';
import { orbitMission } from './autopilot.js';

let fail = 0, pass = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ok  ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const run = (f, sec, dt = 1 / 60) => { for (let i = 0; i < sec / dt && f.state === 'flying'; i++) f.update(dt); };

console.log('Solid rocket boosters');
{
  const f = new Flight([{ type: 'probe' }, { type: 'srbS', fins: 1 }]);
  f.stage(); f.throttle = 0; // try to throttle down right after lighting
  run(f, 2);
  ok(f.thrustNow > 140 && !f.onGround, `SRB keeps full thrust with throttle at 0 (${f.thrustNow.toFixed(1)} kN)`);
  const sf0 = f.bottom.parts[1].sf;
  run(f, 60);
  ok(f.bottom.parts[1].sf <= 1e-9 && f.thrustNow === 0, `SRB burns until empty, then stops (fuel ${sf0.toFixed(2)} → 0)`);
  const S = designSummary([{ type: 'probe' }, { type: 'srbS' }]);
  const hand = 230 * G0 * Math.log((0.1 + 0.35 + 1.6) / (0.1 + 0.35));
  ok(near(S.stages[0].dv, hand, 0.01), `SRB stage Δv = 230·g0·ln(2.05/0.45) = ${hand.toFixed(1)} m/s`);
  ok(near(S.stages[0].burn, 1.6 * 230 * G0 / 150, 1e-6), `SRB burn time = fuel·Isp·g0/T = ${(1.6 * 230 * G0 / 150).toFixed(1)} s`);
}

console.log('Parallel staging (core + side boosters)');
{
  const side = { nose: '', body: 'srbS', eng: '' };
  const stack = [{ type: 'probe' }, { type: 'tankL', side }, { type: 'engB' }];
  const S = designSummary(stack);
  // hand calc (vacuum): core engB 240 kN @280 s, tankL 4 t; boosters 2× srbS 150 kN @230 s, 1.6 t each
  const mdC = 240 / (280 * G0), mdB = 300 / (230 * G0);
  const coreDry = 0.1 + 0.5 + 1.5 + 0.08, bDry = 2 * 0.35;
  const m0 = coreDry + 4 + bDry + 3.2;
  const t1 = 3.2 / mdB; // boosters run dry first
  const m1 = m0 - (mdC + mdB) * t1;
  const dv1 = (540 / (mdC + mdB)) * Math.log(m0 / m1);
  const m2 = m1 - bDry, coreLeft = 4 - mdC * t1;
  const dv2 = 280 * G0 * Math.log(m2 / (m2 - coreLeft));
  const st = S.stages[0];
  ok(st.rows.length === 2 && st.rows[0].boosters && !st.rows[1].boosters, 'stage 1 shows two rows: +boosters, then core');
  ok(near(st.rows[0].dv, dv1, 0.01), `phase 1 Δv ${st.rows[0].dv.toFixed(1)} = hand ${dv1.toFixed(1)} m/s`);
  ok(near(st.rows[1].dv, dv2, 0.01), `phase 2 Δv ${st.rows[1].dv.toFixed(1)} = hand ${dv2.toFixed(1)} m/s`);
  ok(near(st.rows[0].twr, 540 / (m0 * G0), 1e-9), `stage 1 TWR uses combined thrust (${st.rows[0].twr.toFixed(2)})`);
  ok(near(st.rows[0].burn, t1, 1e-9), `booster phase lasts ${t1.toFixed(1)} s`);
  const noB = designSummary([{ type: 'probe' }, { type: 'tankL' }, { type: 'engB' }]);
  ok(S.dvTotal > noB.dvTotal + 300, `boosters add Δv (${Math.round(noB.dvTotal)} → ${Math.round(S.dvTotal)} m/s)`);
  ok(near(S.mass, m0, 1e-9), `total mass includes boosters (${m0.toFixed(2)} t)`);
  ok(near(S.cost, 150 + 300 + 480 + 80 + 2 * 130, 1e-9), 'cost includes decoupler + both boosters');

  // flight: boosters ignite with stage 1, throttle doesn't stop them, STAGE drops them
  const f = new Flight(stack);
  f.stage();
  ok(f.boostersLit && f.boosters.length === 1, 'boosters lit on first STAGE');
  run(f, 1);
  ok(near(f.thrustNow, 240 + 300, 1), `core + boosters burn together (${f.thrustNow.toFixed(0)} kN)`);
  f.throttle = 0; run(f, 0.5);
  ok(near(f.thrustNow, 300, 1), `throttle 0: liquid core stops, SRB boosters keep ${f.thrustNow.toFixed(0)} kN`);
  f.throttle = 1;
  const before = f.mass, deb = f.debris.length;
  run(f, t1);
  ok(f.boosters[0].side.sf <= 1e-9, 'boosters empty after their burn time');
  const mSep = f.mass; f.stage();
  ok(f.boosters.length === 0 && f.debris.length === deb + 2, 'STAGE drops both boosters (2 debris falling)');
  ok(near(mSep - f.mass, bDry + 0.08, 1e-9), `STAGE removes booster dry mass + decouplers (${(mSep - f.mass).toFixed(2)} t)`);
  ok(f.sections.length === 1 && f.ignited, 'core keeps burning after booster separation');
  const d0 = f.debris[f.debris.length - 1];
  run(f, 3);
  ok(f.debris.includes(d0) && Math.hypot(d0.px - f.px, d0.py - f.py) > 10, `dropped boosters fall away from the rocket (${Math.round(Math.hypot(d0.px - f.px, d0.py - f.py))} m apart after 3 s)`);

  // liquid side boosters (tank + engine) follow the throttle
  const L = new Flight([{ type: 'probe' }, { type: 'tankL', side: { nose: 'noseS', body: 'tankM', eng: 'engS' } }, { type: 'engB' }]);
  L.stage(); run(L, 0.5);
  ok(near(L.thrustNow, 240 + 130, 1), `liquid side boosters add thrust (${L.thrustNow.toFixed(0)} kN)`);
  L.throttle = 0; run(L, 0.3);
  ok(L.thrustNow === 0, 'liquid boosters stop with throttle 0');
}

console.log('Command parts & nose cones');
{
  const P = designSummary([{ type: 'probe' }, { type: 'tankM' }, { type: 'engS', fins: 1 }]);
  ok(P.errors.length === 0, 'probe core alone satisfies validation (no capsule needed)');
  const N = designSummary([{ type: 'tankM' }, { type: 'engS' }]);
  ok(N.errors.some((e) => /Probe Core/.test(e)), 'no capsule/probe → error mentions probe core');
  const C = designSummary([{ type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engS', fins: 1 }]);
  ok(C.errors.length === 0 && !C.warns.some((w) => /nose/i.test(w)), 'no nose cone needed: no errors, no nose warning');
  const NC = designSummary([{ type: 'noseS' }, { type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engS', fins: 1 }]);
  ok(NC.errors.length === 0, 'nose cone allowed above capsule');
  ok(NC.cd < C.cd && near(NC.cd, 1.6 * 0.8, 1e-9), `small nose cone lowers drag factor ${C.cd} → ${NC.cd.toFixed(2)}`);
  ok(designSummary([{ type: 'noseL' }, { type: 'probe' }, { type: 'tankM' }, { type: 'engS' }]).cd < NC.cd, 'large nose cone even lower');
  const BN = sideBoosters([{ type: 'tankL', side: { nose: 'noseS', body: 'srbS', eng: '' } }]), B0 = sideBoosters([{ type: 'tankL', side: { nose: '', body: 'srbS', eng: '' } }]);
  ok(dragFactor([], BN) < dragFactor([], B0), 'nose cones on side boosters lower their drag');
  // probe-core craft can land safely (counts as "your craft")
  const f = new Flight([{ type: 'chute' }, { type: 'probe' }, { type: 'tankS' }, { type: 'engS' }]);
  f.debugPlace({ body: 'numeria', alt: 3, vx: 0, vy: -4 });
  for (let i = 0; i < 600 && f.state === 'flying'; i++) f.step(1 / 120);
  ok(f.state === 'landed' && f.stats.landedSafe, 'probe-core craft soft landing counts as safe');
}

console.log('Fairings');
{
  const base = [{ type: 'probe' }, { type: 'tankS' }, { type: 'engS' }];
  const withF = (shape, len = 2) => [{ type: 'probe' }, { type: 'fairing', shape, len }, { type: 'tankS' }, { type: 'engS' }];
  const d0 = designSummary(base).cd;
  const cds = Object.fromEntries(['ogive', 'cone', 'blunt', 'bulb'].map((k) => [k, designSummary(withF(k)).cd]));
  ok(Object.values(cds).every((c) => c < d0), `every fairing shape lowers drag (${d0} → ${Object.values(cds).map((c) => c.toFixed(2)).join(', ')})`);
  ok(cds.ogive < cds.cone && cds.cone < cds.blunt && cds.blunt < cds.bulb, 'ogive slickest, bulbous most drag');
  ok(designSummary(withF('ogive')).errors.length === 0, 'probe under a fairing is valid');
  ok(designSummary([{ type: 'fairing' }, { type: 'probe' }, { type: 'tankS' }, { type: 'engS' }]).errors.length > 0, 'fairing on the very top is an error');
  const m1 = designSummary(withF('ogive', 1)).mass, m3 = designSummary(withF('ogive', 3)).mass;
  ok(near(m3 - m1, fairShellMass(3) - fairShellMass(1), 1e-9) && designSummary(withF('ogive', 3)).cost > designSummary(withF('ogive', 1)).cost, 'fairing mass & cost grow with length');
  const f = new Flight(withF('cone'));
  const mBefore = f.mass, cdBefore = f.cd;
  f.debugPlace({ body: 'numeria', alt: 50000, circular: true });
  ok(f.jettisonFairing(), 'F jettisons fairing');
  ok(near(mBefore - f.mass, fairShellMass(2), 1e-9), `fairing jettison reduces mass by ${fairShellMass(2)} t`);
  ok(f.cd > cdBefore && !f.hasFairing, 'drag factor back up after jettison (fairing gone)');
  ok(f.debris.filter((d) => d.fairing).length === 2, 'two fairing halves become debris');
  // drag: same flight, with vs without fairing
  const dragAt = (stack) => { const g = new Flight(stack); g.debugPlace({ body: 'numeria', alt: 5000, vx: 0, vy: 300, angle: Math.PI / 2 }); const v0 = g.vy; g.step(0.01); return (v0 - g.vy) / 0.01 - g.B.mu / Math.hypot(g.px, g.py) ** 2; }; // drag deceleration
  ok(dragAt(withF('ogive')) < dragAt(base), 'in-flight drag deceleration lower with fairing (same speed & height)');
  // stage key opens the fairing when nothing else is left
  const g = new Flight(withF('ogive'));
  g.stage(); g.debugPlace({ body: 'numeria', alt: 50000, circular: true }); g.stage();
  ok(!g.hasFairing, 'STAGE opens the fairing once engines are lit and no stages remain');
}

console.log('Example: Booster Heavy reaches orbit');
{
  const EX_HEAVY = [{ type: 'probe' }, { type: 'fairing', shape: 'ogive', len: 2 }, { type: 'tankM' }, { type: 'engV' }, { type: 'dec' }, { type: 'tankL', struts: 1, side: { nose: 'noseS', body: 'srbS', eng: '' } }, { type: 'engB', fins: 1 }];
  const S = designSummary(EX_HEAVY);
  ok(S.errors.length === 0 && S.warns.length === 0, `design valid, no warnings (cost ${S.cost} cr, Δv ${Math.round(S.dvTotal)} m/s)`);
  const f = new Flight(EX_HEAVY);
  const logs = [];
  const it = orbitMission(f, { log: (m) => logs.push(m) });
  let n = 0; while (!it.next().done && n++ < 3e6);
  console.log('    ' + logs.join('\n    '));
  ok(f.stats.usedBoosters && f.stats.fairingJett, 'boosters used and fairing opened');
  ok(f.stats.orbit && f.state === 'flying', `reached orbit (Pe ${Math.round(f.orbit.pe)} m) with ${f.fuelTotal.toFixed(2)} t fuel left`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
