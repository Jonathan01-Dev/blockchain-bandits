import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Buffer } from "./hash.mjs";

function sortByRarest(pending, availability) {
  return [...pending].sort((a, b) => {
    const da = (availability.get(a) ?? []).length;
    const db = (availability.get(b) ?? []).length;
    return da - db || a - b;
  });
}

export class ChunkDownloadManager {
  constructor({
    localChunkNode,
    localNodeId,
    manifest,
    peers,
    peerChunkMap,
    outputDir = ".archipel/downloads",
    parallel = 3,
    maxAttemptsPerChunk = 8,
    requestTimeoutMs = 1500,
  }) {
    this.localChunkNode = localChunkNode;
    this.localNodeId = localNodeId;
    this.manifest = manifest;
    this.peers = peers;
    this.peerChunkMap = peerChunkMap;
    this.outputDir = resolve(outputDir);
    this.parallel = Math.max(1, parallel);
    this.maxAttemptsPerChunk = maxAttemptsPerChunk;
    this.requestTimeoutMs = requestTimeoutMs;
    this.chunkMetaByIndex = new Map(this.manifest.chunks.map((c) => [c.index, c]));
  }

  buildAvailability() {
    const map = new Map();
    for (const c of this.manifest.chunks) map.set(c.index, []);
    for (const peer of this.peers) {
      const available = this.peerChunkMap[peer.node_id] ?? [];
      for (const idx of available) {
        if (map.has(idx)) map.get(idx).push(peer);
      }
    }
    return map;
  }

  chunkDir() {
    return join(this.outputDir, this.manifest.file_id);
  }

  assemblePath() {
    return join(this.outputDir, this.manifest.filename);
  }

  async download() {
    mkdirSync(this.chunkDir(), { recursive: true });
    const pending = new Set(this.manifest.chunks.map((c) => c.index));
    const inProgress = new Set();
    const done = new Map();
    const attempts = new Map();
    const availability = this.buildAvailability();
    const peerFailures = new Map(this.peers.map((p) => [p.node_id, 0]));

    const pickNext = () => {
      for (const idx of sortByRarest(pending, availability)) {
        if (!inProgress.has(idx)) return idx;
      }
      return null;
    };

    const worker = async () => {
      while (pending.size > 0) {
        const idx = pickNext();
        if (idx === null) break;
        inProgress.add(idx);
        pending.delete(idx);

        try {
          const chunkMeta = this.chunkMetaByIndex.get(idx);
          if (!chunkMeta) {
            throw new Error(`missing chunk metadata for index ${idx}`);
          }
          const peersForChunk = [...(availability.get(idx) ?? [])].sort(
            (a, b) => (peerFailures.get(a.node_id) ?? 0) - (peerFailures.get(b.node_id) ?? 0)
          );
          let success = false;

          for (const peer of peersForChunk) {
            try {
              const res = await this.localChunkNode.requestChunk({
                host: peer.host,
                port: peer.port,
                fileId: this.manifest.file_id,
                chunkIdx: idx,
                requesterNodeId: this.localNodeId,
                timeoutMs: this.requestTimeoutMs,
              });
              if (!res.ok) {
                peerFailures.set(peer.node_id, (peerFailures.get(peer.node_id) ?? 0) + 1);
                continue;
              }
              if (sha256Buffer(res.data) !== chunkMeta.hash) continue;
              const chunkPath = join(this.chunkDir(), `${idx}.bin`);
              writeFileSync(chunkPath, res.data);
              done.set(idx, chunkPath);
              success = true;
              break;
            } catch {
              peerFailures.set(peer.node_id, (peerFailures.get(peer.node_id) ?? 0) + 1);
              // fallback to next peer
            }
          }

          if (!success) {
            const n = (attempts.get(idx) ?? 0) + 1;
            attempts.set(idx, n);
            if (n >= this.maxAttemptsPerChunk) {
              throw new Error(`chunk ${idx} failed after ${n} attempts`);
            }
            pending.add(idx);
          }
        } finally {
          inProgress.delete(idx);
        }
      }
    };

    await Promise.all(new Array(this.parallel).fill(0).map(() => worker()));
    if (done.size !== this.manifest.nb_chunks) {
      throw new Error(`download incomplete: ${done.size}/${this.manifest.nb_chunks}`);
    }
    return this.reassemble();
  }

  reassemble() {
    const ordered = [];
    for (let i = 0; i < this.manifest.nb_chunks; i += 1) {
      const part = readFileSync(join(this.chunkDir(), `${i}.bin`));
      ordered.push(part);
    }
    const fileRaw = Buffer.concat(ordered);
    const fileHash = sha256Buffer(fileRaw);
    if (fileHash !== this.manifest.file_id) {
      throw new Error("file hash mismatch after reassembly");
    }
    const out = this.assemblePath();
    writeFileSync(out, fileRaw);
    return { outputPath: out, fileHash, size: fileRaw.length };
  }
}
