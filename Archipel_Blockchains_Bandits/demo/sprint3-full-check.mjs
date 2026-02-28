import { mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { loadIdentity } from "../src/crypto/keyring.mjs";
import { stageFileForTransfer } from "../src/transfer/chunker.mjs";
import { IndexStore } from "../src/transfer/index-store.mjs";
import { ChunkTransferNode } from "../src/transfer/chunk-transfer-node.mjs";
import { ChunkDownloadManager } from "../src/transfer/download-manager.mjs";

function assignTwoCopies(nbChunks) {
  const groups = [[], [], []];
  for (let i = 0; i < nbChunks; i += 1) {
    const a = i % 3;
    const b = (i + 1) % 3;
    groups[a].push(i);
    groups[b].push(i);
  }
  return {
    seed1: groups[0],
    seed2: groups[1],
    seed3: groups[2],
  };
}

function materializePeerChunks({ peerDir, sourceChunkDir, manifest, keepIndices }) {
  mkdirSync(join(peerDir, "chunks", manifest.file_id), { recursive: true });
  for (const idx of keepIndices) {
    const src = join(sourceChunkDir, `${idx}.bin`);
    const dst = join(peerDir, "chunks", manifest.file_id, `${idx}.bin`);
    copyFileSync(src, dst);
  }
  return {
    ...manifest,
    chunks: manifest.chunks.map((c) => ({
      ...c,
      path: join(peerDir, "chunks", manifest.file_id, `${c.index}.bin`),
    })),
  };
}

const root = resolve(".archipel/sprint3-full");
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

const fullMb = Math.max(1, Number(process.env.SPRINT3_FULL_MB ?? "50"));
const srcFile = join(root, `source_${fullMb}mb.bin`);
writeFileSync(srcFile, randomBytes(fullMb * 1024 * 1024));

const sourceManifest = stageFileForTransfer({
  filePath: srcFile,
  chunkSize: 512 * 1024,
  dataDir: join(root, "source"),
  senderId: seed1.nodeId,
  senderPublicPem: seed1.publicPem,
  senderPrivateKey: seed1.privateKey,
});
const sourceChunkDir = join(root, "source", "chunks", sourceManifest.file_id);
const split = assignTwoCopies(sourceManifest.nb_chunks);
const basePort = Math.max(20000, Number(process.env.SPRINT3_FULL_BASE_PORT ?? String(39000 + (process.pid % 1000))));

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
  port: basePort,
});
const s2Node = new ChunkTransferNode({
  nodeId: seed2.nodeId,
  privateKey: seed2.privateKey,
  publicPem: seed2.publicPem,
  indexStore: s2Index,
  port: basePort + 1,
});
const s3Node = new ChunkTransferNode({
  nodeId: seed3.nodeId,
  privateKey: seed3.privateKey,
  publicPem: seed3.publicPem,
  indexStore: s3Index,
  port: basePort + 2,
});
const dNode = new ChunkTransferNode({
  nodeId: leech.nodeId,
  privateKey: leech.privateKey,
  publicPem: leech.publicPem,
  indexStore: dIndex,
  port: basePort + 3,
});

let killer = null;
let result = null;
let ms = 0;

try {
  await s1Node.start();
  await s2Node.start();
  await s3Node.start();
  await dNode.start();

  killer = setTimeout(async () => {
    await s2Node.stop();
    console.log("seed2 disconnected during transfer");
  }, 1200);

  const t0 = performance.now();
  const mgr = new ChunkDownloadManager({
    localChunkNode: dNode,
    localNodeId: leech.nodeId,
    manifest: sourceManifest,
    peers: [
      { node_id: seed1.nodeId, host: "127.0.0.1", port: basePort },
      { node_id: seed2.nodeId, host: "127.0.0.1", port: basePort + 1 },
      { node_id: seed3.nodeId, host: "127.0.0.1", port: basePort + 2 },
    ],
    peerChunkMap: {
      [seed1.nodeId]: split.seed1,
      [seed2.nodeId]: split.seed2,
      [seed3.nodeId]: split.seed3,
    },
    outputDir: join(root, "leech", "downloads"),
    parallel: 3,
  });
  result = await mgr.download();
  ms = performance.now() - t0;
} finally {
  if (killer) clearTimeout(killer);
  await Promise.allSettled([s1Node.stop(), s2Node.stop(), s3Node.stop(), dNode.stop()]);
}

if (!result) throw new Error("download did not produce a result");
if (result.fileHash !== sourceManifest.file_id) throw new Error("final SHA mismatch");

console.log(`file_hash=${result.fileHash}`);
console.log(`size=${result.size}`);
console.log(`source_mb=${fullMb}`);
console.log(`duration_ms=${Math.round(ms)}`);
console.log(`base_port=${basePort}`);
console.log("Sprint 3 full check passed");
