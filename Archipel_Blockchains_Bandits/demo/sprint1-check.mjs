import { ArchipelNode } from "../src/network/archipel-node.mjs";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const base = {
  mcastIp: "239.255.42.99",
  mcastPort: 6000,
  discoveryIntervalSec: 5,
  peerTimeoutSec: 20,
  keepAliveSec: 15,
  dataDir: ".archipel",
  keysDir: ".archipel/keys",
};

const nodes = [
  new ArchipelNode({ ...base, nodeName: "node-1", tcpPort: 7777 }),
  new ArchipelNode({ ...base, nodeName: "node-2", tcpPort: 7778 }),
  new ArchipelNode({ ...base, nodeName: "node-3", tcpPort: 7779 }),
];

for (const n of nodes) n.start();
await wait(20000);
const counts = nodes.map((n) => n.peerCount());
for (const n of nodes) n.stop();

console.log(`peer_counts=${counts.join(",")}`);
const ok = counts.every((c) => c >= 2);
if (!ok) {
  console.error("Sprint 1 check failed: each node must discover 2 peers");
  process.exit(1);
}
console.log("Sprint 1 check passed");
