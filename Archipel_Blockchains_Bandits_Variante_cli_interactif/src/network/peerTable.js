import { PEER_STORE_FILE, PEER_TIMEOUT_MS, PEER_PRUNE_MS } from '../core/constants.js';
import { readJson, writeJson } from '../core/files.js';

export class PeerTable {
  constructor() {
    this.peers = new Map();
    const persisted = readJson(PEER_STORE_FILE, { peers: [] });
    for (const p of persisted.peers || []) {
      if (!p || typeof p !== 'object') continue;
      if (!p.nodeId || typeof p.nodeId !== 'string') continue;
      this.peers.set(p.nodeId, p);
    }
  }

  upsert(peer) {
    if (!peer || !peer.nodeId || typeof peer.nodeId !== 'string') return;
    const existing = this.peers.get(peer.nodeId) || {};
    const merged = {
      ...existing,
      ...peer,
      reputation: Number.isFinite(peer.reputation) ? peer.reputation : (existing.reputation ?? 1),
      lastSeen: Date.now(),
      status: 'online',
    };
    this.peers.set(peer.nodeId, merged);
  }

  updateReputation(nodeId, wasSuccess) {
    const peer = this.peers.get(nodeId);
    if (!peer) return;
    const current = Number.isFinite(peer.reputation) ? peer.reputation : 1;
    const delta = wasSuccess ? 0.05 : -0.1;
    peer.reputation = Math.max(0, Math.min(1, current + delta));
  }

  markStalePeers() {
    const now = Date.now();
    for (const [nodeId, peer] of this.peers.entries()) {
      if (now - (peer.lastSeen || 0) > PEER_TIMEOUT_MS) {
        peer.status = 'stale';
      }
      if (now - (peer.lastSeen || 0) > PEER_PRUNE_MS) {
        this.peers.delete(nodeId);
      }
    }
  }

  save() {
    const peers = Array.from(this.peers.values()).filter((p) => p?.nodeId && typeof p.nodeId === 'string');
    writeJson(PEER_STORE_FILE, { peers });
  }

  get(nodeId) {
    return this.peers.get(nodeId);
  }

  list() {
    this.markStalePeers();
    return Array.from(this.peers.values())
      .filter((p) => p?.nodeId && typeof p.nodeId === 'string')
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }
}
