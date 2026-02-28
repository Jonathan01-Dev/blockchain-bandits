import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ArchipelNode } from '../src/core/node.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const base = 9200 + Math.floor(Math.random() * 50);
  const n1 = new ArchipelNode({ port: base });
  const n2 = new ArchipelNode({ port: base + 1 });

  try {
    n1.start();
    n2.start();
    await sleep(2500);

    const tmpFile = path.join('.archipel', 'smoke-retry.bin');
    fs.writeFileSync(tmpFile, crypto.randomBytes(1024 * 1024));
    const manifest = n1.shareFile(tmpFile);

    const original = n2.tcp.sendSecureRequest.bind(n2.tcp);
    let injectedTimeout = false;

    n2.tcp.sendSecureRequest = async (peer, payload, options) => {
      if (!injectedTimeout && payload?.op === 'CHUNK_REQ' && payload?.chunkIndex === 0) {
        injectedTimeout = true;
        throw new Error('Request timeout (injected)');
      }
      return original(peer, payload, options);
    };

    const res = await n2.pullFile(n1.identity.nodeId.slice(0, 12), manifest.fileId);
    const stats = n2.status().stats;

    console.log(
      'Retry flow ok:',
      !!res.ok,
      stats.chunkRetryAttempts >= 1,
      stats.requestTimeouts >= 1,
      stats.chunkRetryAttempts,
      stats.requestTimeouts,
    );
  } finally {
    n1.stop();
    n2.stop();
  }
}

main().catch((err) => {
  console.error('Smoke retry failed:', err.message);
  process.exit(1);
});
