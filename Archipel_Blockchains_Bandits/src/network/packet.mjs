import { createHmac, createHash } from "node:crypto";
import { HMAC_KEY, MAGIC } from "./constants.mjs";

function normalizeNodeId(nodeIdHex) {
  const b = Buffer.from(nodeIdHex, "hex");
  if (b.length !== 32) throw new Error("node_id must be 32 bytes");
  return b;
}

export function buildPacket(type, nodeIdHex, payloadObject) {
  const payload = Buffer.from(JSON.stringify(payloadObject), "utf8");
  const nodeId = normalizeNodeId(nodeIdHex);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const header = Buffer.concat([MAGIC, Buffer.from([type]), nodeId, len]);
  const hmac = createHmac("sha256", HMAC_KEY).update(header).update(payload).digest();
  return Buffer.concat([header, payload, hmac]);
}

export function parsePacket(buffer) {
  if (buffer.length < 4 + 1 + 32 + 4 + 32) throw new Error("packet too short");
  const magic = buffer.subarray(0, 4);
  if (!magic.equals(MAGIC)) throw new Error("bad magic");
  const type = buffer.readUInt8(4);
  const nodeId = buffer.subarray(5, 37).toString("hex");
  const payloadLen = buffer.readUInt32BE(37);
  const payloadStart = 41;
  const payloadEnd = payloadStart + payloadLen;
  const hmacStart = payloadEnd;
  const hmacEnd = hmacStart + 32;
  if (buffer.length !== hmacEnd) throw new Error("invalid packet length");
  const payload = buffer.subarray(payloadStart, payloadEnd);
  const got = buffer.subarray(hmacStart, hmacEnd);
  const expected = createHmac("sha256", HMAC_KEY)
    .update(buffer.subarray(0, payloadStart))
    .update(payload)
    .digest();
  if (!got.equals(expected)) throw new Error("bad hmac");
  return {
    type,
    nodeId,
    payload: JSON.parse(payload.toString("utf8")),
    checksum: createHash("sha256").update(payload).digest("hex"),
  };
}
