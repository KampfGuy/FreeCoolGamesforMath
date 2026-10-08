// Hangar: snap-build a rocket from parts (drag & drop or tap).
import { PARTS, PART_ORDER, W, drawStack, drawPart, drawFins, drawStruts, makeIcon, isRadialTarget, COL } from './parts.js';
import { splitSections } from './physics.js';

const MAX_PARTS = 16;

export class Builder {
  constructor({ paletteEl, viewEl, onChange, toast }) {
    this.stack = []; this.sel = -1; this.drag = null; this.layout = null;
    this.viewEl = viewEl; this.onChange = onChange; this.toast = toast;
    this.buildPalette(paletteEl);
    viewEl.addEventListener('pointerdown', (e) => this.viewDown(e));
  }
  setStack(stack) { this.stack = stack.map((p) => ({ ...p })); this.sel = -1; this.changed(); }
  changed() { this.onChange && this.onChange(); }

  buildPalette(el) {
    el.innerHTML = '';
    const cats = {};
    for (const t of PART_ORDER) (cats[PARTS[t].cat] = cats[PARTS[t].cat] || []).push(t);
    for (const [cat, list] of Object.entries(cats)) {
      const h = document.createElement('h3'); h.textContent = cat; el.append(h);
      const grid = document.createElement('div'); grid.className = 'pgrid';
      for (const t of list) {
        const P = PARTS[t];
        const b = document.createElement('button');
        b.className = 'part-btn'; b.dataset.type = t; b.title = `${P.name}: ${P.blurb}`;
        b.append(makeIcon(t, 40));
        const lab = document.createElement('span'); lab.className = 'pname'; lab.textContent = P.name;
        const sub = document.createElement('span'); sub.className = 'pcost'; sub.textContent = `${P.cost} cr`;
        b.append(lab, sub);
        b.addEventListener('pointerdown', (e) => this.paletteDown(e, t));
        b.addEventListener('click', (e) => { if (e.detail === 0) this.quickAdd(t); });
        grid.append(b);
      }
      el.append(grid);
    }
  }

  // --- pointer handling
  paletteDown(e, type) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.beginDrag(e, { type, from: -1 });
  }
  viewDown(e) {
    if (e.button !== 0 || e.target !== this.viewEl) return;
    const i = this.hitPart(e.clientX, e.clientY);
    this.sel = i;
    this.changed();
    if (i >= 0) this.beginDrag(e, { type: this.stack[i].type, from: i });
  }
  beginDrag(e, d) {
    const sx = e.clientX, sy = e.clientY;
    this.drag = { ...d, x: sx, y: sy, moving: false, over: null };
    const move = (ev) => {
      const dr = this.drag; if (!dr) return;
      dr.x = ev.clientX; dr.y = ev.clientY;
      if (!dr.moving && Math.hypot(dr.x - sx, dr.y - sy) > 8) dr.moving = true;
      if (dr.moving) dr.over = this.dropTarget(dr.x, dr.y, dr.type);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const dr = this.drag; this.drag = null;
      if (!dr) return;
      if (!dr.moving) { if (dr.from < 0) this.quickAdd(dr.type); return; }
      if (dr.from >= 0) {
        if (!dr.over) { this.removeAt(dr.from); this.toast('Part removed.'); return; }
        if (dr.over.kind === 'insert') this.moveTo(dr.from, dr.over.index);
        return;
      }
      if (dr.over) this.applyDrop(dr.type, dr.over);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  hitPart(x, y) {
    const L = this.layout; if (!L) return -1;
    for (const p of L.parts) if (y >= p.y0 && y <= p.y1 && Math.abs(x - L.cx) <= (W / 2 + 0.8) * L.s) return p.i;
    return -1;
  }
  dropTarget(x, y, type) {
    const r = this.viewEl.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    const L = this.layout; if (!L) return null;
    if (PARTS[type].radial) {
      let best = -1, bd = Infinity;
      for (const p of L.parts) {
        if (!isRadialTarget(this.stack[p.i].type)) continue;
        const d = y < p.y0 ? p.y0 - y : y > p.y1 ? y - p.y1 : 0;
        if (d < bd) { bd = d; best = p.i; }
      }
      return best >= 0 && bd < 80 ? { kind: 'radial', index: best } : null;
    }
    let best = 0, bd = Infinity;
    L.bounds.forEach((by, k) => { const d = Math.abs(by - y); if (d < bd) { bd = d; best = k; } });
    return { kind: 'insert', index: best };
  }

  // --- edits
  quickAdd(type) {
    const P = PARTS[type];
    if (P.radial) {
      let i = this.sel >= 0 && isRadialTarget(this.stack[this.sel].type) && !this.stack[this.sel][type] ? this.sel : -1;
      if (i < 0) for (let k = this.stack.length - 1; k >= 0; k--) if (isRadialTarget(this.stack[k].type) && !this.stack[k][type]) { i = k; break; }
      if (i < 0) { this.toast(this.stack.some((p) => isRadialTarget(p.type)) ? `Every part already has ${type}.` : 'Add a tank or engine first, then attach this.'); return; }
      this.applyDrop(type, { kind: 'radial', index: i });
      return;
    }
    let idx;
    if (type === 'capsule') idx = this.stack[0] && this.stack[0].type === 'chute' ? 1 : 0;
    else if (type === 'chute') idx = 0;
    else idx = this.sel >= 0 ? this.sel + 1 : this.stack.length;
    this.applyDrop(type, { kind: 'insert', index: idx });
  }
  applyDrop(type, over) {
    if (over.kind === 'radial') {
      const p = this.stack[over.index];
      if (!p || !isRadialTarget(p.type)) { this.toast('Fins and struts attach to tanks, engines or separators.'); return; }
      if (p[type]) { this.toast(`That part already has ${type}.`); return; }
      p[type] = 1; this.sel = over.index; this.changed();
      return;
    }
    if (this.stack.length >= MAX_PARTS) { this.toast(`Max ${MAX_PARTS} parts. Simpler rockets fly better!`); return; }
    this.stack.splice(over.index, 0, { type });
    this.sel = over.index; this.changed();
  }
  removeAt(i) { if (i < 0 || i >= this.stack.length) return; this.stack.splice(i, 1); this.sel = Math.min(this.sel, this.stack.length - 1); if (this.sel === i) this.sel = -1; this.changed(); }
  removeSelected() { if (this.sel >= 0) { this.removeAt(this.sel); } }
  moveTo(from, k) {
    if (k > from) k--;
    const [p] = this.stack.splice(from, 1); this.stack.splice(k, 0, p); this.sel = k; this.changed();
  }
  moveSel(d) { const i = this.sel, j = i + d; if (i < 0 || j < 0 || j >= this.stack.length) return; const s = this.stack;[s[i], s[j]] = [s[j], s[i]]; this.sel = j; this.changed(); }
  stripRadial(kind) { if (this.sel >= 0 && this.stack[this.sel][kind]) { delete this.stack[this.sel][kind]; this.changed(); } }

  // --- render the hangar into the shared canvas
  render(ctx, t) {
    const r = this.viewEl.getBoundingClientRect();
    const total = this.stack.reduce((a, p) => a + PARTS[p.type].h, 0);
    const s = Math.min((r.height - 150) / Math.max(total + 1, 9), 46);
    const cx = r.left + r.width / 2, by = r.bottom - 46;
    // backdrop: graph-paper hangar wall
    const g = ctx.createLinearGradient(0, r.top, 0, r.bottom);
    g.addColorStop(0, '#1a2350'); g.addColorStop(1, '#2a3566');
    ctx.fillStyle = g; ctx.fillRect(r.left, r.top, r.width, r.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let y = by; y > r.top; y -= s) { ctx.moveTo(r.left, Math.round(y) + 0.5); ctx.lineTo(r.right, Math.round(y) + 0.5); }
    for (let x = cx % s; x < r.right; x += s) { if (x < r.left) continue; ctx.moveTo(Math.round(x) + 0.5, r.top); ctx.lineTo(Math.round(x) + 0.5, by); }
    ctx.stroke();
    // floor
    ctx.fillStyle = '#3a4373'; ctx.fillRect(r.left, by, r.width, r.bottom - by);
    ctx.fillStyle = COL.yellow; ctx.fillRect(cx - 3.2 * s, by, 6.4 * s, 4);
    // height ruler
    const rx = r.left + 46;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.beginPath(); ctx.moveTo(rx, by); ctx.lineTo(rx, by - Math.max(total, 8) * s);
    const step = s < 14 ? 5 : s < 26 ? 2 : 1;
    for (let m = 0; m <= Math.max(total, 8) + 0.01; m += 1) {
      const y = by - m * s, big = m % step === 0;
      ctx.moveTo(rx, y); ctx.lineTo(rx + (big ? 10 : 5), y);
      if (big) ctx.fillText(`${m} m`, rx - 4, y + 4);
    }
    ctx.stroke();
    if (total > 0) {
      ctx.fillStyle = COL.yellow; ctx.textAlign = 'left';
      ctx.fillText(`Height ${total.toFixed(1)} m`, rx + 14, by - total * s + 4);
    }
    // layout
    const parts = []; const bounds = []; let y = by - total * s;
    bounds.push(y);
    this.stack.forEach((p, i) => { const h = PARTS[p.type].h * s; parts.push({ i, y0: y, y1: y + h }); y += h; bounds.push(y); });
    this.layout = { s, cx, by, parts, bounds };
    // empty state
    if (!this.stack.length) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.strokeRect(cx - 90, by - 170, 180, 160); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'center'; ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText('Drag parts here', cx, by - 100); ctx.font = '13px system-ui, sans-serif'; ctx.fillText('or tap a part to add it', cx, by - 78);
    }
    // stage brackets
    if (this.stack.length) {
      const secs = splitSections(this.stack); let k = 0; const nSec = secs.length;
      ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'left';
      secs.forEach((sec, si) => {
        const top = parts[k].y0, bot = parts[k + sec.length - 1].y1; k += sec.length;
        const bx = cx + (W / 2 + 1.1) * s;
        ctx.strokeStyle = 'rgba(93,255,176,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, top + 3); ctx.lineTo(bx + 8, top + 3); ctx.lineTo(bx + 8, bot - 3); ctx.lineTo(bx, bot - 3); ctx.stroke();
        ctx.fillStyle = '#5dffb0'; ctx.fillText(`Stage ${nSec - si}`, bx + 13, (top + bot) / 2 + 4);
      });
    }
    // rocket
    const dr = this.drag;
    ctx.save(); ctx.translate(cx, by); ctx.scale(s, s);
    drawStack(ctx, this.stack, { lw: 1.6 / s, highlight: this.sel, target: dr && dr.moving && dr.over && dr.over.kind === 'radial' ? dr.over.index : undefined });
    ctx.restore();
    // drag feedback
    if (dr && dr.moving) {
      if (dr.over && dr.over.kind === 'insert') {
        const yy = bounds[dr.over.index];
        const pulse = 0.6 + 0.4 * Math.sin(t * 8);
        ctx.strokeStyle = `rgba(255,210,63,${pulse})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx - (W / 2 + 0.9) * s, yy); ctx.lineTo(cx + (W / 2 + 0.9) * s, yy); ctx.stroke();
        ctx.fillStyle = COL.yellow; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('snap', cx - (W / 2 + 1.0) * s, yy + 4);
      }
      const P = PARTS[dr.type];
      ctx.save(); ctx.globalAlpha = 0.75; ctx.translate(dr.x, dr.y); ctx.scale(s, s);
      const h = P.radial ? 1.6 : P.h;
      ctx.translate(0, -h / 2);
      if (dr.type === 'fins') drawFins(ctx, h, 1.6 / s); else if (dr.type === 'struts') drawStruts(ctx, h, 1.6 / s); else drawPart(ctx, dr.type, 1.6 / s);
      ctx.restore();
      if (dr.from >= 0 && !dr.over) {
        ctx.fillStyle = '#ef476f'; ctx.font = '700 14px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Drop here to remove', dr.x, dr.y + 40);
      }
    }
  }
}
