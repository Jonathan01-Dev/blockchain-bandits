import dgram from 'node:dgram';
import { DISCOVERY_GROUP, DISCOVERY_PORT, HELLO_INTERVAL_MS } from '../core/constants.js';
import { encodePacket, tryDecodePacket } from './packetProtocol.js';

export class DiscoveryService {
  constructor({ identity, tcpPort, peerTable, logger, getSharedFileIds = () => [] }) {
    this.identity = identity;
    this.tcpPort = tcpPort;
    this.peerTable = peerTable;
    this.logger = logger;
    this.getSharedFileIds = getSharedFileIds;
    this.socket = null;
    this.interval = null;
  }

  start() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (err) => this.logger.error(`UDP error: ${err.message}`));

    this.socket.on('message', (msg, rinfo) => {
      try {
        const decoded = tryDecodePacket(msg);
        if (!decoded) return;
        const pkt = decoded.packet;
        if (pkt.nodeId === this.identity.nodeId) return;

        if (pkt.type === 'HELLO') {
          this.peerTable.upsert({
            nodeId: pkt.nodeId,
            ip: rinfo.address,
            tcpPort: pkt.payload.tcpPort,
            publicKeyPem: pkt.payload.publicKeyPem,
            sharedFileIds: Array.isArray(pkt.payload.sharedFileIds) ? pkt.payload.sharedFileIds : [],
            lastHelloTs: pkt.payload.ts,
          });

          this.sendPeerListUnicast(rinfo.address, rinfo.port);
          return;
        }

        if (pkt.type === 'PEER_LIST' && Array.isArray(pkt.payload.peers)) {
          for (const peer of pkt.payload.peers) {
            if (!peer?.nodeId || peer.nodeId === this.identity.nodeId) continue;
            this.peerTable.upsert({
              nodeId: peer.nodeId,
              ip: peer.ip || rinfo.address,
              tcpPort: peer.tcpPort,
              publicKeyPem: peer.publicKeyPem,
              sharedFileIds: Array.isArray(peer.sharedFileIds) ? peer.sharedFileIds : [],
              lastHelloTs: pkt.payload.ts || Date.now(),
              via: 'peer-list',
            });
          }
        }
      } catch {
        // ignore malformed packet
      }
    });

    this.socket.bind(DISCOVERY_PORT, () => {
      this.socket.addMembership(DISCOVERY_GROUP);
      this.socket.setMulticastTTL(1);
      this.logger.info(`Discovery listening on ${DISCOVERY_GROUP}:${DISCOVERY_PORT}`);
      this.sendHello();
      this.interval = setInterval(() => this.sendHello(), HELLO_INTERVAL_MS);
    });
  }

  sendPeerListUnicast(ip, port) {
    if (!this.socket) return;
    const peers = this.peerTable
      .list()
      .slice(0, 100)
      .map((p) => ({
        nodeId: p.nodeId,
        ip: p.ip,
        tcpPort: p.tcpPort,
        publicKeyPem: p.publicKeyPem,
        sharedFileIds: p.sharedFileIds || [],
      }));

    const packet = encodePacket({
      type: 'PEER_LIST',
      nodeId: this.identity.nodeId,
      payload: { ts: Date.now(), peers },
    });
    this.socket.send(packet, port, ip);
  }

  sendHello() {
    if (!this.socket) return;
    const packet = encodePacket({
      type: 'HELLO',
      nodeId: this.identity.nodeId,
      payload: {
        tcpPort: this.tcpPort,
        publicKeyPem: this.identity.publicKeyPem,
        sharedFileIds: this.getSharedFileIds(),
        ts: Date.now(),
      },
    });

    this.socket.send(packet, DISCOVERY_PORT, DISCOVERY_GROUP);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = null;
    }
  }
}
