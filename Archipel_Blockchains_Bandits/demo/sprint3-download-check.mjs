import { mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadIdentity } from "../src/crypto/keyring.mjs";
import { stageFileForTransfer } from "../src/transfer/chunker.mjs";
import { IndexStore } from "../src/transfer/index-store.mjs";
import { ChunkTransferNode } from "../src/transfer/chunk-transfer-node.mjs";
import { ChunkDownloadManager } from "../src/transfer/download-manager.mjs";

function splitIndices(nbChunks) {
  const a = [];
  const b = [];
  const c = [];
  for (let i = 0; i < nbChunks; i += 1) {
    if (i % 3 === 0) a.push(i);
    if (i % 3 === 1) b.push(i);
    if (i % 3 === 2) c.push(i);
    if (i % 5 === 0) b.push(i); // redundancy for fallback
    if (i % 7 === 0) c.push(i); // redundancy for fallback
  }
  return {
    seed1: [...new Set(a)],
    seed2: [...new Set(b)],
    seed3: [...new Set(c)],
  };
}

function materializePeerChunks({ peerDir, sourceChunkDir, manifest, keepIndices }) {
  mkdirSync(join(peerDir, "chunks", manifest.file_id), { recursive: true });
  for (const idx of keepIndices) {
    const src = join(sourceChunkDir, `${idx}.bin`);
    const dst = join(peerDir, "chunks", manifest.file_id, `${idx}.bin`);
    copyFileSync(src, dst);
  }
  const peerManifest = {
    ...manifest,
    chunks: manifest.chunks.map((c) => ({
      ...c,
      path: keepIndices.includes(c.index)
        ? join(peerDir, "chunks", manifest.file_id, `${c.index}.bin`)
        : join(peerDir, "chunks", manifest.file_id, `${c.index}.bin`),
    })),
  };
  return peerManifest;
}

const root = resolve(".archipel/sprint3-download");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const keysScript = resolve("src/crypto/generate-keys.mjs");
for (const n of ["seed1", "seed2", "seed3", "leech"]) {
  execFileSync(process.execPath, [keysScript, "--node-name", n, "--force"], { stdio: "inherit" });
}

const seed1 = loadIdentity("seed1");
const seed2 = loadIdentity("seed2");
const seed3 = loadIdentity("seed3");
const leech = loadIdentity("leech");

const downloadMb = Math.max(1, Number(process.env.SPRINT3_DOWNLOAD_MB ?? "4"));
const srcFile = join(root, "source.bin");
writeFileSync(srcFile, randomBytes(downloadMb * 1024 * 1024 + 7));

const sourceManifest = stageFileForTransfer({
  filePath: srcFile,
  chunkSize: 128 * 1024,
  dataDir: join(root, "source"),
  senderId: seed1.nodeId,
  senderPublicPem: seed1.publicPem,
  senderPrivateKey: seed1.privateKey,
});
const sourceChunkDir = join(root, "source", "chunks", sourceManifest.file_id);
const split = splitIndices(sourceManifest.nb_chunks);

const m1 = materializePeerChunks({
  peerDir: join(root, "seed1"),
  sourceChunkDir,
  manifest: sourceManifest,
  keepIndices: split.seed1,
});
const m2 = materializePeerChunks({
  peerDir: join(root, "seed2"),
  sourceChunkDir,
  manifest: sourceManifest,
  keepIndices: split.seed2,
});
const m3 = materializePeerChunks({
  peerDir: join(root, "seed3"),
  sourceChunkDir,
  manifest: sourceManifest,
  keepIndices: split.seed3,
});

const s1Index = new IndexStore(join(root, "seed1", "index.json"));
const s2Index = new IndexStore(join(root, "seed2", "index.json"));
const s3Index = new IndexStore(join(root, "seed3", "index.json"));
s1Index.upsertManifest(m1);
s2Index.upsertManifest(m2);
s3Index.upsertManifest(m3);

const dIndex = new IndexStore(join(root, "leech", "index.json"));
dIndex.upsertManifest(sourceManifest);

const s1Node = new ChunkTransferNode({
  nodeId: seed1.nodeId,
  privateKey: seed1.privateKey,
  publicPem: seed1.publicPem,
  indexStore: s1Index,
  port: 9921,
});
const s2Node = new ChunkTransferNode({
  nodeId: seed2.nodeId,
  privateKey: seed2.privateKey,
  publicPem: seed2.publicPem,
  indexStore: s2Index,
  port: 9922,
});
const s3Node = new ChunkTransferNode({
  nodeId: seed3.nodeId,
  privateKey: seed3.privateKey,
  publicPem: seed3.publicPem,
  indexStore: s3Index,
  port: 9923,
});
const dNode = new ChunkTransferNode({
  nodeId: leech.nodeId,
  privateKey: leech.privateKey,
  publicPem: leech.publicPem,
  indexStore: dIndex,
  port: 9924,
});

await s1Node.start();
await s2Node.start();
await s3Node.start();
await dNode.start();

const mgr = new ChunkDownloadManager({
  localChunkNode: dNode,
  localNodeId: leech.nodeId,
  manifest: sourceManifest,
  peers: [
    { node_id: seed1.nodeId, host: "127.0.0.1", port: 9921 },
    { node_id: seed2.nodeId, host: "127.0.0.1", port: 9922 },
    { node_id: seed3.nodeId, host: "127.0.0.1", port: 9923 },
  ],
  peerChunkMap: {
    [seed1.nodeId]: split.seed1,
    [seed2.nodeId]: split.seed2,
    [seed3.nodeId]: split.seed3,
  },
  outputDir: join(root, "leech", "downloads"),
  parallel: 3,
});

const result = await mgr.download();

await s1Node.stop();
await s2Node.stop();
await s3Node.stop();
await dNode.stop();

console.log(`file_hash=${result.fileHash}`);
console.log(`size=${result.size}`);
console.log(`source_mb=${downloadMb}`);
console.log("Sprint 3 download check passed");
