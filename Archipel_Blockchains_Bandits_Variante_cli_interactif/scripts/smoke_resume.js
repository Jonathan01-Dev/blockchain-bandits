import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ArchipelNode } from '../src/core/node.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const base = 9100 + Math.floor(Math.random() * 50);
  const n1 = new ArchipelNode({ port: base });
  const n2 = new ArchipelNode({ port: base + 1 });

  try {
    n1.start();
    n2.start();
    await sleep(2500);

    const tmpFile = path.join('.archipel', 'smoke-resume.bin');
    fs.writeFileSync(tmpFile, crypto.randomBytes(3 * 1024 * 1024));

    const manifest = n1.shareFile(tmpFile);
    await sleep(300);

    const peer = n2.resolvePeerByPrefix(n1.identity.nodeId.slice(0, 12));
    if (!peer) throw new Error('source peer not found');

    const info = await n2.tcp.sendSecureRequest(peer, { op: 'FILE_INFO_REQUEST', fileId: manifest.fileId });
    const check = n2.verifyManifest(info.manifest);
    if (!check.ok) throw new Error(`manifest invalid: ${check.reason}`);

    n2.transfer.acceptManifest(info.manifest, { resume: true });

    // Simulate interruption: fetch only first chunk then stop transfer.
    const first = await n2.tcp.sendSecureRequest(peer, { op: 'CHUNK_REQ', fileId: manifest.fileId, chunkIndex: 0 });
    if (!first?.ok) throw new Error('first chunk request failed');
    if (!n2.verifyChunkSignature(first, peer.publicKeyPem)) throw new Error('first chunk bad signature');
    const firstStore = n2.transfer.receiveChunk(manifest.fileId, 0, first.dataB64, first.hash);
    if (!firstStore.ok) throw new Error('first chunk store failed');

    const before = n2.transfer.getMissingChunkIndexes(manifest.fileId).length;
    if (before <= 0) throw new Error('resume precondition invalid');

    const resumed = await n2.pullFileMulti(manifest.fileId, null, 3);
    const after = n2.transfer.getMissingChunkIndexes(manifest.fileId).length;

    console.log('Resume transfer ok:', resumed.ok, resumed.finalHash === resumed.expectedHash, before > 0, after === 0);
  } finally {
    n1.stop();
    n2.stop();
  }
}

main().catch((err) => {
  console.error('Smoke resume failed:', err.message);
  process.exit(1);
});
