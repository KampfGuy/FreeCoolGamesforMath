// Part catalog + original vector drawings (all simple canvas shapes).
export const G0 = 9.81;
export const W = 1.25; // standard part width in meters
export const TAU = Math.PI * 2;

// mass & fuel in tonnes, thrust in kN, Isp in seconds, height in meters, cost in credits
export const PARTS = {
  capsule: { name: 'Pilot Capsule', cat: 'Command', command: true, mass: 0.8, cost: 300, h: 1.6, blurb: 'Your pilot bot rides here. Goes on top.' },
  probe: { name: 'Probe Core', cat: 'Command', command: true, mass: 0.1, cost: 150, h: 0.6, blurb: 'Robot brain, no pilot. Light (0.1 t) and cheap. Use it instead of a capsule; fits under a fairing.' },
  chute: { name: 'Parachute', cat: 'Command', mass: 0.1, cost: 100, h: 0.45, blurb: 'Opens in the air below 300 m/s.' },
  tankS: { name: 'Small Tank', cat: 'Fuel', mass: 0.125, fuel: 0.9, cost: 90, h: 1.1, blurb: '0.9 t fuel · 0.125 t empty' },
  tankM: { name: 'Medium Tank', cat: 'Fuel', mass: 0.25, fuel: 2, cost: 170, h: 2.2, blurb: '2 t fuel · 0.25 t empty' },
  tankL: { name: 'Large Tank', cat: 'Fuel', mass: 0.5, fuel: 4, cost: 300, h: 4.2, blurb: '4 t fuel · 0.5 t empty' },
  engS: { name: 'Hopper Engine', cat: 'Engines', mass: 0.5, thrust: 65, ispAtm: 255, ispVac: 290, cost: 200, h: 1.2, blurb: 'Push 65 kN · Isp 255–290 s' },
  engB: { name: 'Big Booster', cat: 'Engines', mass: 1.5, thrust: 240, ispAtm: 250, ispVac: 280, cost: 480, h: 1.7, blurb: 'Push 240 kN · Isp 250–280 s' },
  engV: { name: 'Space Engine', cat: 'Engines', mass: 0.4, thrust: 55, ispAtm: 160, ispVac: 345, cost: 360, h: 1.5, blurb: 'Push 55 kN · best in space, Isp 345 s' },
  srbS: { name: 'Small Solid Booster', cat: 'Solids', srb: true, mass: 0.35, sfuel: 1.6, thrust: 150, ispAtm: 200, ispVac: 230, cost: 130, h: 2.6, blurb: 'Fuel built in (1.6 t). Push 150 kN · Isp 200–230 s. Once lit it burns at full power until empty: no throttle, no off switch!' },
  srbL: { name: 'Large Solid Booster', cat: 'Solids', srb: true, mass: 0.8, sfuel: 4.5, thrust: 360, ispAtm: 200, ispVac: 230, cost: 260, h: 4.4, blurb: 'Fuel built in (4.5 t). Push 360 kN · Isp 200–230 s. Cheap, strong, short burn. Cannot be throttled.' },
  noseS: { name: 'Small Nose Cone', cat: 'Aero', nose: 0.8, mass: 0.03, cost: 30, h: 0.7, blurb: 'Optional. On top of the rocket or a side booster: cuts air drag by 20%.' },
  noseL: { name: 'Large Nose Cone', cat: 'Aero', nose: 0.7, mass: 0.06, cost: 50, h: 1.2, blurb: 'Optional. Longer and pointier: cuts air drag by 30% on top.' },
  fairing: { name: 'Fairing', cat: 'Aero', mass: 0.05, cost: 60, h: 0.3, blurb: 'Put it UNDER your payload: a shell covers everything above it. Cuts drag a lot. Press F to split it off. Pick a shape and length when selected.' },
  dec: { name: 'Stage Separator', cat: 'Structure', mass: 0.05, cost: 50, h: 0.35, blurb: 'STAGE drops everything below it.' },
  fins: { name: 'Fins (pair)', cat: 'Structure', radial: true, mass: 0.06, cost: 40, blurb: 'Attach to a part. Keeps you pointed forward in air.' },
  legs: { name: 'Landing Legs', cat: 'Structure', radial: true, mass: 0.05, cost: 60, blurb: 'Attach to the bottom part. Press G to deploy: safe landing up to 12 m/s and 15° tilt.' },
  radDec: { name: 'Side Boosters', cat: 'Structure', radial: true, mass: 0.08, cost: 80, blurb: 'Radial decouplers: attach a PAIR of side boosters to a core part. They fire with Stage 1; the next STAGE drops them. Pick the booster parts when selected.' },
  payDec: { name: 'Payload Separator', cat: 'Structure', mass: 0.04, cost: 70, h: 0.25, blurb: 'Put it UNDER a payload (satellite or lander). Press R (Release) in flight: everything above it flies off as its own craft.' },
  antenna: { name: 'Antenna', cat: 'Satellite', antenna: true, mass: 0.02, cost: 60, h: 0.55, blurb: 'Talks to home. Goes on top of a probe core or capsule. Probe + antenna + solar panels = a Satellite.' },
  battery: { name: 'Battery Pack', cat: 'Satellite', battery: true, mass: 0.08, cost: 70, h: 0.4, blurb: 'Stores power. A good spot to attach solar panels.' },
  solar: { name: 'Solar Panels (pair)', cat: 'Satellite', radial: true, mass: 0.04, cost: 80, blurb: 'Attach to a battery or tank. Makes power from Ember\'s light: your craft shows ⚡ powered.' },
  struts: { name: 'Struts (pair)', cat: 'Structure', radial: true, mass: 0.02, cost: 25, blurb: 'Attach to a part. Each pair stiffens 4 more parts.' },
};
export const PART_ORDER = ['capsule', 'probe', 'chute', 'tankS', 'tankM', 'tankL', 'engS', 'engB', 'engV', 'srbS', 'srbL', 'noseS', 'noseL', 'fairing', 'dec', 'payDec', 'radDec', 'fins', 'struts', 'legs', 'antenna', 'battery', 'solar'];
export const isEngine = (t) => !!PARTS[t].thrust;
export const isRadialTarget = (t) => !PARTS[t].command && !PARTS[t].nose && !PARTS[t].antenna && t !== 'chute' && t !== 'fairing';
// radial part type -> key stored on the stack part
export const radialKey = (t) => (t === 'radDec' ? 'side' : t);

// Fairing shapes: cd = drag multiplier while the fairing is closed (lower = slicker).
export const FAIR_SHAPES = {
  ogive: { name: 'Ogive', cd: 0.55, tip: 'Pointy curved' },
  cone: { name: 'Cone', cd: 0.62, tip: 'Straight cone' },
  blunt: { name: 'Bullet', cd: 0.75, tip: 'Round blunt top' },
  bulb: { name: 'Bulbous', cd: 0.85, tip: 'Wider than the rocket, for fat payloads (more drag)' },
};
export const FAIR_LEN = { 1: { name: 'Short', ext: 1.0 }, 2: { name: 'Medium', ext: 1.8 }, 3: { name: 'Tall', ext: 2.8 } };
// shell mass/cost grow with the length setting
export const fairShellMass = (len) => 0.08 * (len || 2);
export const fairShellCost = (len) => 30 * (len || 2);
// Side boosters: one side = optional nose + body (SRB or tank) + engine (tanks only). Built as a pair.
export const SIDE_BODIES = ['srbS', 'srbL', 'tankS', 'tankM', 'tankL'];
export const SIDE_ENGINES = ['', 'engS', 'engB', 'engV'];
export const SIDE_NOSES = ['', 'noseS', 'noseL'];
export const DEFAULT_SIDE = { nose: 'noseS', body: 'srbS', eng: '' };
export function boosterParts(side) {
  const out = [];
  if (side.nose) out.push({ type: side.nose });
  out.push({ type: side.body });
  if (side.eng && !PARTS[side.body].srb) out.push({ type: side.eng });
  return out;
}
export const SIDE_DX = W + 0.12; // booster center offset from the core center
export const stackHeight = (parts) => parts.reduce((a, p) => a + PARTS[p.type].h, 0);

export const COL = {
  line: '#1b2140', white: '#f4f1ea', shade: '#d6cfbf', orange: '#ff8a3d', teal: '#36c5b8', tealDark: '#1d8f85',
  glass: '#c4ecff', dark: '#30364d', yellow: '#ffd23f', red: '#ef476f', steel: '#aab3c8',
};
const BELL = { engS: 0.95, engB: 1.25, engV: 1.15, srbS: 0.62, srbL: 0.78 };

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function tankBody(ctx, h, lw) {
  const hw = W / 2;
  rrect(ctx, -hw, 0, W, h, 0.14);
  ctx.fillStyle = COL.white; ctx.fill();
  ctx.fillStyle = COL.shade; ctx.fillRect(hw - 0.32, 0.06, 0.22, h - 0.12);
  ctx.fillStyle = COL.orange; ctx.fillRect(-hw, 0.1, W, 0.13); ctx.fillRect(-hw, h - 0.23, W, 0.13);
  rrect(ctx, -hw, 0, W, h, 0.14);
  ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
}

function engine(ctx, h, mountW, topW, botW, body, lw) {
  const mh = 0.3;
  ctx.lineWidth = lw; ctx.strokeStyle = COL.line;
  ctx.beginPath(); ctx.moveTo(-topW / 2, mh); ctx.lineTo(topW / 2, mh); ctx.lineTo(botW / 2, h); ctx.lineTo(-botW / 2, h); ctx.closePath();
  ctx.fillStyle = body; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(-topW / 2 + 0.06, mh); ctx.lineTo(-topW / 2 + 0.16, mh); ctx.lineTo(-botW / 2 + 0.22, h - 0.1); ctx.lineTo(-botW / 2 + 0.1, h - 0.1); ctx.fill();
  ctx.fillStyle = COL.orange; ctx.fillRect(-botW / 2 + 0.03, h - 0.12, botW - 0.06, 0.09);
  rrect(ctx, -mountW / 2, 0, mountW, mh, 0.06); ctx.fillStyle = COL.dark; ctx.fill(); ctx.stroke();
}

// Draws a part with its top-center at (0,0), y pointing down, units = meters.
export function drawPart(ctx, type, lw) {
  const P = PARTS[type]; const h = P.h; const hw = W / 2;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (type) {
    case 'capsule': {
      ctx.beginPath(); ctx.moveTo(-hw, h - 0.16); ctx.lineTo(-0.3, 0.12); ctx.quadraticCurveTo(0, -0.06, 0.3, 0.12); ctx.lineTo(hw, h - 0.16); ctx.closePath();
      ctx.fillStyle = COL.teal; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hw - 0.04, h - 0.16); ctx.lineTo(0.28, 0.14); ctx.lineTo(0.14, 0.16); ctx.lineTo(hw - 0.34, h - 0.16); ctx.closePath();
      ctx.fillStyle = COL.tealDark; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-hw, h - 0.16); ctx.lineTo(-0.3, 0.12); ctx.quadraticCurveTo(0, -0.06, 0.3, 0.12); ctx.lineTo(hw, h - 0.16); ctx.closePath();
      ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      rrect(ctx, -hw - 0.03, h - 0.18, W + 0.06, 0.18, 0.06); ctx.fillStyle = '#8a5a33'; ctx.fill(); ctx.stroke();
      const wy = h * 0.56;
      ctx.beginPath(); ctx.arc(0, wy, 0.26, 0, TAU); ctx.fillStyle = COL.glass; ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.line;
      ctx.beginPath(); ctx.arc(-0.09, wy - 0.04, 0.036, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0.09, wy - 0.04, 0.036, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, wy + 0.0, 0.1, 0.18 * Math.PI, 0.82 * Math.PI); ctx.lineWidth = Math.max(lw, 0.03); ctx.stroke();
      break;
    }
    case 'chute': {
      rrect(ctx, -0.36, 0, 0.72, h, 0.16); ctx.fillStyle = COL.red; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-0.07, 0.03, 0.14, h - 0.06);
      rrect(ctx, -0.36, 0, 0.72, h, 0.16); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
    case 'tankS': case 'tankM': case 'tankL': tankBody(ctx, h, lw); break;
    case 'engS': engine(ctx, h, 0.95, 0.45, BELL.engS, '#5a6178', lw); break;
    case 'engB': engine(ctx, h, 1.25, 0.75, BELL.engB, '#8c3b4a', lw); break;
    case 'engV': engine(ctx, h, 0.8, 0.32, BELL.engV, '#6f8fb3', lw); break;
    case 'srbS': case 'srbL': {
      const bw = type === 'srbS' ? W * 0.86 : W, h2 = bw / 2, nz = 0.5, bh = h - nz;
      // nozzle
      ctx.beginPath(); ctx.moveTo(-BELL[type] * 0.32, bh - 0.02); ctx.lineTo(BELL[type] * 0.32, bh - 0.02); ctx.lineTo(BELL[type] / 2, h); ctx.lineTo(-BELL[type] / 2, h); ctx.closePath();
      ctx.fillStyle = '#3b4152'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      // segmented body
      rrect(ctx, -h2, 0, bw, bh, 0.12); ctx.fillStyle = '#eef0f4'; ctx.fill();
      ctx.save(); rrect(ctx, -h2, 0, bw, bh, 0.12); ctx.clip();
      const seg = (bh - 0.3) / Math.max(2, Math.round((bh - 0.3) / 0.75));
      for (let y = 0.3, k = 0; y < bh - 0.05; y += seg, k++) if (k % 2) { ctx.fillStyle = '#c9ced9'; ctx.fillRect(-h2, y, bw, seg); }
      ctx.fillStyle = 'rgba(40,50,80,0.18)'; ctx.fillRect(h2 - 0.28, 0, 0.2, bh);
      ctx.fillStyle = '#5a6178'; ctx.fillRect(-h2, 0, bw, 0.3); ctx.fillRect(-h2, bh - 0.14, bw, 0.14);
      ctx.strokeStyle = 'rgba(27,33,64,0.55)'; ctx.lineWidth = lw * 0.8; ctx.beginPath();
      for (let y = 0.3; y < bh - 0.1; y += seg) { ctx.moveTo(-h2, y); ctx.lineTo(h2, y); }
      ctx.stroke(); ctx.restore();
      rrect(ctx, -h2, 0, bw, bh, 0.12); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
    case 'noseS': case 'noseL': {
      const path = () => { ctx.beginPath(); ctx.moveTo(-hw, h); ctx.bezierCurveTo(-hw, h * 0.45, -0.18, 0.05, 0, 0); ctx.bezierCurveTo(0.18, 0.05, hw, h * 0.45, hw, h); ctx.closePath(); };
      path(); ctx.fillStyle = COL.white; ctx.fill();
      ctx.save(); path(); ctx.clip();
      ctx.fillStyle = COL.red; ctx.fillRect(-hw, 0, W, h * 0.28);
      ctx.fillStyle = COL.shade; ctx.fillRect(hw * 0.35, h * 0.28, hw, h);
      ctx.restore();
      path(); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
    case 'probe': {
      ctx.beginPath(); ctx.moveTo(-hw, h); ctx.lineTo(-hw + 0.14, 0.14); ctx.lineTo(hw - 0.14, 0.14); ctx.lineTo(hw, h); ctx.closePath();
      ctx.fillStyle = '#d9a441'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      ctx.fillStyle = COL.dark; ctx.fillRect(-hw + 0.1, 0.3, W - 0.2, 0.14);
      ctx.beginPath(); ctx.arc(0.3, 0.37, 0.05, 0, TAU); ctx.fillStyle = '#5dffb0'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.15, 0.14); ctx.lineTo(-0.15, -0.28); ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(lw, 0.04); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.15, -0.3, 0.06, 0, TAU); ctx.fillStyle = COL.red; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.22, 0.06, 0.2, 0.08, -0.3, 0, TAU); ctx.fillStyle = COL.steel; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
      break;
    }
    case 'fairing': {
      rrect(ctx, -hw - 0.08, 0, W + 0.16, h, 0.06); ctx.fillStyle = COL.dark; ctx.fill();
      ctx.fillStyle = COL.teal; ctx.fillRect(-hw - 0.08, h * 0.35, W + 0.16, h * 0.3);
      rrect(ctx, -hw - 0.08, 0, W + 0.16, h, 0.06); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
    case 'payDec': {
      rrect(ctx, -hw + 0.06, 0, W - 0.12, h, 0.05); ctx.fillStyle = COL.teal; ctx.fill();
      ctx.fillStyle = COL.white; for (let x = -hw + 0.2; x < hw - 0.1; x += 0.28) ctx.fillRect(x, h * 0.3, 0.12, h * 0.4);
      rrect(ctx, -hw + 0.06, 0, W - 0.12, h, 0.05); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
    case 'antenna': {
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, 0.12); ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(lw, 0.05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.32, 0.22); ctx.quadraticCurveTo(0, 0.42, 0.32, 0.22); ctx.lineTo(0, 0.3); ctx.closePath(); ctx.fillStyle = COL.white; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0.08, 0.07, 0, TAU); ctx.fillStyle = COL.red; ctx.fill();
      rrect(ctx, -0.22, h - 0.12, 0.44, 0.12, 0.03); ctx.fillStyle = COL.dark; ctx.fill(); ctx.stroke();
      break;
    }
    case 'battery': {
      rrect(ctx, -hw, 0, W, h, 0.06); ctx.fillStyle = '#4a5578'; ctx.fill();
      ctx.fillStyle = COL.yellow; ctx.fillRect(-0.3, h * 0.3, 0.6, h * 0.4); ctx.fillStyle = COL.line; ctx.fillRect(-0.04, h * 0.32, 0.08, h * 0.36); ctx.fillRect(0.1, h * 0.45, 0.12, h * 0.1);
      rrect(ctx, -hw, 0, W, h, 0.06); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
    case 'dec': {
      ctx.save(); ctx.beginPath(); ctx.rect(-hw, 0, W, h); ctx.clip();
      ctx.fillStyle = COL.yellow; ctx.fillRect(-hw, 0, W, h);
      ctx.fillStyle = COL.line;
      for (let x = -hw - 0.5; x < hw + 0.5; x += 0.3) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 0.12, h); ctx.lineTo(x + 0.12 + h, 0); ctx.lineTo(x + h, 0); ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); ctx.rect(-hw, 0, W, h); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
      break;
    }
  }
}

export function drawFins(ctx, h, lw) {
  const hw = W / 2, fh = Math.min(1.1, h * 0.95);
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * hw, h - fh); ctx.lineTo(s * (hw + 0.62), h - 0.12); ctx.lineTo(s * (hw + 0.62), h + 0.28); ctx.lineTo(s * hw, h - 0.02); ctx.closePath();
    ctx.fillStyle = COL.orange; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
  }
}

export function drawStruts(ctx, h, lw) {
  const hw = W / 2;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.14);
    ctx.beginPath(); ctx.moveTo(x, -0.45); ctx.lineTo(x, h + 0.45);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.14 + lw * 2; ctx.stroke();
    ctx.strokeStyle = COL.steel; ctx.lineWidth = 0.12; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, -0.3); ctx.lineTo(s * hw, -0.3); ctx.moveTo(x, h + 0.3); ctx.lineTo(s * hw, h + 0.3);
    ctx.strokeStyle = COL.steel; ctx.lineWidth = 0.08; ctx.stroke();
  }
}

// Fairing shell outline (right half, from base up to the tip). Base at y=0, up = negative y.
export function fairingProfile(shape, cover, len) {
  const r = W / 2 + 0.1, ext = FAIR_LEN[len || 2].ext, top = cover + ext, pts = [[r, 0]];
  const N = 16;
  if (shape === 'cone') { pts.push([r, -cover], [0, -top]); return pts; }
  if (shape === 'blunt') {
    const c0 = cover + ext * 0.3; pts.push([r, -c0]);
    for (let i = 1; i <= N; i++) { const a = (i / N) * Math.PI / 2; pts.push([r * Math.cos(a), -c0 - (top - c0) * Math.sin(a)]); }
    return pts;
  }
  let rr = r;
  if (shape === 'bulb') { rr = W / 2 + 0.5; pts.push([r, -0.15], [rr, -0.75], [rr, -Math.max(0.8, cover)]); }
  else pts.push([r, -cover]);
  const y0 = shape === 'bulb' ? Math.max(0.8, cover) : cover, e2 = top - y0 + (shape === 'bulb' ? 0.4 : 0);
  for (let i = 1; i <= N; i++) { const t = i / N; pts.push([rr * (1 - t) * (1 + 0.8 * t), -y0 - e2 * t]); }
  return pts;
}
export const fairingTop = (shape, cover, len) => -Math.min(...fairingProfile(shape, cover, len).map((p) => p[1]));
// half: 0 = whole shell, -1 = left half, 1 = right half
export function drawFairingShell(ctx, shape, cover, len, lw, half = 0, alpha = 1) {
  const pr = fairingProfile(shape, cover, len);
  const path = (sgn) => { ctx.beginPath(); ctx.moveTo(0, 0); for (const [x, y] of pr) ctx.lineTo(sgn * x, y); ctx.closePath(); };
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineJoin = 'round';
  for (const sgn of half ? [half] : [-1, 1]) {
    path(sgn); ctx.fillStyle = sgn > 0 ? '#dcd6c8' : COL.white; ctx.fill();
    ctx.save(); path(sgn); ctx.clip();
    ctx.fillStyle = COL.teal; ctx.fillRect(-3, -0.55, 6, 0.3);
    ctx.fillStyle = COL.orange; ctx.fillRect(-3, -fairingTop(shape, cover, len) * 0.62, 6, 0.12);
    ctx.restore();
  }
  ctx.beginPath(); ctx.moveTo(pr[0][0] * (half || 1), 0);
  if (half) { for (const [x, y] of pr) ctx.lineTo(half * x, y); ctx.lineTo(0, 0); ctx.closePath(); }
  else { for (const [x, y] of pr) ctx.lineTo(x, y); for (let i = pr.length - 1; i >= 0; i--) ctx.lineTo(-pr[i][0], pr[i][1]); ctx.closePath(); }
  ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
  if (!half) { ctx.beginPath(); ctx.moveTo(0, -0.05); ctx.lineTo(0, -fairingTop(shape, cover, len) + 0.1); ctx.setLineDash([lw * 4, lw * 3]); ctx.strokeStyle = 'rgba(27,33,64,0.5)'; ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
// Solar panel wings on each side of a part of height h.
export function drawSolar(ctx, h, lw) {
  const hw = W / 2, ph = Math.max(0.5, Math.min(1.4, h * 1.4)), pw = 1.5, y0 = h / 2 - ph / 2;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * hw, h / 2); ctx.lineTo(s * (hw + 0.25), h / 2); ctx.strokeStyle = COL.steel; ctx.lineWidth = 0.08; ctx.stroke();
    const x0 = s > 0 ? hw + 0.25 : -hw - 0.25 - pw;
    rrect(ctx, x0, y0, pw, ph, 0.04); ctx.fillStyle = '#2a4fa8'; ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,255,0.7)'; ctx.lineWidth = lw * 0.7; ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(x0 + (pw * k) / 4, y0); ctx.lineTo(x0 + (pw * k) / 4, y0 + ph); }
    ctx.moveTo(x0, y0 + ph / 2); ctx.lineTo(x0 + pw, y0 + ph / 2); ctx.stroke();
    rrect(ctx, x0, y0, pw, ph, 0.04); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
  }
}
// Radial decoupler bracket on each side of a core part of height h.
export function drawRadDec(ctx, h, lw) {
  const hw = W / 2;
  for (const s of [-1, 1]) for (const y of [h * 0.2, h * 0.7]) {
    ctx.beginPath(); ctx.rect(s > 0 ? hw - 0.04 : -hw - 0.16 + 0.04, y - 0.12, 0.16, 0.24); ctx.fillStyle = COL.yellow; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
  }
}
// Pair of side boosters with their bottoms level with the bottom of a core part of height h.
export function drawSideBoosters(ctx, side, h, lw, o = {}) {
  const bp = boosterParts(side);
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * SIDE_DX, h);
    drawStack(ctx, bp, { lw, flame: o.flame || 0, vac: o.vac, t: (o.t || 0) + s });
    ctx.restore();
  }
  drawRadDec(ctx, h, lw);
}

// Folding landing legs: hinge near the part's bottom; f = 0 folded up along the side, 1 = deployed.
export const LEG_L = 1.2, LEG_DROP = 0.6; // deployed feet reach LEG_DROP m below the part bottom
export function drawLegs(ctx, h, lw, f = 1) {
  const hw = W / 2, hy = h - 0.1;
  const thD = Math.acos((LEG_DROP + 0.1) / LEG_L), th = Math.PI - 0.08 + (thD - (Math.PI - 0.08)) * f;
  for (const s of [-1, 1]) {
    const hx = s * (hw + 0.06);
    const fx = hx + s * Math.sin(th) * LEG_L, fy = hy + Math.cos(th) * LEG_L;
    const mx = hx + s * Math.sin(th) * LEG_L * 0.55, my = hy + Math.cos(th) * LEG_L * 0.55;
    ctx.lineCap = 'round';
    // brace from higher up on the body to the leg's middle
    ctx.beginPath(); ctx.moveTo(s * hw, hy - 0.55); ctx.lineTo(mx, my);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.1 + lw * 2; ctx.stroke(); ctx.strokeStyle = COL.steel; ctx.lineWidth = 0.08; ctx.stroke();
    // main leg
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.18 + lw * 2; ctx.stroke(); ctx.strokeStyle = COL.yellow; ctx.lineWidth = 0.16; ctx.stroke();
    // hinge + foot pad
    ctx.beginPath(); ctx.arc(hx, hy, 0.1, 0, TAU); ctx.fillStyle = COL.dark; ctx.fill();
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(-s * (th - thD) * 0.5);
    rrect(ctx, -0.22, -0.04, 0.44, 0.1, 0.04); ctx.fillStyle = COL.dark; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = COL.line; ctx.stroke();
    ctx.restore();
  }
}
// How far (m) deployed feet stick out below the stack bottom (0 if legs are not low enough).
export function legFootDrop(parts) {
  let below = 0;
  for (let i = parts.length - 1; i >= 0; i--) { if (parts[i].legs) return Math.max(0, LEG_DROP - below); below += PARTS[parts[i].type].h; }
  return 0;
}

function drawCanopy(ctx, f, lw) {
  const cw = 3.2 * f + 0.4, top = -(1.2 + 3.6 * f);
  ctx.strokeStyle = 'rgba(30,30,50,0.75)'; ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(-cw, top + 0.2); ctx.lineTo(0, 0.05); ctx.lineTo(cw, top + 0.2);
  ctx.moveTo(-cw * 0.4, top); ctx.lineTo(0, 0.05); ctx.lineTo(cw * 0.4, top);
  ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, top + 0.2, cw, cw * 0.55, 0, Math.PI, TAU); ctx.closePath();
  ctx.fillStyle = COL.red; ctx.fill(); ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-cw * 0.42, top - cw, cw * 0.22, cw * 2); ctx.fillRect(cw * 0.2, top - cw, cw * 0.22, cw * 2);
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, top + 0.2, cw, cw * 0.55, 0, Math.PI, TAU); ctx.closePath();
  ctx.strokeStyle = COL.line; ctx.lineWidth = lw; ctx.stroke();
}

export function drawFlame(ctx, type, thr, vac, t) {
  const P = PARTS[type]; const bw = BELL[type] || 1;
  const big = P.thrust > 100 ? 1.5 : 1;
  const len = (1.0 + 3.2 * thr) * big * (vac ? 1.5 : 1) * (0.9 + 0.1 * Math.sin(t * 47) + 0.05 * Math.sin(t * 91));
  const wid = bw * 0.5 * (vac ? 1.35 : 1) * (0.6 + 0.4 * thr);
  const g = ctx.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, 'rgba(255,255,230,0.95)'); g.addColorStop(0.35, 'rgba(255,210,63,0.9)'); g.addColorStop(1, 'rgba(255,110,40,0)');
  ctx.beginPath(); ctx.moveTo(-wid, -0.05); ctx.quadraticCurveTo(-wid * 1.1, len * 0.45, 0, len); ctx.quadraticCurveTo(wid * 1.1, len * 0.45, wid, -0.05); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
}

// Draws a stack (top-first array) with its bottom-center at (0,0), growing up (negative y).
export function drawStack(ctx, parts, o = {}) {
  ctx.save();
  const lw = o.lw || 0.05;
  const last = parts[parts.length - 1];
  if (o.flame > 0 && last && isEngine(last.type)) drawFlame(ctx, last.type, o.flame, o.vac, o.t || 0);
  let fair = null, cover = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; const h = PARTS[p.type].h;
    ctx.translate(0, -h);
    if (p.type === 'fairing' && !p.jett && !fair) { cover = 0; for (let j = 0; j < i; j++) cover += PARTS[parts[j].type].h; fair = { p, m: ctx.getTransform ? ctx.getTransform() : null }; }
    if (p.side && !o.noSides) drawSideBoosters(ctx, p.side, h, lw, { flame: o.sideFlame, vac: o.vac, t: o.t });
    if (p.struts) drawStruts(ctx, h, lw);
    if (p.fins) drawFins(ctx, h, lw);
    if (p.legs) drawLegs(ctx, h, lw, o.legs == null ? 1 : o.legs);
    if (p.solar) drawSolar(ctx, h, lw);
    drawPart(ctx, p.type, lw);
    if (o.highlight === i) {
      rrect(ctx, -W / 2 - 0.2, -0.12, W + 0.4, h + 0.24, 0.18);
      ctx.strokeStyle = COL.yellow; ctx.lineWidth = lw * 3; ctx.setLineDash([lw * 6, lw * 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.target === i) {
      rrect(ctx, -W / 2 - 0.8, -0.12, W + 1.6, h + 0.24, 0.18);
      ctx.fillStyle = 'rgba(255,210,63,0.25)'; ctx.fill();
    }
    if (p.type === 'chute' && o.chute > 0) drawCanopy(ctx, o.chute, lw);
    if (o.bend) ctx.rotate(o.bend);
  }
  if (fair && fair.m) { ctx.setTransform(fair.m); drawFairingShell(ctx, fair.p.shape || 'ogive', cover, fair.p.len || 2, lw, 0, o.fairingAlpha || 1); }
  ctx.restore();
}

export function makeIcon(type, size = 52) {
  const c = document.createElement('canvas');
  const d = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px';
  const ctx = c.getContext('2d'); ctx.scale(d, d);
  const P = PARTS[type];
  if (type === 'radDec') { // icon: core + two little SRBs
    const s = (size - 6) / 5.2; ctx.translate(size / 2, size - 4); ctx.scale(s, s); const lw = 1.2 / s;
    for (const k of [-1, 1]) { ctx.save(); ctx.translate(k * SIDE_DX, 0); drawStack(ctx, [{ type: 'noseS' }, { type: 'srbS' }], { lw }); ctx.restore(); }
    ctx.globalAlpha = 0.45; ctx.translate(0, -2.6); tankBody(ctx, 2.6, lw); ctx.globalAlpha = 1; drawRadDec(ctx, 2.6, lw);
    return c;
  }
  if (type === 'fairing') {
    const s = (size - 6) / 4.4; ctx.translate(size / 2, size - 4); ctx.scale(s, s); const lw = 1.2 / s;
    ctx.translate(0, -0.3); drawPart(ctx, 'fairing', lw); drawFairingShell(ctx, 'ogive', 1.6, 2, lw);
    return c;
  }
  const h = P.radial ? 1.8 : P.h; const wTot = type === 'solar' ? W + 3.6 : P.radial ? W + 1.5 : W + 0.2;
  const s = Math.min((size - 8) / (h + 0.4), (size - 8) / wTot, 26);
  ctx.translate(size / 2, size / 2 - (h * s) / 2); ctx.scale(s, s);
  const lw = 1.2 / s;
  if (P.radial) {
    if (type === 'fins') drawFins(ctx, h, lw); else if (type === 'solar') drawSolar(ctx, h, lw); else if (type === 'legs') drawLegs(ctx, h, lw, 1); else drawStruts(ctx, h, lw);
    ctx.globalAlpha = 0.35; tankBody(ctx, h, lw); ctx.globalAlpha = 1;
  } else drawPart(ctx, type, lw);
  return c;
}
