import { NETWORK, STORAGE } from '../core/constants.js';
import { readJson, writeJson } from '../core/files.js';

export class PeerTable {
  constructor() {
    this.peers = new Map();
    const saved = readJson(STORAGE.PEERS_FILE, { peers: [] });
    for (const p of saved.peers || []) {
      this.peers.set(p.nodeId, p);
    }
  }

  upsert(peer) {
    const prev = this.peers.get(peer.nodeId) || {};
    this.peers.set(peer.nodeId, {
      ...prev,
      ...peer,
      lastSeen: Date.now(),
      status: 'online',
    });
  }

  markStale() {
    const now = Date.now();
    for (const peer of this.peers.values()) {
      if (now - (peer.lastSeen || 0) > NETWORK.PEER_STALE_MS) {
        peer.status = 'stale';
      }
    }
  }

  list() {
    this.markStale();
    return Array.from(this.peers.values()).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }

  save() {
    writeJson(STORAGE.PEERS_FILE, { peers: this.list() });
  }
}
