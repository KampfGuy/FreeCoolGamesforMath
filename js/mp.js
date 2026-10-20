// Online multiplayer (optional): peer-to-peer WebRTC through PeerJS + the free public PeerJS broker.
// No server of our own. The host's browser is the hub: clients connect to it, it relays to everyone.
// The host owns the shared clock and time warp. Nothing here runs unless the player opens Multiplayer.
import { Flight, WARPS, fmtKm, drawConic, VESSEL_ICON } from './flight.js?v=mp1';
import { BODIES, relState, keplerStep, orbitOf } from './physics.js?v=mp1';
import { drawStack, TAU } from './parts.js?v=mp1';

export const MP_PREFIX = 'fcgm-';
export const MAX_PLAYERS = 6;
export const COLORS = ['#ff8a3d', '#4dd0ff', '#5dffb0', '#ffd23f', '#ff6fb5', '#b98cff'];
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const PEERJS_URLS = ['https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
const SEND_HZ = 10;
// Races: missions with a clear single-flight goal.
export const RACE_MISSIONS = ['hop', 'space', 'orbit', 'return', 'heavy', 'flyby', 'escape', 'moonland', 'sat'];

// ---- light profanity filter (kids' game): masks common bad words, also with simple l33t / repeats.
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'fag', 'nigger', 'nigga', 'retard', 'damn', 'crap', 'piss', 'wanker', 'twat', 'porn', 'sex', 'penis', 'vagina', 'kys'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
export function cleanText(s, max = 140) {
  s = String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s.replace(/[\w@$!]+/g, (w) => {
    const n = w.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] || c).replace(/(.)\1+/g, '$1');
    return BAD.some((b) => n.includes(b.replace(/(.)\1+/g, '$1'))) ? w[0] + '*'.repeat(Math.max(2, w.length - 1)) : w;
  });
}
export const cleanName = (s) => cleanText(s, 16).replace(/\*/g, '') || 'Pilot';
export function makeCode(rand = Math.random) { let c = ''; for (let i = 0; i < 5; i++) c += CODE_ABC[Math.floor(rand() * CODE_ABC.length)]; return c; }
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const angLerp = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; };

let peerLoad = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLoad) return peerLoad;
  peerLoad = new Promise((res, rej) => {
    let i = 0;
    const next = () => {
      if (i >= PEERJS_URLS.length) { peerLoad = null; rej(new Error('Could not load PeerJS (are you online?)')); return; }
      const s = document.createElement('script'); s.src = PEERJS_URLS[i++]; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (window.Peer ? res(window.Peer) : next()); s.onerror = () => { s.remove(); next(); };
      document.head.append(s);
    };
    next();
  });
  return peerLoad;
}

// Multiplayer session. `app` gives access to the game: { flight(), world(), screen(), mission(), toast(msg, kind), onRace(m), onEnd() }.
export class MP {
  constructor(app) {
    this.app = app; this.active = false; this.isHost = false; this.peer = null; this.code = '';
    this.me = { id: '', name: 'Pilot', color: COLORS[0] };
    this.players = new Map(); // id -> { id, name, color, snap, parts, disp, conn, lastSeen, status }
    this.conns = new Map(); // host: peerId -> conn
    this.hostConn = null; this.chat = []; this.listeners = new Set();
    this.shared = { t: 0, warp: 0, wall: 0 }; // host clock (clients: last received)
    this.wantWarp = 0; this.sendT = 0; this.partsKey = ''; this.partsSentWall = 0;
    this.race = null; // { mission, startWall, results: [{id,name,color,time,cost,stars}] }
    this.lastChatWall = 0; this.rejoin = null; this.leaving = false;
  }
  on(fn) { this.listeners.add(fn); }
  changed(what) { for (const f of this.listeners) try { f(what); } catch (e) { console.error(e); } }
  toast(m, k) { this.app.toast(m, k); }
  get count() { return this.players.size + 1; }
  get list() { return [{ ...this.me, self: true, status: this.myStatus() }, ...[...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, status: p.status || 'in lobby', host: p.host }))].map((p) => ({ ...p, host: p.self ? this.isHost : p.host })); }

  // ---------------- connect
  async host({ name, color }) {
    const Peer = await loadPeerJS();
    this.reset(); this.me.name = cleanName(name); this.me.color = color || COLORS[0];
    for (let tries = 0; tries < 4; tries++) {
      const code = makeCode();
      try { await this.openPeer(Peer, MP_PREFIX + code); this.code = code; break; } catch (e) { if (!/unavailable|taken/i.test(String(e && (e.type || e.message)))) throw e; }
    }
    if (!this.code) throw new Error('Could not get a room code. Try again.');
    this.isHost = true; this.active = true; this.me.id = this.peer.id;
    this.shared = { t: 0, warp: 0, wall: performance.now() };
    this.peer.on('connection', (c) => this.hostAccept(c));
    this.changed('roster');
    return this.code;
  }
  async join({ name, color, code }) {
    const Peer = await loadPeerJS();
    code = normCode(code); if (code.length !== 5) throw new Error('Room codes have 5 letters/numbers.');
    this.reset(); this.me.name = cleanName(name); this.me.color = color || COLORS[0];
    await this.openPeer(Peer, undefined);
    this.me.id = this.peer.id; this.code = code;
    await new Promise((res, rej) => {
      const c = this.peer.connect(MP_PREFIX + code, { reliable: true, serialization: 'json', metadata: { v: 1 } });
      const to = setTimeout(() => rej(new Error('No game found with code ' + code + '.')), 12000);
      const errH = (e) => { if (e && e.type === 'peer-unavailable') { clearTimeout(to); rej(new Error('No game found with code ' + code + '.')); } };
      this.peer.on('error', errH);
      c.on('open', () => { c.send({ k: 'hello', name: this.me.name, color: this.me.color, v: 1 }); });
      c.on('data', (d) => {
        if (d && d.k === 'full') { clearTimeout(to); rej(new Error('That game is full (6 players).')); return; }
        if (d && d.k === 'welcome') { clearTimeout(to); this.peer.off && this.peer.off('error', errH); this.hostConn = c; this.active = true; this.isHost = false; this.onData(c, d); res(); return; }
        if (this.hostConn === c) this.onData(c, d);
      });
      c.on('close', () => { if (this.hostConn === c) this.lostHost(); });
      c.on('error', () => { if (this.hostConn === c) this.lostHost(); });
    });
    this.rejoin = { name: this.me.name, color: this.me.color, code };
    this.changed('roster');
  }
  openPeer(Peer, id) {
    return new Promise((res, rej) => {
      const p = id ? new Peer(id, { debug: window.__mpDebug || 0 }) : new Peer({ debug: window.__mpDebug || 0 });
      const to = setTimeout(() => { p.destroy(); rej(new Error('Could not reach the PeerJS server.')); }, 15000);
      p.on('open', () => { clearTimeout(to); this.peer = p; res(p); });
      p.on('error', (e) => { if (this.peer !== p) { clearTimeout(to); p.destroy(); rej(e); } else this.peerError(e); });
      p.on('disconnected', () => { if (this.peer === p && this.active && !this.leaving) try { p.reconnect(); } catch { /* ignore */ } });
    });
  }
  peerError(e) { if (e && e.type === 'peer-unavailable') return; console.warn('peer', e); }
  reset() { this.players.clear(); this.conns.clear(); this.chat = []; this.race = null; this.code = ''; this.wantWarp = 0; this.partsKey = ''; }
  leave(quiet) {
    this.leaving = true;
    try { if (this.isHost) this.broadcast({ k: 'bye', host: true }); else if (this.hostConn) this.hostConn.send({ k: 'bye' }); } catch { /* ignore */ }
    setTimeout(() => { try { this.peer && this.peer.destroy(); } catch { /* ignore */ } this.peer = null; this.leaving = false; }, 150);
    this.active = false; this.isHost = false; this.hostConn = null; this.rejoin = null; this.reset();
    Flight.overlay = null;
    if (!quiet) this.toast('You left the multiplayer game.');
    this.changed('left'); this.app.onEnd && this.app.onEnd();
  }
  lostHost() {
    if (!this.active || this.leaving) return;
    const rj = this.rejoin;
    this.active = false; this.hostConn = null; this.players.clear(); Flight.overlay = null;
    this.toast('Lost connection to the host.', 'bad'); this.changed('left');
    if (rj) this.tryRejoin(rj, 1);
  }
  tryRejoin(rj, n) {
    if (n > 3 || this.active) { if (!this.active) { this.toast('Could not rejoin. You are flying solo now.', 'warn'); this.app.onEnd && this.app.onEnd(); } return; }
    this.changed('rejoining');
    setTimeout(() => { if (this.active) return; try { this.peer && this.peer.destroy(); } catch { /* ignore */ } this.join(rj).then(() => this.toast('Rejoined game ' + rj.code + '!', 'good')).catch(() => this.tryRejoin(rj, n + 1)); }, 2500);
  }

  // ---------------- host side
  hostAccept(c) {
    c.on('data', (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.k === 'hello') {
        if (this.players.size + 1 >= MAX_PLAYERS) { c.send({ k: 'full' }); setTimeout(() => c.close(), 300); return; }
        const used = new Set([this.me.color, ...[...this.players.values()].map((p) => p.color)]);
        const color = COLORS.includes(d.color) && !used.has(d.color) ? d.color : COLORS.find((x) => !used.has(x)) || COLORS[0];
        let name = cleanName(d.name); const names = new Set([this.me.name, ...[...this.players.values()].map((p) => p.name)]);
        for (let i = 2; names.has(name); i++) name = cleanName(d.name).slice(0, 13) + ' ' + i;
        const p = { id: c.peer, name, color, conn: c, lastSeen: performance.now(), status: 'in lobby' };
        this.players.set(c.peer, p); this.conns.set(c.peer, c);
        c.send({ k: 'welcome', id: c.peer, name, color, code: this.code, players: this.rosterMsg().players, chat: this.chat.slice(-20), race: this.raceMsg(), time: this.timeMsg() });
        // send everybody's parts so the new player can draw them
        for (const q of this.players.values()) if (q !== p && q.parts) c.send({ k: 'parts', id: q.id, parts: q.parts, h: q.height });
        if (this.myParts) c.send({ k: 'parts', id: this.me.id, parts: this.myParts, h: this.myHeight });
        this.broadcast(this.rosterMsg());
        this.sysChat(`${name} joined.`); this.toast(`${name} joined the game.`, 'good'); this.changed('roster');
        return;
      }
      const p = this.players.get(c.peer); if (!p) return;
      p.lastSeen = performance.now();
      if (d.k === 'bye') { this.dropPlayer(c.peer, 'left'); return; }
      this.onData(c, { ...d, id: c.peer }, p);
    });
    c.on('close', () => this.dropPlayer(c.peer, 'disconnected'));
    c.on('error', () => this.dropPlayer(c.peer, 'disconnected'));
  }
  dropPlayer(id, why) {
    const p = this.players.get(id); if (!p) return;
    this.players.delete(id); this.conns.delete(id); try { p.conn && p.conn.close(); } catch { /* ignore */ }
    this.broadcast({ k: 'gone', id, why }); this.broadcast(this.rosterMsg());
    this.sysChat(`${p.name} ${why}.`); this.toast(`${p.name} ${why}.`, 'warn'); this.changed('roster');
  }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) try { c.send(msg); } catch { /* ignore */ } }
  rosterMsg() { return { k: 'roster', players: this.list.map(({ id, name, color, status, host }) => ({ id, name, color, status, host })) }; }
  timeMsg() { return { k: 'time', t: this.sharedT(), warp: this.effWarp(), want: this.wantWarp }; }
  raceMsg() { return this.race ? { mission: this.race.mission, results: this.race.results, running: this.race.running } : null; }
  // Effective warp: the host's wish, limited by every flying player's own safe warp (atmosphere, engines, ground).
  effWarp() {
    let w = this.wantWarp;
    const f = this.app.flight();
    if (f && this.app.screen() === 'flight') w = Math.min(w, f.warpCap()[0]);
    for (const p of this.players.values()) if (p.snap && p.snap.fl && performance.now() - p.lastSeen < 3000) w = Math.min(w, p.snap.cap);
    return Math.max(0, w);
  }
  requestWarp(d) {
    if (!this.isHost) { this.toast('The host controls time warp for everyone.'); return; }
    this.wantWarp = Math.max(0, Math.min(WARPS.length - 1, this.wantWarp + d));
    const e = this.effWarp();
    if (e < this.wantWarp) this.toast(`Warp ×${WARPS[this.wantWarp]} asked: waiting until every pilot can warp (engines off, out of the air).`);
    this.changed('warp');
  }
  setWarp(i) { if (this.isHost) { this.wantWarp = Math.max(0, Math.min(WARPS.length - 1, i)); this.changed('warp'); } }

  // ---------------- messages (both sides)
  onData(c, d, p) {
    switch (d.k) {
      case 'welcome':
        this.me.id = d.id; this.me.name = d.name; this.me.color = d.color; this.code = d.code;
        this.applyRoster(d.players); this.chat = d.chat || []; if (d.time) this.onTime(d.time);
        if (d.race) this.race = { ...d.race, startWall: d.race.running ? performance.now() : 0 };
        this.changed('chat'); break;
      case 'roster': this.applyRoster(d.players); this.changed('roster'); break;
      case 'time': this.onTime(d); break;
      case 'gone': { const q = this.players.get(d.id); if (q) { this.players.delete(d.id); this.toast(`${q.name} ${d.why || 'left'}.`, 'warn'); this.changed('roster'); } break; }
      case 'bye': if (d.host && !this.isHost) { this.toast('The host ended the game.', 'warn'); this.rejoin = null; this.active = false; this.leave(true); } break;
      case 'st': {
        const q = this.isHost ? p : this.players.get(d.id); if (!q) break;
        this.onSnap(q, d.s); if (this.isHost) { q.status = d.s.status; this.broadcast({ k: 'st', id: q.id, s: d.s }, q.id); }
        break;
      }
      case 'parts': {
        const q = this.isHost ? p : this.players.get(d.id); if (!q || !Array.isArray(d.parts) || d.parts.length > 80) break;
        q.parts = d.parts; q.height = +d.h || 5; if (this.isHost) this.broadcast({ k: 'parts', id: q.id, parts: d.parts, h: q.height }, q.id);
        break;
      }
      case 'chat': {
        const text = cleanText(d.text); if (!text) break;
        if (this.isHost) { const now = performance.now(); if (now - (p.lastChat || 0) < 700) break; p.lastChat = now; const m = { from: p.name, color: p.color, text, ts: Date.now() }; this.addChat(m); this.broadcast({ k: 'chat', m }); }
        else if (d.m) this.addChat({ ...d.m, text: cleanText(d.m.text), from: cleanName(d.m.from) });
        break;
      }
      case 'race': this.onRace(d); break;
      case 'result': if (this.isHost && this.race) this.addResult({ ...d.r, id: p.id, name: p.name, color: p.color }); break;
    }
  }
  applyRoster(list) {
    const seen = new Set();
    for (const r of list || []) {
      if (r.id === this.me.id) { this.me.name = r.name; this.me.color = r.color; continue; }
      seen.add(r.id);
      const q = this.players.get(r.id) || { id: r.id };
      Object.assign(q, { name: cleanName(r.name), color: COLORS.includes(r.color) ? r.color : '#fff', status: r.status, host: r.host });
      this.players.set(r.id, q);
    }
    if (!this.isHost) for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
  }
  onTime(d) {
    this.shared = { t: +d.t || 0, warp: Math.max(0, Math.min(WARPS.length - 1, d.warp | 0)), wall: performance.now(), want: d.want | 0 };
  }
  // Shared clock, extrapolated from the last host message (clients) or the host's own world (host).
  sharedT() {
    return this.shared.t + ((performance.now() - this.shared.wall) / 1000) * WARPS[this.shared.warp];
  }
  get warpIdx() { return this.shared.warp; }

  // Called by the game loop before world.update(dt) in flight. Sets warp, returns a time-rate factor that
  // gently pulls a client's world clock onto the host's (never jumps, so physics stays stable).
  syncFlight(world, flight, dt) {
    const wi = this.warpIdx;
    flight.warpIdx = Math.min(wi, flight.warpCap()[0]);
    const diff = this.sharedT() - world.t, rate = WARPS[flight.warpIdx];
    return Math.max(0.5, Math.min(2, 1 + diff / (rate * 1.0 + 0.5)));
  }

  // ---------------- per-frame network tick
  tick(dt) {
    if (!this.active) return;
    const now = performance.now();
    if (this.isHost) {
      this.shared.t = this.sharedT(); this.shared.wall = now; this.shared.warp = this.effWarp();
      for (const p of [...this.players.values()]) if (now - p.lastSeen > 10000) this.dropPlayer(p.id, 'timed out');
    } else if (now - this.shared.wall > 10000) { this.lostHost(); return; }
    if ((this.sendT += dt) < 1 / SEND_HZ - 0.02) return;
    this.sendT = 0;
    const s = this.mySnap();
    this.sendParts();
    if (this.isHost) {
      this.broadcast({ k: 'st', id: this.me.id, s });
      this.broadcast(this.timeMsg());
      if ((this.rosterT = (this.rosterT || 0) + 1) % 10 === 0) this.broadcast(this.rosterMsg());
      if (this.rosterT % 10 === 0) this.changed('status');
    } else if (this.hostConn && this.hostConn.open) this.hostConn.send({ k: 'st', s });
  }
  decay(dt) { const k = Math.exp(-dt * 6); for (const p of this.players.values()) if (p.err) { p.err.x *= k; p.err.y *= k; } }
  myStatus() {
    const f = this.app.flight(), sc = this.app.screen();
    if (sc === 'flight' && f) {
      if (f.state === 'crashed') return 'crashed';
      const B = BODIES[f.body]; return f.onGround ? `landed on ${B.name}` : `${f.vtype || 'flying'} · ${fmtKm(Math.max(0, f.alt))} over ${B.name}`;
    }
    return sc === 'hangar' ? 'building a rocket' : sc === 'missions' ? 'picking a mission' : 'in lobby';
  }
  mySnap() {
    const f = this.app.flight(), fl = !!(f && this.app.screen() === 'flight' && f.state !== 'crashed');
    const s = { fl, status: this.myStatus(), t: this.sharedT() };
    if (fl) Object.assign(s, { b: f.body, px: f.px, py: f.py, vx: f.vx, vy: f.vy, hd: f.heading, t: f.world ? f.world.t : f.t, g: f.onGround ? 1 : 0, fx: +(f.coreFlame || 0).toFixed(2), sx: +(f.sideFlame || 0).toFixed(2), ty: f.vtype, cn: String(f.name || '').slice(0, 24), cap: f.warpCap()[0], ch: +(f.chute || 0).toFixed(2), lg: +(f.legAnim || 0).toFixed(2) });
    return s;
  }
  sendParts() {
    const f = this.app.flight(); if (!f || this.app.screen() !== 'flight') return;
    const parts = f.allParts.map((p) => { const o = {}; for (const k of ['type', 'fins', 'struts', 'legs', 'shape', 'len', 'side', 'open']) if (p[k] != null) o[k] = p[k]; return o; });
    const key = JSON.stringify(parts) + f.height.toFixed(1);
    if (key === this.partsKey) return;
    this.partsKey = key; this.myParts = parts; this.myHeight = f.height;
    const msg = { k: 'parts', id: this.me.id, parts, h: f.height };
    if (this.isHost) this.broadcast(msg); else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }
  onSnap(p, s) {
    if (!s || typeof s !== 'object') return;
    p.lastSeen = performance.now();
    if (s.fl && p.snap && p.snap.fl && p.snap.b === s.b) {
      // keep the drawn position continuous: remember the jump and fade it out
      const old = this.predict(p, s.b, this.localT()), nw = this.predictSnap(s, s.b, this.localT());
      if (old && nw) { const ex = old.x - nw.x, ey = old.y - nw.y; p.err = Math.hypot(ex, ey) < 5000 ? { x: ex, y: ey } : { x: 0, y: 0 }; }
    } else p.err = { x: 0, y: 0 };
    p.snap = s; p.status = s.status;
  }
  localT() { const f = this.app.flight(); return f && f.world && this.app.screen() === 'flight' ? f.world.t : this.sharedT(); }
  // State of a snapshot moved (gravity only, Kepler) to time t, seen from body `frame`.
  predictSnap(s, frame, t) {
    if (!s || !s.fl || !BODIES[s.b]) return null;
    let { px, py, vx, vy } = s;
    const dt = t - s.t;
    if (!s.g && Math.abs(dt) > 1e-4 && Math.abs(dt) < 2e5 && Math.hypot(px, py) > BODIES[s.b].R * 0.5) {
      try { const k = keplerStep(px, py, vx, vy, BODIES[s.b].mu, dt); if (isFinite(k.px) && isFinite(k.py)) ({ px, py, vx, vy } = k); } catch { /* keep */ }
    }
    if (frame !== s.b) { const d = relState(s.b, frame, t); px += d.x; py += d.y; vx += d.vx; vy += d.vy; }
    return { x: px, y: py, vx, vy };
  }
  predict(p, frame, t) {
    const r = this.predictSnap(p.snap, frame, t); if (!r) return null;
    if (p.err && p.snap.b === frame) { r.x += p.err.x; r.y += p.err.y; }
    p.disp = p.disp == null ? p.snap.hd : angLerp(p.disp, p.snap.hd, 0.25);
    r.hd = p.disp; return r;
  }
  flyingRemotes() { return [...this.players.values()].filter((p) => p.snap && p.snap.fl && performance.now() - p.lastSeen < 5000); }

  // ---------------- drawing hooks (called from Flight.render / renderMap)
  drawWorld(ctx, f, { cx, cy, s, viewR, labels }) {
    for (const p of this.flyingRemotes()) {
      const r = this.predict(p, f.body, f.world ? f.world.t : f.t); if (!r) continue;
      const dx = r.x - cx, dy = r.y - cy, h = p.height || 5;
      if (Math.hypot(dx, dy) > viewR + 200) continue;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(r.hd - Math.PI / 2); ctx.scale(1, -1);
      if (p.parts && p.parts.length && h * s > 3) {
        try { drawStack(ctx, p.parts, { lw: 1.3 / s, flame: p.snap.fx, sideFlame: p.snap.sx, chute: p.snap.ch, legs: p.snap.lg, vac: true, t: f.t }); } catch { /* bad parts */ }
      } else {
        ctx.beginPath(); ctx.arc(0, -h / 2, 7 / s, 0, TAU); ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 2 / s; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      ctx.restore();
      labels.push([dx + Math.cos(r.hd) * (h + 2), dy + Math.sin(r.hd) * (h + 2), `${p.name}${p.snap.cn ? ' · ' + p.snap.cn : ''}`, p.color]);
    }
  }
  drawMap(ctx, f, { X, Y, w, h }) {
    const t = f.world ? f.world.t : f.t;
    for (const p of this.flyingRemotes()) {
      const r = this.predict(p, f.body, t); if (!r) continue;
      const sb = p.snap.b, off = sb === f.body ? { x: 0, y: 0 } : relState(sb, f.body, t);
      if (!p.snap.g) {
        const own = this.predictSnap(p.snap, sb, t);
        if (own) try { drawConic(ctx, orbitOf(own.x, own.y, own.vx, own.vy, BODIES[sb]), BODIES[sb], (px, py) => [X(off.x + px), Y(off.y + py)], p.color); } catch { /* ignore */ }
      }
      const sx = X(r.x), sy = Y(r.y);
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-r.hd);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
      ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'left';
      const lbl = `${p.name}${p.snap.ty ? ' ' + (VESSEL_ICON[p.snap.ty] || '') : ''}`;
      ctx.fillStyle = '#000a'; ctx.fillText(lbl, sx + 13, sy + 15); ctx.fillStyle = p.color; ctx.fillText(lbl, sx + 12, sy + 14);
    }
  }

  // ---------------- chat
  addChat(m) { this.chat.push(m); if (this.chat.length > 60) this.chat.shift(); this.changed('chat'); if (m.from && m.from !== this.me.name && !m.sys) this.changed('chat-new'); }
  sysChat(text) { const m = { sys: true, from: '', text, ts: Date.now() }; this.addChat(m); if (this.isHost) this.broadcast({ k: 'chat', m }); }
  say(text) {
    text = cleanText(text); if (!text || !this.active) return false;
    const now = performance.now(); if (now - this.lastChatWall < 700) { this.toast('Slow down a little!'); return false; }
    this.lastChatWall = now;
    if (this.isHost) { const m = { from: this.me.name, color: this.me.color, text, ts: Date.now() }; this.addChat(m); this.broadcast({ k: 'chat', m }); }
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ k: 'chat', text });
    return true;
  }

  // ---------------- race mode
  startRace(missionId) {
    if (!this.isHost || !RACE_MISSIONS.includes(missionId)) return;
    this.race = { mission: missionId, results: [], running: true, startWall: performance.now() };
    this.broadcast({ k: 'race', start: true, mission: missionId });
    this.sysChat('Race started! Build fast and fly!');
    this.app.onRace(missionId); this.changed('race');
  }
  endRace() { if (!this.isHost || !this.race) return; this.race.running = false; this.broadcast({ k: 'race', end: true, results: this.race.results }); this.changed('race'); }
  onRace(d) {
    if (this.isHost) return;
    if (d.start) { this.race = { mission: d.mission, results: [], running: true, startWall: performance.now() }; this.toast('Race started! Build fast and fly!', 'good'); this.app.onRace(d.mission); }
    if (d.results && this.race) this.race.results = d.results;
    if (d.end && this.race) this.race.running = false;
    this.changed('race');
  }
  // The local player finished the race mission.
  finishRace(missionId, info) {
    if (!this.race || !this.race.running || this.race.mission !== missionId || this.race.done) return;
    this.race.done = true;
    const r = { time: (performance.now() - this.race.startWall) / 1000, cost: Math.round(info.cost || 0) };
    if (this.isHost) this.addResult({ ...r, id: this.me.id, name: this.me.name, color: this.me.color });
    else if (this.hostConn) this.hostConn.send({ k: 'result', r });
    this.toast(`You finished in ${fmtTime(r.time)}!`, 'good');
  }
  addResult(r) {
    if (!this.race || this.race.results.some((x) => x.id === r.id)) return;
    r.time = Math.max(0, +r.time || 0); r.cost = Math.max(0, +r.cost || 0);
    this.race.results.push(r); this.race.results.sort((a, b) => a.time - b.time);
    this.broadcast({ k: 'race', results: this.race.results });
    this.sysChat(`🏁 ${r.name} finished #${this.race.results.indexOf(r) + 1} in ${fmtTime(r.time)}.`);
    this.changed('race');
  }
}
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
