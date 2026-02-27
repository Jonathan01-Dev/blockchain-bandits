import { ArchipelNode } from '../src/core/node.js';
import net from 'node:net';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tcpPing(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => socket.write('PING\n'));
    socket.on('data', (buf) => {
      resolve(buf.toString('utf8').trim());
      socket.end();
    });
    socket.on('error', reject);
    socket.setTimeout(5000, () => {
      reject(new Error('timeout'));
      socket.destroy();
    });
  });
}

async function main() {
  const n1 = new ArchipelNode({ port: 7777 });
  const n2 = new ArchipelNode({ port: 7778 });
  const n3 = new ArchipelNode({ port: 7779 });

  try {
    n1.start();
    n2.start();
    n3.start();

    await sleep(2500);

    const p1 = n1.listPeers();
    const p2 = n2.listPeers();
    const p3 = n3.listPeers();

    console.log('Peers:', p1.length, p2.length, p3.length);
    if (p1.length < 2 || p2.length < 2 || p3.length < 2) {
      throw new Error('Discovery failed: expected each node to discover 2 peers');
    }

    const pong = await tcpPing('127.0.0.1', 7777);
    console.log('TCP ping reply:', pong);
    if (pong !== 'PONG') throw new Error('TCP ping response invalid');

    console.log('Sprint 1 smoke OK');
  } finally {
    n1.stop();
    n2.stop();
    n3.stop();
  }
}

main().catch((err) => {
  console.error('Sprint 1 smoke FAILED:', err.message);
  process.exit(1);
});
