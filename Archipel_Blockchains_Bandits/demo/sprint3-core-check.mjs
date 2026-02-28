import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadIdentity } from "../src/crypto/keyring.mjs";
import { stageFileForTransfer } from "../src/transfer/chunker.mjs";
import { IndexStore } from "../src/transfer/index-store.mjs";
import { verifyManifestSignature } from "../src/transfer/manifest.mjs";

const root = resolve(".archipel/sprint3-core");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const keysScript = resolve("src/crypto/generate-keys.mjs");
execFileSync(process.execPath, [keysScript, "--node-name", "sender", "--force"], { stdio: "inherit" });
const sender = loadIdentity("sender");

const srcFile = join(root, "sample.bin");
writeFileSync(srcFile, randomBytes(1024 * 1024 + 333));

const manifest = stageFileForTransfer({
  filePath: srcFile,
  chunkSize: 64 * 1024,
  dataDir: root,
  senderId: sender.nodeId,
  senderPublicPem: sender.publicPem,
  senderPrivateKey: sender.privateKey,
});

const index = new IndexStore(join(root, "index.json"));
index.upsertManifest(manifest);

if (manifest.nb_chunks < 2) throw new Error("expected multiple chunks");
if (!verifyManifestSignature(manifest)) throw new Error("manifest signature invalid");
if (!index.getManifest(manifest.file_id)) throw new Error("manifest not persisted");

console.log(`file_id=${manifest.file_id}`);
console.log(`nb_chunks=${manifest.nb_chunks}`);
console.log(`first_chunk_hash=${manifest.chunks[0].hash}`);
console.log("Sprint 3 core check passed");
