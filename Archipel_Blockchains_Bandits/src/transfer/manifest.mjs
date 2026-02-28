import { createHash, createPublicKey, sign, verify } from "node:crypto";

function canonicalManifest(manifest) {
  return {
    file_id: manifest.file_id,
    filename: manifest.filename,
    size: manifest.size,
    chunk_size: manifest.chunk_size,
    nb_chunks: manifest.nb_chunks,
    chunks: manifest.chunks,
    sender_id: manifest.sender_id,
    sender_pub_key: manifest.sender_pub_key,
  };
}

export function manifestHash(manifest) {
  const canonical = canonicalManifest(manifest);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export function signManifest(manifest, signingKey) {
  const hash = Buffer.from(manifestHash(manifest), "hex");
  return sign(null, hash, signingKey).toString("base64");
}

export function verifyManifestSignature(manifest) {
  const hash = Buffer.from(manifestHash(manifest), "hex");
  return verify(
    null,
    hash,
    createPublicKey(manifest.sender_pub_key),
    Buffer.from(manifest.signature, "base64")
  );
}
