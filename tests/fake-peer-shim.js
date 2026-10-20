// Test-only stand-in for PeerJS (the box's Chrome cannot gather WebRTC ICE candidates). Same API surface, BroadcastChannel transport.
(() => {
  const bc = new BroadcastChannel('fakepeer'); const peers = {};
  class Em { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; } off(e, f) { this.h[e] = (this.h[e] || []).filter((x) => x !== f); } emit(e, ...a) { for (const f of [...(this.h[e] || [])]) f(...a); } }
  class Conn extends Em { constructor(owner, peer, cid) { super(); this.owner = owner; this.peer = peer; this.cid = cid; this.open = false; }
    send(d) { if (this.open) bc.postMessage({ t: 'data', cid: this.cid, to: this.peer, from: this.owner.id, d: JSON.parse(JSON.stringify(d)) }); }
    close() { if (!this.open) return; this.open = false; bc.postMessage({ t: 'close', cid: this.cid, to: this.peer }); this.emit('close'); } }
  class Peer extends Em {
    constructor(id) { super(); if (typeof id !== 'string') id = 'p' + Math.random().toString(36).slice(2, 10); this.id = id; this.conns = {}; peers[id] = this; setTimeout(() => this.emit('open', id), 50); }
    connect(to) { const cid = Math.random().toString(36).slice(2); const c = new Conn(this, to, cid); this.conns[cid] = c; bc.postMessage({ t: 'conn', cid, to, from: this.id });
      c._to = setTimeout(() => { if (!c.open) this.emit('error', { type: 'peer-unavailable' }); }, 2000); return c; }
    destroy() { for (const c of Object.values(this.conns)) c.close(); delete peers[this.id]; this.destroyed = true; }
    reconnect() {}
  }
  bc.onmessage = ({ data: m }) => {
    const p = peers[m.to]; if (!p || p.destroyed) return;
    if (m.t === 'conn') { const c = new Conn(p, m.from, m.cid); c.open = true; p.conns[m.cid] = c; p.emit('connection', c); bc.postMessage({ t: 'ack', cid: m.cid, to: m.from }); setTimeout(() => c.emit('open'), 10); }
    const c = p.conns[m.cid]; if (!c) return;
    if (m.t === 'ack') { c.open = true; clearTimeout(c._to); c.emit('open'); }
    if (m.t === 'data') c.emit('data', m.d);
    if (m.t === 'close' && c.open) { c.open = false; c.emit('close'); }
  };
  window.Peer = Peer; window.__fakePeer = true;
})();
