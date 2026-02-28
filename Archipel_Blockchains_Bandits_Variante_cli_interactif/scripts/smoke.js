import fs from 'node:fs';
import path from 'node:path';
import { ArchipelNode } from '../src/core/node.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const base = 8600 + Math.floor(Math.random() * 200);
  const n1 = new ArchipelNode({ port: base });
  const n2 = new ArchipelNode({ port: base + 1 });

  try {
    n1.start();
    n2.start();

    await sleep(2500);

    const peers1 = n1.listPeers();
    const peers2 = n2.listPeers();
    console.log('Peers n1:', peers1.length, 'Peers n2:', peers2.length);

    const target = peers1.find((p) => p.tcpPort === base + 1);
    if (!target) throw new Error('Node2 not discovered by Node1');

    const msgAck = await n1.sendMessage(target.nodeId.slice(0, 12), 'smoke-hello');
    console.log('MSG ACK:', msgAck?.ok);

    const tmpFile = path.join('.archipel', 'smoke.bin');
    const sample = Buffer.alloc(1024 * 1024, 7);
    fs.writeFileSync(tmpFile, sample);

    const shared = n1.shareFile(tmpFile);
    const pullRes = await n2.pullFile(n1.identity.nodeId.slice(0, 12), shared.fileId);
    console.log('Pull transfer ok:', !!pullRes?.ok);

    const sendRes = await n1.sendFile(target.nodeId.slice(0, 12), tmpFile);
    console.log('Push transfer ok:', !!sendRes.finalize?.ok);
  } finally {
    n1.stop();
    n2.stop();
  }
}

main().catch((err) => {
  console.error('Smoke failed:', err.message);
  process.exit(1);
});
