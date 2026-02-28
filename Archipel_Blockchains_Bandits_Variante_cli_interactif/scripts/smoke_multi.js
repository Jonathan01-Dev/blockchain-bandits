import fs from 'node:fs';
import path from 'node:path';
import { ArchipelNode } from '../src/core/node.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const base = 8900 + Math.floor(Math.random() * 100);
  const n1 = new ArchipelNode({ port: base });
  const n2 = new ArchipelNode({ port: base + 1 });
  const n3 = new ArchipelNode({ port: base + 2 });

  try {
    n1.start();
    n2.start();
    n3.start();

    await sleep(2500);

    const tmpFile = path.join('.archipel', 'smoke-multi.bin');
    fs.writeFileSync(tmpFile, Buffer.alloc(2 * 1024 * 1024, 3));

    const m1 = n1.shareFile(tmpFile);
    const m2 = n2.shareFile(tmpFile);
    if (m1.fileId !== m2.fileId) throw new Error('shared file IDs mismatch');

    await sleep(500);

    const sources = n3.findSourcePeers(m1.fileId);
    console.log('Sources before failover:', sources.map((s) => s.tcpPort));
    if (sources.length < 2) throw new Error('Need at least 2 sources for multi test');

    // simulate one source failure before pull
    n2.stop();
    await sleep(200);

    const res = await n3.pullFileMulti(m1.fileId, null, 3);
    console.log('Multi pull with failover ok:', !!res.ok, res.finalHash === res.expectedHash);
  } finally {
    n1.stop();
    n2.stop();
    n3.stop();
  }
}

main().catch((err) => {
  console.error('Smoke multi failed:', err.message);
  process.exit(1);
});
