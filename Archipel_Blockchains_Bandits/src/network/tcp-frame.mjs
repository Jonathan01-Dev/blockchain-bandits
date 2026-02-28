import { createHmac, timingSafeEqual } from "node:crypto";
import { HMAC_KEY } from "./constants.mjs";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const FRAME_HMAC_BYTES = 32;

export function encodeFrame(type, payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8");
  if (payload.length > MAX_FRAME_BYTES) {
    throw new Error(`frame too large: ${payload.length} bytes`);
  }
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payload.length, 1);
  const mac = createHmac("sha256", HMAC_KEY).update(header).update(payload).digest();
  return Buffer.concat([header, payload, mac]);
}

export function decodeFrames(socketState, chunk) {
  socketState.buffer = Buffer.concat([socketState.buffer, chunk]);
  const frames = [];
  while (socketState.buffer.length >= 5) {
    const type = socketState.buffer.readUInt8(0);
    const len = socketState.buffer.readUInt32BE(1);
    if (len > MAX_FRAME_BYTES) {
      throw new Error(`frame length exceeds limit (${len} > ${MAX_FRAME_BYTES})`);
    }
    const totalLen = 5 + len + FRAME_HMAC_BYTES;
    if (socketState.buffer.length < totalLen) break;
    const payloadRaw = socketState.buffer.subarray(5, 5 + len);
    const macGot = socketState.buffer.subarray(5 + len, totalLen);
    const macExpected = createHmac("sha256", HMAC_KEY)
      .update(socketState.buffer.subarray(0, 5))
      .update(payloadRaw)
      .digest();
    socketState.buffer = socketState.buffer.subarray(totalLen);
    if (macGot.length !== macExpected.length || !timingSafeEqual(macGot, macExpected)) {
      throw new Error("invalid frame hmac");
    }
    try {
      frames.push({ type, payload: JSON.parse(payloadRaw.toString("utf8")) });
    } catch {
      throw new Error("invalid frame json");
    }
  }
  return frames;
}
