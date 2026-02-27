#!/usr/bin/env node
import { ArchipelNode } from "../network/archipel-node.mjs";

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

const cmd = process.argv[2];
if (cmd !== "start") {
  console.log("Usage: node src/cli/archipel.mjs start --node-name node-1 --port 7777");
  process.exit(1);
}

const node = new ArchipelNode({
  nodeName: arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1"),
  tcpPort: Number(arg("--port", process.env.ARCHIPEL_TCP_PORT ?? "7777")),
  mcastIp: process.env.ARCHIPEL_UDP_MULTICAST_IP ?? "239.255.42.99",
  mcastPort: Number(process.env.ARCHIPEL_UDP_MULTICAST_PORT ?? "6000"),
  discoveryIntervalSec: Number(process.env.ARCHIPEL_DISCOVERY_INTERVAL_SEC ?? "30"),
  peerTimeoutSec: Number(process.env.ARCHIPEL_PEER_TIMEOUT_SEC ?? "90"),
  keepAliveSec: Number(process.env.ARCHIPEL_KEEPALIVE_INTERVAL_SEC ?? "15"),
  dataDir: process.env.ARCHIPEL_DATA_DIR ?? ".archipel",
  keysDir: process.env.ARCHIPEL_KEYS_DIR ?? ".archipel/keys",
});

node.start();
process.on("SIGINT", () => {
  node.stop();
  process.exit(0);
});
