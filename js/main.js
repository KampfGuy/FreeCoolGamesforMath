// FreeCoolGamesforMath.com: rocket builder + flight. Screens, input, missions, HUD.
import { PARTS, W, TAU, drawStack, FAIR_SHAPES, FAIR_LEN, SIDE_BODIES, SIDE_ENGINES, SIDE_NOSES, fairShellMass } from './parts.js?v=boost1';
export const VERSION = 'boost1';
import { PLANET, BODIES, designSummary, ORBIT_DV } from './physics.js?v=boost1';
import { Flight, WARPS, fmtKm, drawStars } from './flight.js?v=boost1';
import { Builder } from './builder.js?v=boost1';

const $ = (s) => document.querySelector(s);
const cv = $('#cv'); const ctx = cv.getContext('2d');
let cw = 0, ch = 0, dpr = 1;
function resize() {
  dpr = Math.min(1.5, window.devicePixelRatio || 1);
  cw = window.innerWidth; ch = window.innerHeight;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
}
window.addEventListener('resize', resize); resize();

// ---------- storage (local only, no accounts)
const store = {
  get(k, d) { try { const v = localStorage.getItem('fcgm.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fcgm.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- missions
const EX_HOPPER = [{ type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engS', fins: 1 }];
const EX_ORBITER = [{ type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engV' }, { type: 'dec' }, { type: 'tankL', struts: 1 }, { type: 'engB', fins: 1 }];
const EX_MOON = [{ type: 'chute' }, { type: 'capsule' }, { type: 'tankM' }, { type: 'engV', legs: 1 }, { type: 'dec' }, { type: 'tankL', struts: 1 }, { type: 'engV' }, { type: 'dec' }, { type: 'tankL', struts: 1 }, { type: 'tankL' }, { type: 'engB', fins: 1 }];
const EX_HEAVY = [{ type: 'probe' }, { type: 'fairing', shape: 'ogive', len: 2 }, { type: 'tankM' }, { type: 'engV' }, { type: 'dec' }, { type: 'tankL', struts: 1, side: { nose: 'noseS', body: 'srbS', eng: '' } }, { type: 'engB', fins: 1 }];
const MISSIONS = [
  { id: 'hop', name: 'First Hop', goal: 'Fly higher than 5 km (5,000 m).', budget: 1500, hint: 'One tank and one engine is enough. Check that TWR is above 1!',
    check: (s) => s.maxAlt >= 5000, stars: [['Reach 5 km', (s) => s.maxAlt >= 5000], ['Thrifty: cost 1,000 cr or less', (s, c) => c <= 1000], ['Soft landing', (s) => s.landedSafe]] },
  { id: 'space', name: 'Edge of Space', goal: 'Reach 30 km, the top of the air.', budget: 2500, hint: 'More fuel means more Δv. Fins keep you pointed straight.',
    check: (s) => s.maxAlt >= 30000, stars: [['Reach 30 km', (s) => s.maxAlt >= 30000], ['Thrifty: cost 1,700 cr or less', (s, c) => c <= 1700], ['Soft landing', (s) => s.landedSafe]] },
  { id: 'orbit', name: 'Make an Orbit', goal: 'Get your low point (Pe) above 30 km.', budget: 4500, hint: 'Go up ~10 km, then tip sideways. Circle speed is about 1,600 m/s.',
    check: (s) => s.orbit, stars: [['Reach orbit', (s) => s.orbit], ['Thrifty: cost 3,000 cr or less', (s, c) => c <= 3000], ['Come home: soft landing', (s) => s.landedSafe]] },
  { id: 'return', name: 'Round Trip', goal: 'Reach 30 km, then land your craft under 10 m/s.', budget: 3000, hint: 'Bring a parachute. Drop empty stages before you fall back.',
    check: (s) => s.maxAlt >= 30000 && s.landedSafe, stars: [['Space + soft landing', (s) => s.maxAlt >= 30000 && s.landedSafe], ['Thrifty: cost 2,000 cr or less', (s, c) => c <= 2000], ['Gentle ride: never above 4 g', (s) => s.maxG <= 4 && s.maxAlt >= 30000]] },
  { id: 'flyby', name: 'Moon Flyby', goal: 'Fly into Lumo\'s sphere of influence (SOI).', budget: 4000, dv: 3000, hint: 'From low orbit, burn forward about 560 m/s at the right moment so your Ap reaches Lumo (3,000 km). Open the Map: an "Encounter: Lumo" marker means you will get there. Lumo\'s SOI = a·(m/M)^(2/5) ≈ 505 km.',
    check: (s) => !!s.soi.lumo, stars: [['Enter Lumo\'s SOI', (s) => !!s.soi.lumo], ['Thrifty: cost 2,500 cr or less', (s, c) => c <= 2500], ['Come home: soft landing on Numeria', (s) => !!s.soi.lumo && s.landedSafe]] },
  { id: 'moonland', name: 'Moon Landing', goal: 'Land softly on Lumo (legs recommended).', budget: 5000, dv: 4000, hint: 'Δv budget: orbit ≈ 2,300 + transfer ≈ 560 + landing ≈ 600 m/s. Lumo has no air, so no parachute: point Back (H) and burn. Press G for landing legs: safe up to 12 m/s.',
    check: (s) => s.landedLumo, stars: [['Land on Lumo', (s) => s.landedLumo], ['Thrifty: cost 3,200 cr or less', (s, c) => c <= 3200], ['Feather touch: under 4 m/s', (s) => s.landedLumo && s.lumoSpeed < 4]] },
  { id: 'moonback', name: 'Moon and Back', goal: 'Land on Lumo, then land safely on Numeria.', budget: 6500, dv: 4800, hint: 'Save Δv for the trip home: about 600 m/s to leave Lumo and aim your Pe into Numeria\'s air (below 30 km). Then the parachute does the rest.',
    check: (s) => s.landedLumoBeforeHome && s.landedSafe, stars: [['Lumo, then home', (s) => s.landedLumoBeforeHome && s.landedSafe], ['Thrifty: cost 3,500 cr or less', (s, c) => c <= 3500], ['Gentle ride: never above 5 g', (s) => s.maxG <= 5 && s.landedLumoBeforeHome]] },
  { id: 'escape', name: 'Escape', goal: 'Leave Numeria\'s SOI and orbit the star Ember.', budget: 4500, dv: 3100, hint: 'Escape speed is √2 × circle speed. From low orbit that is ≈ 680 m/s more. Numeria\'s SOI = a·(m/M)^(2/5) ≈ 11,900 km. Use time warp to coast out!',
    check: (s) => !!s.soi.ember, stars: [['Reach Ember orbit', (s) => !!s.soi.ember], ['Thrifty: cost 2,500 cr or less', (s, c) => c <= 2500], ['Efficient: under 3,300 m/s Δv used', (s) => !!s.soi.ember && s.dvUsed < 3300]] },
  { id: 'heavy', name: 'Heavy Lift', goal: 'Reach orbit using side boosters.', budget: 3500, hint: 'Add Side Boosters (radial decouplers) to a core tank. They fire with Stage 1; press STAGE when they burn out to drop the empty weight. Try "Example: Booster Heavy". A fairing or nose cone cuts drag.',
    check: (s) => s.orbit && s.usedBoosters, stars: [['Orbit with side boosters', (s) => s.orbit && s.usedBoosters], ['Thrifty: cost 2,300 cr or less', (s, c) => c <= 2300], ['Open the fairing in space', (s) => s.orbit && s.usedBoosters && s.fairingJett]] },
  { id: 'free', name: 'Free Flight', goal: 'No goal, no budget. Build anything!', budget: Infinity, hint: 'Try a huge rocket. Visit Lumo, or escape to orbit Ember!', check: () => false, stars: [] },
];
let mission = MISSIONS[0];

// ---------- screens & overlays
let screen = 'title';
function show(name) {
  screen = name;
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'scr-' + name));
  if (name === 'missions') renderMissions();
  if (name === 'hangar') updateStats();
}
const overlay = (id, on) => $('#ov-' + id).classList.toggle('show', on);
const overlayOpen = (id) => $('#ov-' + id).classList.contains('show');
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { const g = b.dataset.go; if (g === 'help') overlay('help', true); else show(g); }));

function toast(msg, kind = 'info') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  const box = $('#toasts'); box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'good' || kind === 'bad' ? 4200 : 3000);
}

// ---------- missions screen
function renderMissions() {
  const best = store.get('stars', {});
  const list = $('#mission-list'); list.innerHTML = '';
  let total = 0, max = 0;
  for (const m of MISSIONS) {
    const b = document.createElement('button'); b.className = 'card';
    const got = best[m.id] || 0; total += got; max += m.stars.length;
    const starTxt = m.stars.length ? '★'.repeat(got) + '☆'.repeat(m.stars.length - got) : '∞';
    b.innerHTML = `<span class="ct"></span><span class="cg"></span><span class="cb"></span><span class="cs">${starTxt}</span>`;
    b.querySelector('.ct').textContent = m.name; b.querySelector('.cg').textContent = m.goal;
    b.querySelector('.cb').textContent = isFinite(m.budget) ? `Budget: ${m.budget.toLocaleString()} cr` : 'Unlimited budget';
    b.addEventListener('click', () => openHangar(m));
    list.append(b);
  }
  $('#star-total').textContent = `★ ${total} / ${max}`;
}

// ---------- hangar
const builder = new Builder({ paletteEl: $('#palette'), viewEl: $('#hangar-view'), onChange: () => { updateStats(); store.set('design.' + mission.id, builder.stack); }, toast });
function openHangar(m) {
  mission = m;
  const saved = store.get('design.' + m.id, null);
  builder.setStack(saved || []);
  show('hangar');
  if (!saved) toast('Tip: try an Example rocket, or drag parts in to build your own.');
}
document.querySelector('.hv-top').addEventListener('click', (e) => {
  const a = e.target.closest('button'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'back') show('missions');
  if (act === 'ex1') builder.setStack(EX_HOPPER);
  if (act === 'ex2') builder.setStack(EX_ORBITER);
  if (act === 'ex3') builder.setStack(EX_MOON);
  if (act === 'ex4') builder.setStack(EX_HEAVY);
  if (act === 'clear') builder.setStack([]);
  if (act === 'help') overlay('help', true);
});
const n0 = (v) => Math.round(v).toLocaleString();
function updateStats() {
  const S = designSummary(builder.stack);
  const m = mission;
  $('#st-mission').innerHTML = `<div class="mt"></div><div class="mg"></div>`;
  $('#st-mission .mt').textContent = m.name; $('#st-mission .mg').textContent = m.goal + ' ' + m.hint;
  const over = S.cost > m.budget;
  const pct = isFinite(m.budget) ? Math.min(100, (S.cost / m.budget) * 100) : 0;
  $('#st-budget').innerHTML = `<div class="kv"><b>Cost</b><span class="${over ? 'low' : ''}">${n0(S.cost)} / ${isFinite(m.budget) ? n0(m.budget) : '∞'} cr</span></div>
    ${isFinite(m.budget) ? `<div class="bar2 ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div>` : ''}
    <div class="kv"><b>Mass</b><span>${S.mass.toFixed(2)} t</span></div><div class="kv"><b>Parts</b><span>${S.parts} (struts hold ${6 + 4 * S.struts})</span></div>`;
  let rows = '';
  for (const s of S.stages) {
    if (s.boosters && s.rows.length > 1) {
      // parallel staging: core + boosters together, then the core alone
      s.rows.forEach((r, j) => (rows += `<tr class="sub" title="${r.boosters ? 'Core engines and side boosters burn together. Δv = c·ln(m0/m1) with c = total thrust ÷ total mass flow.' : 'After the boosters drop, the core keeps going with the fuel it has left.'}"><td>Stage ${s.num}${r.boosters ? ' + boosters' : ' core'}</td><td>${n0(r.dv)}</td><td class="${r.twr < 1 && j === 0 ? 'low' : ''}">${r.twr.toFixed(2)}</td><td>${r.burn ? n0(r.burn) + ' s' : '–'}</td></tr>`));
    } else rows += `<tr><td>Stage ${s.num}${s.boosters ? ' + boosters' : ''}</td><td>${n0(s.dv)}</td><td class="${s.thrust && s.twr < 1 ? 'low' : ''}">${s.thrust ? s.twr.toFixed(2) : '–'}</td><td>${s.burn ? n0(s.burn) + ' s' : '–'}</td></tr>`;
  }
  $('#st-stages').innerHTML = S.stages.length ? `<table class="stg"><tr><th>Fires</th><th>Δv m/s</th><th>TWR</th><th>Burn</th></tr>${rows}</table><div class="kv small"><b>Air drag factor</b><span title="1.6 = plain blunt top. Nose cones and fairings make it smaller.">${S.cd.toFixed(2)}</span></div>` : '<div class="kv"><b>No stages yet</b></div>';
  const need = m.dv || ORBIT_DV;
  const dvPct = Math.min(100, (S.dvTotal / need) * 100);
  $('#st-dv').innerHTML = `<div class="kv"><b>Total Δv</b><span>${n0(S.dvTotal)} m/s</span></div>
    <div class="bar2"><div style="width:${dvPct}%;background:${S.dvTotal >= need ? 'var(--good)' : 'var(--warn)'}"></div></div>
    <div class="kv"><b>${m.dv ? 'This mission needs about' : 'Orbit needs about'}</b><span>${n0(need)} m/s</span></div>`;
  const sel = builder.sel >= 0 ? builder.stack[builder.sel] : null;
  if (sel) {
    const P = PARTS[sel.type];
    const chip = (attr, val, label, on, tip = '', dis = false) => `<button data-${attr}="${val}" class="${on ? 'on' : ''}" title="${tip}" ${dis ? 'disabled' : ''}>${label}</button>`;
    let extra = '';
    if (sel.type === 'fairing') {
      extra += `<div class="opt"><b>Fairing shape</b><div class="chips">${Object.entries(FAIR_SHAPES).map(([k, v]) => chip('fs', k, v.name, (sel.shape || 'ogive') === k, `${v.tip} · drag ×${v.cd}`)).join('')}</div></div>`;
      extra += `<div class="opt"><b>Length</b><div class="chips">${Object.entries(FAIR_LEN).map(([k, v]) => chip('fl', k, v.name, String(sel.len || 2) === k, `Shell ${fairShellMass(+k).toFixed(2)} t`)).join('')}</div></div>`;
      extra += `<div class="mg small">Shell: ${fairShellMass(sel.len).toFixed(2)} t. Covers every part above it. In flight press <b>F</b> (or STAGE when nothing else is left) to split it off.</div>`;
    }
    if (sel.side) {
      const sd = sel.side, srb = PARTS[sd.body].srb;
      extra += `<div class="opt"><b>Side boosters (×2)</b><div class="chips">${SIDE_BODIES.map((k) => chip('sb', k, PARTS[k].name.replace(' Solid Booster', ' SRB'), sd.body === k, PARTS[k].blurb)).join('')}</div></div>`;
      extra += `<div class="opt"><b>Booster engine</b><div class="chips">${SIDE_ENGINES.map((k) => chip('se', k || 'none', k ? PARTS[k].name : 'None', (sd.eng || '') === k && !srb, k ? PARTS[k].blurb : '', srb)).join('')}</div>${srb ? '<div class="mg small">Solid boosters have their own nozzle.</div>' : ''}</div>`;
      extra += `<div class="opt"><b>Booster nose cone</b><div class="chips">${SIDE_NOSES.map((k) => chip('sn', k || 'none', k ? PARTS[k].name.replace(' Nose Cone', '') : 'None', (sd.nose || '') === k, k ? PARTS[k].blurb : 'Optional')).join('')}</div></div>`;
    }
    $('#st-sel').innerHTML = `<div class="kv"><b>Selected</b><span>${P.name}</span></div><div class="mg" style="font-size:13px;color:var(--muted)">${P.blurb}</div>${extra}<div class="chips">
      <button data-s="up">▲ Up</button><button data-s="down">▼ Down</button><button data-s="del">✕ Remove</button>
      ${sel.fins ? '<button data-s="fins">✕ Fins</button>' : ''}${sel.struts ? '<button data-s="struts">✕ Struts</button>' : ''}${sel.legs ? '<button data-s="legs">✕ Legs</button>' : ''}${sel.side ? '<button data-s="side">✕ Side boosters</button>' : ''}</div>`;
  } else $('#st-sel').innerHTML = '<div class="kv"><b>Tip</b><span>Tap a part to select it</span></div>';
  const ul = $('#st-warn'); ul.innerHTML = '';
  const errs = [...S.errors]; if (over) errs.push(`Over budget by ${n0(S.cost - m.budget)} cr. Remove something!`);
  for (const e of errs) { const li = document.createElement('li'); li.className = 'e'; li.textContent = '⛔ ' + e; ul.append(li); }
  for (const w of S.warns) { const li = document.createElement('li'); li.className = 'w'; li.textContent = '⚠ ' + w; ul.append(li); }
  $('#b-launch').disabled = errs.length > 0;
  return S;
}
$('#st-sel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const s = b.dataset.s;
  if (b.dataset.fs) builder.setFairing('shape', b.dataset.fs);
  if (b.dataset.fl) builder.setFairing('len', +b.dataset.fl);
  if (b.dataset.sb) builder.setSide('body', b.dataset.sb);
  if (b.dataset.se) builder.setSide('eng', b.dataset.se === 'none' ? '' : b.dataset.se);
  if (b.dataset.sn) builder.setSide('nose', b.dataset.sn === 'none' ? '' : b.dataset.sn);
  if (s === 'up') builder.moveSel(-1); if (s === 'down') builder.moveSel(1); if (s === 'del') builder.removeSelected();
  if (s === 'fins' || s === 'struts' || s === 'legs' || s === 'side') builder.stripRadial(s);
});
$('#b-launch').addEventListener('click', launch);

// ---------- flight
let flight = null, paused = false, endTimer = 0, missionDone = false, launchStack = null, launchCost = 0, resultsShown = false;
const view = { map: false, zoom: 1, mapZoom: 1 };
function launch() {
  const S = updateStats(); if ($('#b-launch').disabled) return;
  launchStack = builder.stack.map((p) => ({ ...p })); launchCost = S.cost;
  startFlight();
}
function startFlight() {
  flight = new Flight(launchStack);
  paused = false; endTimer = 0; missionDone = false; resultsShown = false;
  view.map = false; view.zoom = 1; view.mapZoom = 1;
  overlay('pause', false); overlay('results', false);
  show('flight');
  $('#h-goal').textContent = mission.goal;
  syncButtons();
  toast('Press STAGE (Space) to start the engines!');
}
function syncButtons() {
  if (!flight) return;
  const names = { free: 'Free', up: 'Up', pro: 'Forward', retro: 'Back' };
  $('#b-hold').innerHTML = `Point: ${names[flight.hold]}<small>H</small>`;
  $('#b-hold').classList.toggle('on', flight.hold !== 'free');
  $('#b-map').classList.toggle('on', view.map);
  $('#b-warp').innerHTML = `×${WARPS[flight.warpIdx]}<small>Warp</small>`;
  $('#b-chute').classList.toggle('on', flight.chuteArmed);
  $('#b-legs').classList.toggle('on', flight.legsDown);
  $('#b-legs').disabled = !flight.legs;
  $('#b-fair').disabled = !flight.hasFairing;
}
const MAPZ = [0.00005, 40];
const HOLDS = ['free', 'up', 'pro', 'retro'];
const act = {
  stage: () => { flight && flight.stage(); syncButtons(); },
  legs: () => { flight && flight.toggleLegs(); syncButtons(); },
  chute: () => { flight && flight.armChute(); syncButtons(); },
  fairing: () => { flight && flight.jettisonFairing(); syncButtons(); },
  map: () => { view.map = !view.map; syncButtons(); },
  hold: () => { if (!flight) return; flight.hold = HOLDS[(HOLDS.indexOf(flight.hold) + 1) % HOLDS.length]; syncButtons(); },
  warpUp: () => { if (flight) { flight.warpIdx = Math.min(WARPS.length - 1, flight.warpIdx + 1); syncButtons(); } },
  warpDown: () => { if (flight) { flight.warpIdx = Math.max(0, flight.warpIdx - 1); syncButtons(); } },
  zoomIn: () => { if (view.map) view.mapZoom = Math.min(MAPZ[1], view.mapZoom * 1.6); else view.zoom = Math.min(6, view.zoom * 1.25); },
  zoomOut: () => { if (view.map) view.mapZoom = Math.max(MAPZ[0], view.mapZoom / 1.6); else view.zoom = Math.max(0.0005, view.zoom / 1.25); },
  pause: () => { if (screen !== 'flight' || resultsShown) return; paused = !paused; overlay('pause', paused); },
};
$('#b-stage').addEventListener('click', act.stage);
$('#b-chute').addEventListener('click', act.chute);
$('#b-legs').addEventListener('click', act.legs);
$('#b-fair').addEventListener('click', act.fairing);
$('#b-map').addEventListener('click', act.map);
$('#b-hold').addEventListener('click', act.hold);
$('#b-warp').addEventListener('click', (e) => { if (flight && flight.warpIdx >= WARPS.length - 1) { flight.warpIdx = 0; syncButtons(); } else act.warpUp(); });
$('#b-zin').addEventListener('click', act.zoomIn);
$('#b-zout').addEventListener('click', act.zoomOut);
$('#b-pause').addEventListener('click', act.pause);
const thr = $('#thr');
thr.addEventListener('input', () => { if (flight) flight.throttle = thr.value / 100; });
$('#b-thr0').addEventListener('click', () => { if (flight) flight.throttle = 0; });
$('#b-thr100').addEventListener('click', () => { if (flight) flight.throttle = 1; });
// hold-to-turn buttons
let btnTurn = 0;
for (const [id, dir] of [['#b-left', 1], ['#b-right', -1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { btnTurn = dir; b.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { if (btnTurn === dir) btnTurn = 0; });
}
// pause dialog
$('#ov-pause').addEventListener('click', (e) => {
  const a = e.target.closest('button'); if (!a) return;
  const k = a.dataset.act;
  if (k === 'resume') act.pause();
  if (k === 'finish') { overlay('pause', false); paused = false; showResults(); }
  if (k === 'relaunch') startFlight();
  if (k === 'tohangar') { overlay('pause', false); paused = false; flight = null; show('hangar'); }
  if (k === 'help') overlay('help', true);
});
$('#ov-help').addEventListener('click', (e) => { const a = e.target.closest('button'); if (a && a.dataset.act === 'closehelp') overlay('help', false); });

// pointer aim on the canvas (mouse / trackpad): hold to point the rocket
let aimPointer = null;
cv.addEventListener('pointerdown', (e) => { if (screen !== 'flight' || !flight || e.button !== 0) return; aimPointer = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (aimPointer) { aimPointer.x = e.clientX; aimPointer.y = e.clientY; } });
for (const ev of ['pointerup', 'pointercancel']) cv.addEventListener(ev, () => { aimPointer = null; if (flight) flight.aim = null; });
cv.addEventListener('wheel', (e) => {
  if (screen !== 'flight') return;
  e.preventDefault();
  const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
  if (view.map) view.mapZoom = Math.max(MAPZ[0], Math.min(MAPZ[1], view.mapZoom * f)); else view.zoom = Math.max(0.0005, Math.min(6, view.zoom * f));
}, { passive: false });

// keyboard
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  keys.add(e.code);
  if (overlayOpen('help') && (e.code === 'Escape' || e.code === 'Enter')) { overlay('help', false); e.preventDefault(); return; }
  if (screen === 'hangar') {
    if (e.code === 'Delete' || e.code === 'Backspace') { builder.removeSelected(); e.preventDefault(); }
    if (e.code === 'ArrowUp' && builder.sel >= 0) { builder.moveSel(-1); e.preventDefault(); }
    if (e.code === 'ArrowDown' && builder.sel >= 0) { builder.moveSel(1); e.preventDefault(); }
    return;
  }
  if (screen !== 'flight' || !flight) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') act.pause();
  if (paused || resultsShown) return;
  switch (e.code) {
    case 'Space': act.stage(); break;
    case 'KeyM': act.map(); break;
    case 'KeyP': act.chute(); break;
    case 'KeyG': act.legs(); break;
    case 'KeyF': act.fairing(); break;
    case 'KeyH': act.hold(); break;
    case 'Comma': act.warpDown(); break;
    case 'Period': act.warpUp(); break;
    case 'KeyZ': flight.throttle = 1; break;
    case 'KeyX': flight.throttle = 0; break;
    case 'Equal': case 'NumpadAdd': act.zoomIn(); break;
    case 'Minus': case 'NumpadSubtract': act.zoomOut(); break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); btnTurn = 0; });

function flightInput(dt) {
  const f = flight;
  if (keys.has('KeyW') || keys.has('ArrowUp') || keys.has('ShiftLeft')) f.throttle = Math.min(1, f.throttle + dt * 0.8);
  if (keys.has('KeyS') || keys.has('ArrowDown')) f.throttle = Math.max(0, f.throttle - dt * 0.8);
  let turn = btnTurn;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
  f.turn = Math.max(-1, Math.min(1, turn));
  if (aimPointer && !turn) {
    const dx = aimPointer.x - cw / 2, dy = aimPointer.y - ch / 2;
    if (Math.hypot(dx, dy) > 20) f.aim = Math.atan2(-dy, dx) - (f.camA || 0); else f.aim = null;
  } else f.aim = null;
}

// ---------- HUD
let hudT = 0;
const set = (id, v) => { const el = document.getElementById(id); if (el.textContent !== v) el.textContent = v; };
const ms = (v) => `${Math.round(v).toLocaleString()} m/s`;
function updateHud(dt) {
  hudT += dt; if (hudT < 0.08) return; hudT = 0;
  const h = flight.hud();
  set('h-body', h.body);
  set('h-alt', fmtKm(Math.max(0, h.alt)));
  set('h-spd', ms(h.speed));
  set('h-vs', `${h.vVert >= 0 ? '▲' : '▼'} ${ms(Math.abs(h.vVert))}`);
  set('h-hs', ms(h.vSide));
  set('h-cs', ms(h.cs));
  const frac = Math.min(1, h.vSide / h.cs);
  $('#h-obar').style.width = `${frac * 100}%`;
  set('h-olbl', `${Math.round((h.vSide / h.cs) * 100)}% of circle speed`);
  const grounded = flight.onGround;
  set('h-ap', grounded ? '–' : h.leaves ? `leaves ${h.body} SOI` : fmtKm(h.ap));
  set('h-pe', grounded ? '–' : h.pe < 0 ? 'underground' : fmtKm(h.pe));
  set('h-sdv', ms(h.stageDv)); set('h-tdv', ms(h.totalDv));
  set('h-twr', flight.activeInfo.engines ? h.twr.toFixed(2) : '–');
  set('h-g', `${h.g.toFixed(1)} g`);
  set('h-fuel', `${Math.round(h.fuelFrac * 100)}% · ${h.boosters ? `+${h.boosters} boosters` : `${h.sections} section${h.sections > 1 ? 's' : ''}`}`);
  set('h-srb', h.srb);
  $('#h-fbar').style.width = `${h.fuelFrac * 100}%`;
  const t = Math.floor(h.t); set('h-time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  if (document.activeElement !== thr) thr.value = Math.round(flight.throttle * 100);
  set('thr-lbl', `${Math.round(flight.throttle * 100)}%`);
  let gs;
  if (mission.id === 'free') gs = `Free flight · orbiting ${h.body}`;
  else if (missionDone && mission.id === 'moonland') gs = '<span class="ok">✓ Landed on Lumo!</span> Pause → End flight for results, or try flying home.';
  else if (missionDone) gs = '<span class="ok">✓ Mission complete!</span> Keep flying, or land softly for a bonus star.';
  else if (mission.id === 'flyby') gs = flight.encounter ? '<span class="ok">Encounter: Lumo</span> on your path. Warp ahead!' : `Orbiting ${h.body}. Map (M) shows SOIs.`;
  else if (mission.id === 'escape') gs = `Orbiting ${h.body}: Ap ${h.leaves ? '<span class="ok">leaves SOI</span>' : fmtKm(h.ap)} · SOI edge ${fmtKm(BODIES.numeria.soi - PLANET.R)}`;
  else if (mission.id === 'moonland' || mission.id === 'moonback') gs = flight.stats.landedLumo ? '✓ Landed on Lumo. Now fly home and land!' : `Orbiting ${h.body}${flight.encounter ? ' · <span class="ok">Encounter: Lumo</span>' : ''}${flight.legs ? flight.legsDown ? ' · legs down' : ' · legs up (G)' : ''}`;
  else gs = mission.id === 'orbit' || mission.id === 'heavy' ? `Low point: ${grounded ? '–' : h.pe < 0 ? 'underground' : fmtKm(h.pe)} → need 30 km` : `Best height: ${fmtKm(flight.stats.maxAlt)}`;
  const el = $('#h-goalstate'); if (el.innerHTML !== gs) el.innerHTML = gs;
  if ($('#b-warp').textContent.indexOf('×' + h.warp) !== 0) syncButtons();
}

// ---------- results
function showResults() {
  if (resultsShown || !flight) return;
  resultsShown = true;
  $('#toasts').innerHTML = '';
  const s = flight.stats, m = mission;
  const got = m.stars.map(([label, test]) => [label, !!test(s, launchCost)]);
  const goal = m.check(s);
  const n = goal ? got.filter((g) => g[1]).length : 0;
  if (goal) { const best = store.get('stars', {}); if ((best[m.id] || 0) < n) { best[m.id] = n; store.set('stars', best); } }
  let title = flight.state === 'crashed' ? 'Crunch!' : flight.state === 'landed' ? (flight.stats.splash ? 'Splashdown!' : 'Touchdown!') : 'Flight over';
  if (goal) title = 'Mission complete! ' + (flight.state === 'crashed' ? '(rough ending)' : '');
  const dlg = $('#ov-results .dlg');
  dlg.innerHTML = `<h2></h2><p class="why"></p>
    ${m.stars.length ? `<div class="stars">${got.map((g) => (goal && g[1] ? '★' : '<span class="off">★</span>')).join('')}</div>
    <ul class="starlist">${got.map((g) => `<li class="${goal && g[1] ? 'ok' : 'no'}">${g[0]}</li>`).join('')}</ul>` : ''}
    <div class="res-stats">
      <span>Highest point</span><b>${fmtKm(s.maxAlt)}</b>
      <span>Top speed</span><b>${ms(s.maxSpeed)}</b>
      <span>Δv used</span><b>${ms(s.dvUsed)}</b>
      <span>Max g-force</span><b>${s.maxG.toFixed(1)} g</b>
      <span>Rocket cost</span><b>${n0(launchCost)} cr</b>
      <span>Orbit reached</span><b>${s.orbit ? 'Yes!' : 'Not yet'}</b>
      <span>Visited</span><b>${['numeria', 'lumo', 'ember'].filter((k) => s.soi[k]).map((k) => BODIES[k].name).join(', ')}${s.landedLumo ? ' (landed on Lumo)' : ''}</b>
    </div>
    <div class="row-btns"><button class="big primary" data-r="again">Fly again</button><button class="big" data-r="hangar">Change rocket</button><button class="big" data-r="missions">Missions</button></div>`;
  dlg.querySelector('h2').textContent = title;
  dlg.querySelector('.why').textContent = (flight.endReason || 'You ended the flight.') + (goal ? '' : m.id !== 'free' ? ` Goal: ${m.goal}` : '');
  overlay('results', true);
}
$('#ov-results').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const r = b.dataset.r; overlay('results', false);
  if (r === 'again') startFlight();
  if (r === 'hangar') { flight = null; show('hangar'); }
  if (r === 'missions') { flight = null; show('missions'); }
});

// ---------- title background
const titleRocket = [{ type: 'capsule' }, { type: 'tankM' }, { type: 'engV' }];
function drawTitle(t) {
  const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#050818'); g.addColorStop(1, '#16205a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  drawStars(ctx, cw, ch, t * 0.01, 0.85);
  const R = Math.max(cw, ch) * 1.1, px = cw / 2, py = ch + R * 0.78;
  ctx.beginPath(); ctx.arc(px, py, R + 26, 0, TAU); ctx.fillStyle = 'rgba(110,180,255,0.15)'; ctx.fill();
  ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fillStyle = '#2f78c4'; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.clip(); ctx.fillStyle = '#4f9d5b';
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + Math.sin(i * 2.1 + t * 0.02) * 0.6 + (i - 3) * 0.12; ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * R, py + Math.sin(a) * R, R * 0.12, R * 0.05, a, 0, TAU); ctx.fill(); }
  ctx.restore();
  // little rocket orbiting
  const oa = -Math.PI / 2 + Math.sin(t * 0.25) * 0.55, orr = R + ch * 0.17;
  const rx = px + Math.cos(oa) * orr, ry = py + Math.sin(oa) * orr;
  ctx.save(); ctx.translate(rx, ry); ctx.rotate(oa + Math.PI / 2 + (Math.cos(t * 0.25) > 0 ? Math.PI / 2 : -Math.PI / 2)); ctx.scale(9, 9);
  drawStack(ctx, titleRocket, { lw: 0.15, flame: 0.7, vac: true, t });
  ctx.restore();
}

// ---------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (screen === 'flight' && flight) {
    if (!paused && !resultsShown) {
      flightInput(dt);
      flight.update(dt);
      for (const ev of flight.events.splice(0)) toast(ev.msg, ev.kind);
      if (!missionDone && mission.check(flight.stats)) { missionDone = true; toast(`★ Mission complete: ${mission.name}!`, 'good'); }
      if (flight.state !== 'flying') { endTimer += dt; if (endTimer > 2.2) showResults(); }
    }
    flight.render(ctx, cw, ch, view);
    updateHud(dt);
  } else if (screen === 'hangar') {
    ctx.fillStyle = '#0b1236'; ctx.fillRect(0, 0, cw, ch);
    builder.render(ctx, t);
  } else drawTitle(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- offline support
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
// test hook for automated screenshots
window.__fcgm = {
  get flight() { return flight; }, builder, view, MISSIONS, BODIES, openHangar, launch, show, EX_MOON, EX_HEAVY, VERSION, syncButtons,
  teleport(o) { if (flight) { flight.debugPlace(o); syncButtons(); } },
  setWarp(i) { if (flight) { flight.warpIdx = i; syncButtons(); } },
  get missionDone() { return missionDone; }, showResults: () => showResults(), pause: (p) => { paused = p; },
};
