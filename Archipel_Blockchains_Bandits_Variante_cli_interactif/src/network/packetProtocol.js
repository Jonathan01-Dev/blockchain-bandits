import crypto from 'node:crypto';
import {
  ARCHIPEL_BINARY_MAGIC,
  ARCHIPEL_PACKET_VERSION,
  HMAC_BOOTSTRAP_KEY,
} from '../core/constants.js';

const HEADER_LEN = 4 + 1 + 1 + 32 + 4;
const HMAC_LEN = 32;

export const WIRE_TYPES = {
  HELLO: 0x01,
  PEER_LIST: 0x02,
  MSG: 0x03,
  CHUNK_REQ: 0x04,
  CHUNK_DATA: 0x05,
  MANIFEST: 0x06,
  ACK: 0x07,
  HANDSHAKE_HELLO: 0x11,
  HANDSHAKE_REPLY: 0x12,
  SECURE: 0x13,
  PING: 0x14,
  PONG: 0x15,
  TRUST_UPDATE: 0x16,
};

const WIRE_TYPES_REVERSE = Object.fromEntries(
  Object.entries(WIRE_TYPES).map(([name, value]) => [value, name]),
);

function normalizeNodeId(nodeId) {
  const raw = (nodeId || '').toLowerCase();
  if (/^[0-9a-f]{64}$/.test(raw)) return raw;
  return ''.padStart(64, '0');
}

function encodeNodeId(nodeId) {
  return Buffer.from(normalizeNodeId(nodeId), 'hex');
}

function decodeNodeId(buf) {
  return buf.toString('hex');
}

function hmacFor(key, chunks) {
  const mac = crypto.createHmac('sha256', key || HMAC_BOOTSTRAP_KEY);
  for (const chunk of chunks) mac.update(chunk);
  return mac.digest();
}

export function encodePacket({ type, nodeId, payload, hmacKey }) {
  const typeId = WIRE_TYPES[type];
  if (!typeId) throw new Error(`Unknown packet type: ${type}`);

  const payloadBuf = Buffer.from(JSON.stringify(payload || {}), 'utf8');
  const header = Buffer.alloc(HEADER_LEN);
  ARCHIPEL_BINARY_MAGIC.copy(header, 0);
  header.writeUInt8(ARCHIPEL_PACKET_VERSION, 4);
  header.writeUInt8(typeId, 5);
  encodeNodeId(nodeId).copy(header, 6);
  header.writeUInt32BE(payloadBuf.length, 38);

  const hmac = hmacFor(hmacKey, [header, payloadBuf]);
  return Buffer.concat([header, payloadBuf, hmac]);
}

export function tryDecodePacket(buf, hmacKey) {
  if (buf.length < HEADER_LEN + HMAC_LEN) return null;
  if (!buf.subarray(0, 4).equals(ARCHIPEL_BINARY_MAGIC)) {
    throw new Error('Invalid packet magic');
  }

  const version = buf.readUInt8(4);
  if (version !== ARCHIPEL_PACKET_VERSION) {
    throw new Error(`Unsupported packet version: ${version}`);
  }

  const typeId = buf.readUInt8(5);
  const type = WIRE_TYPES_REVERSE[typeId];
  if (!type) throw new Error(`Unknown packet type id: ${typeId}`);

  const payloadLen = buf.readUInt32BE(38);
  const totalLen = HEADER_LEN + payloadLen + HMAC_LEN;
  if (buf.length < totalLen) return null;

  const header = buf.subarray(0, HEADER_LEN);
  const payloadBuf = buf.subarray(HEADER_LEN, HEADER_LEN + payloadLen);
  const receivedHmac = buf.subarray(HEADER_LEN + payloadLen, totalLen);
  const expectedHmac = hmacFor(hmacKey, [header, payloadBuf]);

  if (!crypto.timingSafeEqual(receivedHmac, expectedHmac)) {
    throw new Error('Packet HMAC mismatch');
  }

  let payload = {};
  if (payloadBuf.length > 0) {
    payload = JSON.parse(payloadBuf.toString('utf8'));
  }

  return {
    packet: {
      type,
      nodeId: decodeNodeId(buf.subarray(6, 38)),
      payload,
    },
    bytesConsumed: totalLen,
  };
}

export function attachPacketReader(socket, state, onPacket) {
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length > 0) {
      let decoded;
      try {
        decoded = tryDecodePacket(buffer, state.getHmacKey());
      } catch (err) {
        state.onProtocolError(err);
        socket.destroy();
        return;
      }

      if (!decoded) return;
      buffer = buffer.subarray(decoded.bytesConsumed);
      onPacket(decoded.packet);
    }
  });
}

export function sendPacket(socket, packet, hmacKey) {
  socket.write(encodePacket({ ...packet, hmacKey }));
}
