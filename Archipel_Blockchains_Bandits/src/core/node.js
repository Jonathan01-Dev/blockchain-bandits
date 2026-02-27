import { STORAGE, NETWORK } from './constants.js';
import { ensureDir } from './files.js';
import { makeLogger } from './logger.js';
import { createNodeId } from './nodeId.js';
import { PeerTable } from '../network/peerTable.js';
import { DiscoveryService } from '../network/discovery.js';
import { TcpServer } from '../network/tcpServer.js';

export class ArchipelNode {
  constructor({ port }) {
    ensureDir(STORAGE.ROOT);
    this.port = Number(port || NETWORK.DEFAULT_TCP_PORT);
    this.nodeId = createNodeId(this.port.toString());
    this.logger = makeLogger(this.nodeId.slice(0, 8));
    this.peerTable = new PeerTable();
    this.discovery = new DiscoveryService({
      nodeId: this.nodeId,
      tcpPort: this.port,
      peerTable: this.peerTable,
      logger: this.logger,
    });
    this.tcp = new TcpServer({ port: this.port, logger: this.logger });
    this.startedAt = null;
    this.persistTimer = null;
  }

  start() {
    this.startedAt = Date.now();
    this.discovery.start();
    this.tcp.start();
    this.persistTimer = setInterval(() => this.peerTable.save(), 10_000);
    this.logger.info(`Node started. node_id=${this.nodeId} port=${this.port}`);
  }

  stop() {
    if (this.persistTimer) clearInterval(this.persistTimer);
    this.persistTimer = null;
    this.discovery.stop();
    this.tcp.stop();
    this.peerTable.save();
  }

  listPeers() {
    return this.peerTable.list();
  }

  status() {
    const peers = this.peerTable.list();
    return {
      nodeId: this.nodeId,
      port: this.port,
      uptimeSec: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      peersTotal: peers.length,
      peersOnline: peers.filter((p) => p.status === 'online').length,
    };
  }
}
