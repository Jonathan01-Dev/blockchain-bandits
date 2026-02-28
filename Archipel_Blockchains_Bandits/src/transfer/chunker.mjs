import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { sha256Buffer, sha256File } from "./hash.mjs";
import { signManifest } from "./manifest.mjs";

export function chunkBuffer(buffer, chunkSize) {
  const chunks = [];
  for (let offset = 0, index = 0; offset < buffer.length; offset += chunkSize, index += 1) {
    const part = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
    chunks.push({
      index,
      size: part.length,
      hash: sha256Buffer(part),
      data: part,
    });
  }
  return chunks;
}

export function stageFileForTransfer({
  filePath,
  chunkSize = 512 * 1024,
  dataDir = ".archipel",
  senderId,
  senderPublicPem,
  senderPrivateKey,
}) {
  const absFile = resolve(filePath);
  const fileRaw = readFileSync(absFile);
  const fileId = sha256File(absFile);
  const filename = basename(absFile);

  const stagedDir = join(resolve(dataDir), "chunks", fileId);
  mkdirSync(stagedDir, { recursive: true });

  const chunkParts = chunkBuffer(fileRaw, chunkSize);
  const chunks = chunkParts.map((part) => {
    const chunkPath = join(stagedDir, `${part.index}.bin`);
    writeFileSync(chunkPath, part.data);
    return {
      index: part.index,
      hash: part.hash,
      size: part.size,
      path: chunkPath,
    };
  });

  const manifest = {
    file_id: fileId,
    filename,
    size: fileRaw.length,
    chunk_size: chunkSize,
    nb_chunks: chunks.length,
    chunks: chunks.map(({ index, hash, size, path }) => ({ index, hash, size, path })),
    sender_id: senderId,
    sender_pub_key: senderPublicPem,
  };
  manifest.signature = signManifest(manifest, senderPrivateKey);
  return manifest;
}
