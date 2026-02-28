import { mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  return { seed1: groups[0], seed2: groups[1], seed3: groups[2] };
}

function materializePeerChunks({ peerDir, sourceChunkDir, manifest, keepIndices }) {
  mkdirSync(join(peerDir, "chunks", manifest.file_id), { recursive: true });
  for (const idx of keepIndices) {
    copyFileSync(join(sourceChunkDir, `${idx}.bin`), join(peerDir, "chunks", manifest.file_id, `${idx}.bin`));
  }
  return {
    ...manifest,
    chunks: manifest.chunks.map((c) => ({
      ...c,
      path: join(peerDir, "chunks", manifest.file_id, `${c.index}.bin`),
    })),
  };
}

const root = resolve(".archipel/sprint3-multi-receivers");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const keysScript = resolve("src/crypto/generate-keys.mjs");
for (const n of ["seed1", "seed2", "seed3", "leech-a", "leech-b"]) {
  execFileSync(process.execPath, [keysScript, "--node-name", n, "--force"], { stdio: "inherit" });
}

const seed1 = loadIdentity("seed1");
const seed2 = loadIdentity("seed2");
const seed3 = loadIdentity("seed3");
const leechA = loadIdentity("leech-a");
const leechB = loadIdentity("leech-b");

const multiMb = Math.max(1, Number(process.env.SPRINT3_MULTI_MB ?? "12"));
const srcFile = join(root, `source_${multiMb}mb.bin`);
writeFileSync(srcFile, randomBytes(multiMb * 1024 * 1024));

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

const m1 = materializePeerChunks({ peerDir: join(root, "seed1"), sourceChunkDir, manifest: sourceManifest, keepIndices: split.seed1 });
const m2 = materializePeerChunks({ peerDir: join(root, "seed2"), sourceChunkDir, manifest: sourceManifest, keepIndices: split.seed2 });
const m3 = materializePeerChunks({ peerDir: join(root, "seed3"), sourceChunkDir, manifest: sourceManifest, keepIndices: split.seed3 });

const s1Index = new IndexStore(join(root, "seed1", "index.json"));
const s2Index = new IndexStore(join(root, "seed2", "index.json"));
const s3Index = new IndexStore(join(root, "seed3", "index.json"));
s1Index.upsertManifest(m1);
s2Index.upsertManifest(m2);
s3Index.upsertManifest(m3);

const aIndex = new IndexStore(join(root, "leech-a", "index.json"));
const bIndex = new IndexStore(join(root, "leech-b", "index.json"));
aIndex.upsertManifest(sourceManifest);
bIndex.upsertManifest(sourceManifest);

const s1Node = new ChunkTransferNode({ nodeId: seed1.nodeId, privateKey: seed1.privateKey, publicPem: seed1.publicPem, indexStore: s1Index, port: 9951 });
const s2Node = new ChunkTransferNode({ nodeId: seed2.nodeId, privateKey: seed2.privateKey, publicPem: seed2.publicPem, indexStore: s2Index, port: 9952 });
const s3Node = new ChunkTransferNode({ nodeId: seed3.nodeId, privateKey: seed3.privateKey, publicPem: seed3.publicPem, indexStore: s3Index, port: 9953 });
const aNode = new ChunkTransferNode({ nodeId: leechA.nodeId, privateKey: leechA.privateKey, publicPem: leechA.publicPem, indexStore: aIndex, port: 9954 });
const bNode = new ChunkTransferNode({ nodeId: leechB.nodeId, privateKey: leechB.privateKey, publicPem: leechB.publicPem, indexStore: bIndex, port: 9955 });

await s1Node.start();
await s2Node.start();
await s3Node.start();
await aNode.start();
await bNode.start();

const peers = [
  { node_id: seed1.nodeId, host: "127.0.0.1", port: 9951 },
  { node_id: seed2.nodeId, host: "127.0.0.1", port: 9952 },
  { node_id: seed3.nodeId, host: "127.0.0.1", port: 9953 },
];
const peerChunkMap = {
  [seed1.nodeId]: split.seed1,
  [seed2.nodeId]: split.seed2,
  [seed3.nodeId]: split.seed3,
};

const mgrA = new ChunkDownloadManager({
  localChunkNode: aNode,
  localNodeId: leechA.nodeId,
  manifest: sourceManifest,
  peers,
  peerChunkMap,
  outputDir: join(root, "leech-a", "downloads"),
  parallel: 3,
});

const mgrB = new ChunkDownloadManager({
  localChunkNode: bNode,
  localNodeId: leechB.nodeId,
  manifest: sourceManifest,
  peers,
  peerChunkMap,
  outputDir: join(root, "leech-b", "downloads"),
  parallel: 3,
});

const [resA, resB] = await Promise.all([mgrA.download(), mgrB.download()]);

await s1Node.stop();
await s2Node.stop();
await s3Node.stop();
await aNode.stop();
await bNode.stop();

if (resA.fileHash !== sourceManifest.file_id) throw new Error("leech-a hash mismatch");
if (resB.fileHash !== sourceManifest.file_id) throw new Error("leech-b hash mismatch");

console.log(`file_hash=${sourceManifest.file_id}`);
console.log(`leech_a_size=${resA.size}`);
console.log(`leech_b_size=${resB.size}`);
console.log(`source_mb=${multiMb}`);
console.log("Sprint 3 multi-receivers check passed");
