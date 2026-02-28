import { EventEmitter } from "node:events";
import net from "node:net";
import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { decodeFrames, encodeFrame } from "../network/tcp-frame.mjs";
import { ACK_STATUS, TRANSFER_FRAME_TYPE } from "./protocol.mjs";

function waitForFrame(state, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting frame ${type}`)), timeoutMs);
    const queued = state.frames.findIndex((f) => f.type === type);
    if (queued >= 0) {
      clearTimeout(timer);
      resolve(state.frames.splice(queued, 1)[0]);
      return;
    }
    state.waiters.push({
      type,
      done: (err, frame) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(frame);
      },
    });
  });
}

function feedFrames(state, chunk) {
  for (const frame of decodeFrames(state, chunk)) {
    const waiterIdx = state.waiters.findIndex((w) => w.type === frame.type);
    if (waiterIdx >= 0) {
      const w = state.waiters.splice(waiterIdx, 1)[0];
      w.done(null, frame);
    } else {
      state.frames.push(frame);
    }
  }
}

function dataHash(dataBuffer) {
  return createHash("sha256").update(dataBuffer).digest();
}

export class ChunkTransferNode extends EventEmitter {
  constructor({ nodeId, privateKey, indexStore, host = "127.0.0.1", port }) {
    super();
    this.nodeId = nodeId;
    this.privateKey = privateKey;
    this.indexStore = indexStore;
    this.host = host;
    this.port = Number(port);
    this.server = null;
  }

  log(msg) {
    console.log(`[chunk-node:${this.port}] ${msg}`);
  }

  async start() {
    this.server = net.createServer((socket) => this.handleIncoming(socket));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => resolve());
    });
    this.log("listening");
  }

  async stop() {
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(() => resolve()));
    this.log("stopped");
  }

  async handleIncoming(socket) {
    const state = { buffer: Buffer.alloc(0), frames: [], waiters: [] };
    socket.on("data", (chunk) => feedFrames(state, chunk));
    socket.on("error", () => {});
    try {
      const reqFrame = await waitForFrame(state, TRANSFER_FRAME_TYPE.CHUNK_REQ, 15000);
      const req = reqFrame.payload;
      const manifest = this.indexStore.getManifest(req.file_id);
      const chunk = manifest?.chunks?.find((c) => c.index === req.chunk_idx);

      if (!manifest || !chunk) {
        socket.write(
          encodeFrame(TRANSFER_FRAME_TYPE.ACK, {
            chunk_idx: req.chunk_idx,
            status: ACK_STATUS.NOT_FOUND,
          })
        );
        socket.end();
        return;
      }

      const raw = readFileSync(chunk.path);
      const signature = sign(null, dataHash(raw), this.privateKey).toString("base64");
      socket.write(
        encodeFrame(TRANSFER_FRAME_TYPE.CHUNK_DATA, {
          file_id: req.file_id,
          chunk_idx: req.chunk_idx,
          data: raw.toString("base64"),
          chunk_hash: chunk.hash,
          signature,
          sender_id: this.nodeId,
        })
      );

      const ack = await waitForFrame(state, TRANSFER_FRAME_TYPE.ACK, 10000);
      this.emit("ack", ack.payload);
      socket.end();
    } catch (err) {
      this.log(`incoming error: ${err.message}`);
      socket.destroy();
    }
  }

  async requestChunk({ host, port, fileId, chunkIdx, requesterNodeId, timeoutMs = 10000 }) {
    const socket = net.createConnection({ host, port: Number(port) });
    const state = { buffer: Buffer.alloc(0), frames: [], waiters: [] };
    socket.on("data", (chunk) => feedFrames(state, chunk));
    socket.on("error", () => {});

    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });

    socket.write(
      encodeFrame(TRANSFER_FRAME_TYPE.CHUNK_REQ, {
        file_id: fileId,
        chunk_idx: chunkIdx,
        requester: requesterNodeId,
      })
    );

    const next = await Promise.race([
      waitForFrame(state, TRANSFER_FRAME_TYPE.CHUNK_DATA, timeoutMs),
      waitForFrame(state, TRANSFER_FRAME_TYPE.ACK, timeoutMs),
    ]);

    if (next.type === TRANSFER_FRAME_TYPE.ACK) {
      socket.end();
      return { ok: false, status: next.payload.status };
    }

    const payload = next.payload;
    const manifest = this.indexStore.getManifest(fileId);
    const expected = manifest?.chunks?.find((c) => c.index === chunkIdx);
    const data = Buffer.from(payload.data, "base64");

    const chunkHashOk = createHash("sha256").update(data).digest("hex") === payload.chunk_hash;
    const expectedHashOk = expected ? expected.hash === payload.chunk_hash : true;
    const sigOk = manifest
      ? verify(
          null,
          dataHash(data),
          createPublicKey(manifest.sender_pub_key),
          Buffer.from(payload.signature, "base64")
        )
      : false;

    const valid = chunkHashOk && expectedHashOk && sigOk;
    socket.write(
      encodeFrame(TRANSFER_FRAME_TYPE.ACK, {
        chunk_idx: chunkIdx,
        status: valid ? ACK_STATUS.OK : ACK_STATUS.HASH_MISMATCH,
      })
    );
    socket.end();

    return {
      ok: valid,
      status: valid ? ACK_STATUS.OK : ACK_STATUS.HASH_MISMATCH,
      data,
      chunkHash: payload.chunk_hash,
    };
  }
}
