import { mkdirSync, rmSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadIdentity } from "../src/crypto/keyring.mjs";
import { stageFileForTransfer } from "../src/transfer/chunker.mjs";
import { IndexStore } from "../src/transfer/index-store.mjs";
import { ChunkTransferNode } from "../src/transfer/chunk-transfer-node.mjs";
import { ChunkDownloadManager } from "../src/transfer/download-manager.mjs";
import { ACK_STATUS } from "../src/transfer/protocol.mjs";

function materializeAllChunks({ peerDir, sourceChunkDir, manifest }) {
  mkdirSync(join(peerDir, "chunks", manifest.file_id), { recursive: true });
  for (const c of manifest.chunks) {
    copyFileSync(join(sourceChunkDir, `${c.index}.bin`), join(peerDir, "chunks", manifest.file_id, `${c.index}.bin`));
  }
  return {
    ...manifest,
    chunks: manifest.chunks.map((c) => ({
      ...c,
      path: join(peerDir, "chunks", manifest.file_id, `${c.index}.bin`),
    })),
  };
}

const root = resolve(".archipel/sprint3-corrupt");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const keysScript = resolve("src/crypto/generate-keys.mjs");
for (const n of ["seed1", "seed2", "leech"]) {
  execFileSync(process.execPath, [keysScript, "--node-name", n, "--force"], { stdio: "inherit" });
}

const seed1 = loadIdentity("seed1");
const seed2 = loadIdentity("seed2");
const leech = loadIdentity("leech");

const corruptMb = Math.max(1, Number(process.env.SPRINT3_CORRUPT_MB ?? "6"));
const srcFile = join(root, "source.bin");
writeFileSync(srcFile, randomBytes(corruptMb * 1024 * 1024 + 33));

const sourceManifest = stageFileForTransfer({
  filePath: srcFile,
  chunkSize: 256 * 1024,
  dataDir: join(root, "source"),
  senderId: seed1.nodeId,
  senderPublicPem: seed1.publicPem,
  senderPrivateKey: seed1.privateKey,
});
const sourceChunkDir = join(root, "source", "chunks", sourceManifest.file_id);

const m1 = materializeAllChunks({ peerDir: join(root, "seed1"), sourceChunkDir, manifest: sourceManifest });
const m2 = materializeAllChunks({ peerDir: join(root, "seed2"), sourceChunkDir, manifest: sourceManifest });

const corruptedChunkPath = join(root, "seed1", "chunks", sourceManifest.file_id, "0.bin");
const corruptedRaw = readFileSync(corruptedChunkPath);
writeFileSync(corruptedChunkPath, randomBytes(corruptedRaw.length));

const s1Index = new IndexStore(join(root, "seed1", "index.json"));
const s2Index = new IndexStore(join(root, "seed2", "index.json"));
const dIndex = new IndexStore(join(root, "leech", "index.json"));
s1Index.upsertManifest(m1);
s2Index.upsertManifest(m2);
dIndex.upsertManifest(sourceManifest);

const s1Node = new ChunkTransferNode({ nodeId: seed1.nodeId, privateKey: seed1.privateKey, publicPem: seed1.publicPem, indexStore: s1Index, port: 9961 });
const s2Node = new ChunkTransferNode({ nodeId: seed2.nodeId, privateKey: seed2.privateKey, publicPem: seed2.publicPem, indexStore: s2Index, port: 9962 });
const dNode = new ChunkTransferNode({ nodeId: leech.nodeId, privateKey: leech.privateKey, publicPem: leech.publicPem, indexStore: dIndex, port: 9963 });

await s1Node.start();
await s2Node.start();
await dNode.start();

const corruptedCheck = await dNode.requestChunk({
  host: "127.0.0.1",
  port: 9961,
  fileId: sourceManifest.file_id,
  chunkIdx: 0,
  requesterNodeId: leech.nodeId,
  timeoutMs: 3000,
});
if (corruptedCheck.status !== ACK_STATUS.HASH_MISMATCH) {
  throw new Error(`expected HASH_MISMATCH from corrupted source, got ${corruptedCheck.status}`);
}

const mgr = new ChunkDownloadManager({
  localChunkNode: dNode,
  localNodeId: leech.nodeId,
  manifest: sourceManifest,
  peers: [
    { node_id: seed1.nodeId, host: "127.0.0.1", port: 9961 },
    { node_id: seed2.nodeId, host: "127.0.0.1", port: 9962 },
  ],
  peerChunkMap: {
    [seed1.nodeId]: sourceManifest.chunks.map((c) => c.index),
    [seed2.nodeId]: sourceManifest.chunks.map((c) => c.index),
  },
  outputDir: join(root, "leech", "downloads"),
  parallel: 3,
});

const result = await mgr.download();

await s1Node.stop();
await s2Node.stop();
await dNode.stop();

if (result.fileHash !== sourceManifest.file_id) {
  throw new Error("file hash mismatch after corrupt fallback");
}

console.log(`file_hash=${result.fileHash}`);
console.log(`size=${result.size}`);
console.log(`source_mb=${corruptMb}`);
console.log("Sprint 3 corrupt-chunk check passed");
