export function encodeFrame(type, payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

export function decodeFrames(socketState, chunk) {
  socketState.buffer = Buffer.concat([socketState.buffer, chunk]);
  const frames = [];
  while (socketState.buffer.length >= 5) {
    const type = socketState.buffer.readUInt8(0);
    const len = socketState.buffer.readUInt32BE(1);
    if (socketState.buffer.length < 5 + len) break;
    const payloadRaw = socketState.buffer.subarray(5, 5 + len);
    socketState.buffer = socketState.buffer.subarray(5 + len);
    frames.push({ type, payload: JSON.parse(payloadRaw.toString("utf8")) });
  }
  return frames;
}
