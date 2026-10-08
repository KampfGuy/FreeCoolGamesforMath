// Part catalog + original vector drawings (all simple canvas shapes).
export const G0 = 9.81;
export const W = 1.25; // standard part width in meters
export const TAU = Math.PI * 2;

// mass & fuel in tonnes, thrust in kN, Isp in seconds, height in meters, cost in credits
export const PARTS = {
  capsule: { name: 'Pilot Capsule', cat: 'Command', mass: 0.8, cost: 300, h: 1.6, blurb: 'Your pilot bot rides here. Goes on top.' },
  chute: { name: 'Parachute', cat: 'Command', mass: 0.1, cost: 100, h: 0.45, blurb: 'Opens in the air below 300 m/s.' },
  tankS: { name: 'Small Tank', cat: 'Fuel', mass: 0.125, fuel: 0.9, cost: 90, h: 1.1, blurb: '0.9 t fuel · 0.125 t empty' },
  tankM: { name: 'Medium Tank', cat: 'Fuel', mass: 0.25, fuel: 2, cost: 170, h: 2.2, blurb: '2 t fuel · 0.25 t empty' },
  tankL: { name: 'Large Tank', cat: 'Fuel', mass: 0.5, fuel: 4, cost: 300, h: 4.2, blurb: '4 t fuel · 0.5 t empty' },
  engS: { name: 'Hopper Engine', cat: 'Engines', mass: 0.5, thrust: 65, ispAtm: 255, ispVac: 290, cost: 200, h: 1.2, blurb: 'Push 65 kN · Isp 255–290 s' },
  engB: { name: 'Big Booster', cat: 'Engines', mass: 1.5, thrust: 240, ispAtm: 250, ispVac: 280, cost: 480, h: 1.7, blurb: 'Push 240 kN · Isp 250–280 s' },
  engV: { name: 'Space Engine', cat: 'Engines', mass: 0.4, thrust: 55, ispAtm: 160, ispVac: 345, cost: 360, h: 1.5, blurb: 'Push 55 kN · best in space, Isp 345 s' },
  dec: { name: 'Stage Separator', cat: 'Structure', mass: 0.05, cost: 50, h: 0.35, blurb: 'STAGE drops everything below it.' },
  fins: { name: 'Fins (pair)', cat: 'Structure', radial: true, mass: 0.06, cost: 40, blurb: 'Attach to a part. Keeps you pointed forward in air.' },
  struts: { name: 'Struts (pair)', cat: 'Structure', radial: true, mass: 0.02, cost: 25, blurb: 'Attach to a part. Each pair stiffens 4 more parts.' },
};
export const PART_ORDER = ['capsule', 'chute', 'tankS', 'tankM', 'tankL', 'engS', 'engB', 'engV', 'dec', 'fins', 'struts'];
export const isEngine = (t) => !!PARTS[t].thrust;
export const isRadialTarget = (t) => t !== 'capsule' && t !== 'chute';
export const stackHeight = (parts) => parts.reduce((a, p) => a + PARTS[p.type].h, 0);

export const COL = {
  line: '#1b2140', white: '#f4f1ea', shade: '#d6cfbf', orange: '#ff8a3d', teal: '#36c5b8', tealDark: '#1d8f85',
  glass: '#c4ecff', dark: '#30364d', yellow: '#ffd23f', red: '#ef476f', steel: '#aab3c8',
};
const BELL = { engS: 0.95, engB: 1.25, engV: 1.15 };

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
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; const h = PARTS[p.type].h;
    ctx.translate(0, -h);
    if (p.struts) drawStruts(ctx, h, lw);
    if (p.fins) drawFins(ctx, h, lw);
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
  ctx.restore();
}

export function makeIcon(type, size = 52) {
  const c = document.createElement('canvas');
  const d = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px';
  const ctx = c.getContext('2d'); ctx.scale(d, d);
  const P = PARTS[type];
  const h = P.radial ? 1.8 : P.h; const wTot = P.radial ? W + 1.5 : W + 0.2;
  const s = Math.min((size - 8) / (h + 0.4), (size - 8) / wTot, 26);
  ctx.translate(size / 2, size / 2 - (h * s) / 2); ctx.scale(s, s);
  const lw = 1.2 / s;
  if (P.radial) {
    if (type === 'fins') drawFins(ctx, h, lw); else drawStruts(ctx, h, lw);
    ctx.globalAlpha = 0.35; tankBody(ctx, h, lw); ctx.globalAlpha = 1;
  } else drawPart(ctx, type, lw);
  return c;
}
