import dgram from 'node:dgram';
import { NETWORK } from '../core/constants.js';

export class DiscoveryService {
  constructor({ nodeId, tcpPort, peerTable, logger }) {
    this.nodeId = nodeId;
    this.tcpPort = tcpPort;
    this.peerTable = peerTable;
    this.logger = logger;
    this.socket = null;
    this.helloTimer = null;
  }

  start() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (err) => this.logger.error(`UDP error: ${err.message}`));

    this.socket.on('message', (buf, rinfo) => {
      try {
        const msg = JSON.parse(buf.toString('utf8'));
        if (msg.type !== 'HELLO') return;
        if (msg.nodeId === this.nodeId) return;

        this.peerTable.upsert({
          nodeId: msg.nodeId,
          ip: rinfo.address,
          tcpPort: msg.tcpPort,
          seenVia: 'multicast',
        });
      } catch {
        // ignore malformed packet
      }
    });

    this.socket.bind(NETWORK.DISCOVERY_PORT, () => {
      this.socket.addMembership(NETWORK.DISCOVERY_GROUP);
      this.socket.setMulticastTTL(1);
      this.logger.info(`Discovery active on ${NETWORK.DISCOVERY_GROUP}:${NETWORK.DISCOVERY_PORT}`);
      this.sendHello();
      this.helloTimer = setInterval(() => this.sendHello(), NETWORK.HELLO_INTERVAL_MS);
    });
  }

  sendHello() {
    if (!this.socket) return;
    const payload = Buffer.from(
      JSON.stringify({
        type: 'HELLO',
        nodeId: this.nodeId,
        tcpPort: this.tcpPort,
        ts: Date.now(),
      }),
      'utf8',
    );

    this.socket.send(payload, NETWORK.DISCOVERY_PORT, NETWORK.DISCOVERY_GROUP);
  }

  stop() {
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // no-op
      }
      this.socket = null;
    }
  }
}
