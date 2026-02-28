import net from 'node:net';
import {
  newEphemeralKeyPair,
  deriveSessionKey,
  encryptJson,
  decryptJson,
} from '../crypto/session.js';
import { signPayload, verifySignature } from '../crypto/identity.js';
import { HANDSHAKE_MAX_SKEW_MS, KEEPALIVE_MS } from '../core/constants.js';
import { isTimestampFresh } from '../core/time.js';
import { attachPacketReader, sendPacket } from './packetProtocol.js';

function exportX25519PubPem(keyObj) {
  return keyObj.export({ format: 'pem', type: 'spki' }).toString();
}

function encodeSignable(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function setupConnectionState({ logger, socket }) {
  return {
    handshakeDone: false,
    sessionKey: null,
    remoteNodeId: null,
    lastActivityAt: Date.now(),
    awaitingPong: false,
    keepAliveTimer: null,
    getHmacKey() {
      return this.handshakeDone ? this.sessionKey : null;
    },
    touch() {
      this.lastActivityAt = Date.now();
      this.awaitingPong = false;
    },
    onProtocolError(err) {
      logger.warn(`Protocol error (${socket.remoteAddress}:${socket.remotePort}): ${err.message}`);
    },
  };
}

export class SecureTcpService {
  constructor({ identity, trustStore, peerTable, logger, onSecurePayload }) {
    this.identity = identity;
    this.trustStore = trustStore;
    this.peerTable = peerTable;
    this.logger = logger;
    this.onSecurePayload = onSecurePayload;
    this.server = null;
  }

  start(port) {
    this.server = net.createServer((socket) => this.handleIncoming(socket));
    this.server.listen(port, () => this.logger.info(`TCP server listening on 0.0.0.0:${port}`));
  }

  stop() {
    if (this.server) {
      try {
        this.server.close();
      } catch {
        // already closed
      }
      this.server = null;
    }
  }

  startKeepAlive(socket, state) {
    if (state.keepAliveTimer) return;

    state.keepAliveTimer = setInterval(() => {
      const now = Date.now();
      if (!state.handshakeDone) return;
      if (socket.destroyed) return;

      if (state.awaitingPong && now - state.lastActivityAt > KEEPALIVE_MS * 2) {
        this.logger.warn(`Keepalive timeout from ${state.remoteNodeId?.slice(0, 8) || 'unknown'}`);
        socket.destroy();
        return;
      }

      if (now - state.lastActivityAt >= KEEPALIVE_MS) {
        state.awaitingPong = true;
        sendPacket(socket, {
          type: 'PING',
          nodeId: this.identity.nodeId,
          payload: { ts: now },
        }, state.getHmacKey());
      }
    }, KEEPALIVE_MS);

    socket.on('close', () => {
      if (state.keepAliveTimer) clearInterval(state.keepAliveTimer);
      state.keepAliveTimer = null;
    });
  }

  handleIncoming(socket) {
    const state = setupConnectionState({ logger: this.logger, socket });

    attachPacketReader(socket, state, (pkt) => {
      state.touch();

      if (!state.handshakeDone) {
        this.handleIncomingHandshake(socket, state, pkt);
        return;
      }

      if (pkt.type === 'PING') {
        sendPacket(socket, {
          type: 'PONG',
          nodeId: this.identity.nodeId,
          payload: { ts: Date.now() },
        }, state.getHmacKey());
        return;
      }

      if (pkt.type === 'PONG') return;

      if (pkt.type === 'SECURE') {
        try {
          const payload = decryptJson(state.sessionKey, pkt.payload.encrypted);
          this.onSecurePayload({
            socket,
            remoteNodeId: state.remoteNodeId,
            payload,
            reply: (obj) => sendPacket(socket, {
              type: 'SECURE',
              nodeId: this.identity.nodeId,
              payload: { encrypted: encryptJson(state.sessionKey, obj) },
            }, state.getHmacKey()),
          });
        } catch (err) {
          this.logger.warn(`Decrypt failed: ${err.message}`);
        }
      }
    });
  }

  handleIncomingHandshake(socket, state, pkt) {
    if (pkt.type !== 'HANDSHAKE_HELLO') return;
    const msg = pkt.payload;

    if (!isTimestampFresh(msg.ts, HANDSHAKE_MAX_SKEW_MS)) {
      this.logger.warn('Handshake rejected: stale timestamp');
      socket.destroy();
      return;
    }

    const signable = {
      nodeId: msg.nodeId,
      publicKeyPem: msg.publicKeyPem,
      ephPublicKeyPem: msg.ephPublicKeyPem,
      ts: msg.ts,
    };

    const sigOk = verifySignature(encodeSignable(signable), msg.signature, msg.publicKeyPem);
    if (!sigOk) {
      this.logger.warn('Handshake rejected: invalid signature');
      socket.destroy();
      return;
    }

    const trust = this.trustStore.isTrusted(msg.nodeId, msg.publicKeyPem);
    if (!trust.ok) {
      this.logger.warn(`Handshake rejected: trust mismatch for ${msg.nodeId.slice(0, 8)}`);
      socket.destroy();
      return;
    }

    const eph = newEphemeralKeyPair();
    const ephPubPem = exportX25519PubPem(eph.publicKey);
    const replySignable = {
      nodeId: this.identity.nodeId,
      publicKeyPem: this.identity.publicKeyPem,
      ephPublicKeyPem: ephPubPem,
      ts: Date.now(),
    };

    sendPacket(socket, {
      type: 'HANDSHAKE_REPLY',
      nodeId: this.identity.nodeId,
      payload: {
        ...replySignable,
        signature: signPayload(encodeSignable(replySignable), this.identity.privateKeyObj),
      },
    }, state.getHmacKey());

    state.sessionKey = deriveSessionKey(eph.privateKey, msg.ephPublicKeyPem);
    state.handshakeDone = true;
    state.remoteNodeId = msg.nodeId;

    const known = this.peerTable.get(msg.nodeId);
    this.peerTable.upsert({
      nodeId: msg.nodeId,
      ip: socket.remoteAddress,
      tcpPort: known?.tcpPort,
      publicKeyPem: msg.publicKeyPem,
      via: 'tcp-handshake',
    });

    this.startKeepAlive(socket, state);
  }

  async sendSecureRequest(peer, payload, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 15_000);

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: peer.ip, port: peer.tcpPort });
      const state = setupConnectionState({ logger: this.logger, socket });
      const eph = newEphemeralKeyPair();
      const ephPubPem = exportX25519PubPem(eph.publicKey);
      let settled = false;

      const cleanup = () => {
        if (state.keepAliveTimer) clearInterval(state.keepAliveTimer);
        state.keepAliveTimer = null;
      };

      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      attachPacketReader(socket, state, (pkt) => {
        state.touch();

        if (!state.handshakeDone) {
          if (pkt.type !== 'HANDSHAKE_REPLY') return;
          const msg = pkt.payload;

          if (!isTimestampFresh(msg.ts, HANDSHAKE_MAX_SKEW_MS)) {
            socket.destroy();
            settle(reject, new Error('Stale server handshake timestamp'));
            return;
          }

          const signable = {
            nodeId: msg.nodeId,
            publicKeyPem: msg.publicKeyPem,
            ephPublicKeyPem: msg.ephPublicKeyPem,
            ts: msg.ts,
          };

          const sigOk = verifySignature(encodeSignable(signable), msg.signature, msg.publicKeyPem);
          if (!sigOk) {
            socket.destroy();
            settle(reject, new Error('Invalid server handshake signature'));
            return;
          }

          const trust = this.trustStore.isTrusted(msg.nodeId, msg.publicKeyPem);
          if (!trust.ok) {
            socket.destroy();
            settle(reject, new Error('Trust store mismatch'));
            return;
          }

          state.sessionKey = deriveSessionKey(eph.privateKey, msg.ephPublicKeyPem);
          state.handshakeDone = true;
          state.remoteNodeId = msg.nodeId;

          sendPacket(socket, {
            type: 'SECURE',
            nodeId: this.identity.nodeId,
            payload: {
              encrypted: encryptJson(state.sessionKey, payload),
            },
          }, state.getHmacKey());
          this.startKeepAlive(socket, state);
          return;
        }

        if (pkt.type === 'PING') {
          sendPacket(socket, {
            type: 'PONG',
            nodeId: this.identity.nodeId,
            payload: { ts: Date.now() },
          }, state.getHmacKey());
          return;
        }

        if (pkt.type !== 'SECURE') return;

        try {
          const response = decryptJson(state.sessionKey, pkt.payload.encrypted);
          socket.end();
          settle(resolve, response);
        } catch {
          socket.end();
          settle(reject, new Error('Invalid secure response'));
        }
      });

      socket.on('connect', () => {
        const hello = {
          nodeId: this.identity.nodeId,
          publicKeyPem: this.identity.publicKeyPem,
          ephPublicKeyPem: ephPubPem,
          ts: Date.now(),
        };

        sendPacket(socket, {
          type: 'HANDSHAKE_HELLO',
          nodeId: this.identity.nodeId,
          payload: {
            ...hello,
            signature: signPayload(encodeSignable(hello), this.identity.privateKeyObj),
          },
        }, state.getHmacKey());
      });

      socket.on('error', (err) => settle(reject, err));
      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        settle(reject, new Error('Request timeout'));
      });
      socket.on('close', () => cleanup());
    });
  }
}
