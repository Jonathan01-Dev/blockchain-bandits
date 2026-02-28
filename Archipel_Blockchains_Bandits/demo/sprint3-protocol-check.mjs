import { once } from "node:events";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadIdentity } from "../src/crypto/keyring.mjs";
import { stageFileForTransfer } from "../src/transfer/chunker.mjs";
import { IndexStore } from "../src/transfer/index-store.mjs";
import { ChunkTransferNode } from "../src/transfer/chunk-transfer-node.mjs";
import { ACK_STATUS } from "../src/transfer/protocol.mjs";

const root = resolve(".archipel/sprint3-protocol");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const keysScript = resolve("src/crypto/generate-keys.mjs");
execFileSync(process.execPath, [keysScript, "--node-name", "seed", "--force"], { stdio: "inherit" });
execFileSync(process.execPath, [keysScript, "--node-name", "leech", "--force"], { stdio: "inherit" });

const seed = loadIdentity("seed");
const leech = loadIdentity("leech");

const srcFile = join(root, "input.bin");
writeFileSync(srcFile, randomBytes(512 * 1024 + 111));

const seedManifest = stageFileForTransfer({
  filePath: srcFile,
  chunkSize: 64 * 1024,
  dataDir: join(root, "seed"),
  senderId: seed.nodeId,
  senderPublicPem: seed.publicPem,
  senderPrivateKey: seed.privateKey,
});

const seedIndex = new IndexStore(join(root, "seed", "index.json"));
seedIndex.upsertManifest(seedManifest);
const leechIndex = new IndexStore(join(root, "leech", "index.json"));
leechIndex.upsertManifest(seedManifest);

const seedNode = new ChunkTransferNode({
  nodeId: seed.nodeId,
  privateKey: seed.privateKey,
  publicPem: seed.publicPem,
  indexStore: seedIndex,
  port: 9911,
});
const leechNode = new ChunkTransferNode({
  nodeId: leech.nodeId,
  privateKey: leech.privateKey,
  publicPem: leech.publicPem,
  indexStore: leechIndex,
  port: 9912,
});

await seedNode.start();
await leechNode.start();

const ackPromise = once(seedNode, "ack");
const res = await leechNode.requestChunk({
  host: "127.0.0.1",
  port: 9911,
  fileId: seedManifest.file_id,
  chunkIdx: 0,
  requesterNodeId: leech.nodeId,
});
const [ack] = await ackPromise;

if (!res.ok) throw new Error("expected successful chunk download");
if (ack.status !== ACK_STATUS.OK) throw new Error("expected ACK OK from requester");

const notFound = await leechNode.requestChunk({
  host: "127.0.0.1",
  port: 9911,
  fileId: seedManifest.file_id,
  chunkIdx: 9999,
  requesterNodeId: leech.nodeId,
});
if (notFound.status !== ACK_STATUS.NOT_FOUND) throw new Error("expected NOT_FOUND status");

await seedNode.stop();
await leechNode.stop();

console.log(`file_id=${seedManifest.file_id}`);
console.log(`chunk0_hash=${res.chunkHash}`);
console.log("Sprint 3 protocol check passed");
