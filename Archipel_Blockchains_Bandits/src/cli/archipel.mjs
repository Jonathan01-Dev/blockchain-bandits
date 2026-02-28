#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ArchipelNode } from "../network/archipel-node.mjs";
import { resolveNodeIdHex } from "../network/identity.mjs";
import { SecureNode } from "../messaging/secure-node.mjs";
import { TrustStore } from "../messaging/trust-store.mjs";
import { loadIdentity } from "../crypto/keyring.mjs";
import { stageFileForTransfer } from "../transfer/chunker.mjs";
import { IndexStore } from "../transfer/index-store.mjs";
import { verifyManifestSignature } from "../transfer/manifest.mjs";
import { ChunkTransferNode } from "../transfer/chunk-transfer-node.mjs";
import { ChunkDownloadManager } from "../transfer/download-manager.mjs";

function arg(name, fallback) {
  const eqPrefix = `${name}=`;
  const eqArg = process.argv.find((a) => a.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);

  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function argAll(name) {
  const values = [];
  const eqPrefix = `${name}=`;
  for (const a of process.argv) {
    if (a.startsWith(eqPrefix)) values.push(a.slice(eqPrefix.length));
  }
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && i + 1 < process.argv.length) {
      values.push(process.argv[i + 1]);
      i += 1;
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function positionalArgs() {
  const values = [];
  for (let i = 3; i < process.argv.length; i += 1) {
    const cur = process.argv[i];
    if (cur.startsWith("--")) {
      if (!cur.includes("=") && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
        i += 1;
      }
      continue;
    }
    values.push(cur);
  }
  return values;
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getPaths(nodeName) {
  const dataDir = resolve(process.env.ARCHIPEL_DATA_DIR ?? ".archipel");
  const keysDir = resolve(process.env.ARCHIPEL_KEYS_DIR ?? ".archipel/keys");
  return {
    dataDir,
    keysDir,
    peersFile: join(dataDir, `peers-${nodeName}.json`),
    trustFile: join(dataDir, `trust-${nodeName}.json`),
    indexFile: join(dataDir, "index.json"),
    chatFile: join(dataDir, `chat-${nodeName}.jsonl`),
  };
}

function requireValue(name, value) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`missing required argument: ${name}`);
  }
  return value;
}

function parsePeerSpec(spec) {
  const trimmed = spec.trim();
  if (!trimmed) throw new Error("empty --peer spec");

  if (trimmed.includes("@")) {
    const [nodeId, hostPort] = trimmed.split("@", 2);
    const [host, portRaw] = hostPort.split(":", 2);
    return {
      node_id: requireValue("peer node_id", nodeId),
      host: requireValue("peer host", host),
      port: Number(requireValue("peer port", portRaw)),
    };
  }

  if (trimmed.includes("#")) {
    const [hostPort, nodeId] = trimmed.split("#", 2);
    const [host, portRaw] = hostPort.split(":", 2);
    return {
      node_id: requireValue("peer node_id", nodeId),
      host: requireValue("peer host", host),
      port: Number(requireValue("peer port", portRaw)),
    };
  }

  const [host, portRaw] = trimmed.split(":", 2);
  const port = Number(requireValue("peer port", portRaw));
  return {
    node_id: `${host}:${port}`,
    host: requireValue("peer host", host),
    port,
  };
}

function safeNodeId(nodeName, tcpPort, keysDir) {
  try {
    return loadIdentity(nodeName, keysDir).nodeId;
  } catch {
    return resolveNodeIdHex(nodeName, tcpPort, keysDir);
  }
}

function appendChatEvent(nodeName, dataDir, event) {
  const file = join(dataDir, `chat-${nodeName}.jsonl`);
  mkdirSync(dataDir, { recursive: true });
  appendFileSync(file, `${JSON.stringify({ ts: Date.now(), ...event })}\n`, "utf8");
}

function loadRecentChatContext(nodeName, dataDir, limit = 12) {
  const file = join(dataDir, `chat-${nodeName}.jsonl`);
  if (!existsSync(file)) return "";

  const lines = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-Math.max(1, limit));

  return lines
    .map((e) => {
      const d = e.direction ?? "evt";
      const p = e.peer ? ` peer=${String(e.peer).slice(0, 12)}` : "";
      const t = e.text ? ` text=${e.text}` : "";
      return `[${d}]${p}${t}`;
    })
    .join("\n");
}

function extractAiPrompt(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/ask ")) {
    return trimmed.slice(5).trim();
  }

  const idx = trimmed.indexOf("@archipel-ai");
  if (idx >= 0) {
    return trimmed.slice(idx + "@archipel-ai".length).trim() || trimmed;
  }

  return null;
}

async function queryGemini({ prompt, context, noAi }) {
  if (noAi || (process.env.ARCHIPEL_AI_ENABLED ?? "false") !== "true") {
    return "ai disabled (use ARCHIPEL_AI_ENABLED=true and omit --no-ai)";
  }

  const apiKey = process.env.ARCHIPEL_GEMINI_API_KEY ?? "";
  if (!apiKey) {
    return "ai unavailable: missing ARCHIPEL_GEMINI_API_KEY";
  }
  const model = process.env.ARCHIPEL_GEMINI_MODEL ?? "gemini-1.5-flash";

  const fullPrompt = context ? `Context:\n${context}\n\nQuestion:\n${prompt}` : prompt;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: fullPrompt }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      return `ai unavailable: HTTP ${response.status}`;
    }

    const json = await response.json();
    return (
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") ??
      "(empty response)"
    );
  } catch (err) {
    return `ai unavailable: ${err.message}`;
  }
}

function resolvePeerByNodeId(nodeName, targetNodeId) {
  const { peersFile } = getPaths(nodeName);
  const peers = readJsonFile(peersFile, []);
  if (!Array.isArray(peers) || peers.length === 0) {
    throw new Error("peer table empty; run start and discovery first");
  }

  const exact = peers.find((p) => p.node_id === targetNodeId);
  if (exact) return exact;

  const starts = peers.filter((p) => String(p.node_id).startsWith(targetNodeId));
  if (starts.length === 1) return starts[0];
  if (starts.length > 1) throw new Error("ambiguous node_id prefix");

  throw new Error(`node_id not found in peer table: ${targetNodeId}`);
}

async function runStart() {
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
}

async function runSecureListen() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const { dataDir } = getPaths(nodeName);
  const secureNode = new SecureNode({
    nodeName,
    host: arg("--host", "0.0.0.0"),
    port: Number(arg("--port", "8801")),
    dataDir,
    keysDir: process.env.ARCHIPEL_KEYS_DIR ?? ".archipel/keys",
  });

  secureNode.on("message", ({ from, plaintext }) => {
    appendChatEvent(nodeName, dataDir, { direction: "in", peer: from, text: plaintext });
    console.log(`[secure-message] from=${from.slice(0, 12)} text=${plaintext}`);
  });

  await secureNode.start();
  process.on("SIGINT", async () => {
    await secureNode.stop();
    process.exit(0);
  });
}

async function runSecureSend({ commandName }) {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const { dataDir, keysDir } = getPaths(nodeName);
  const pos = positionalArgs();

  let toNodeId = arg("--to-node-id", "");
  if (!toNodeId && commandName === "msg" && pos.length > 0) {
    toNodeId = pos[0];
  }

  const toPort = Number(arg("--to-port", "8802"));

  let toHost = arg("--to-host", "");
  if (!toHost && toNodeId) {
    const peer = resolvePeerByNodeId(nodeName, toNodeId);
    toHost = peer.ip;
  }
  if (!toHost) toHost = "127.0.0.1";

  let message = arg("--message", "");
  if (!message && commandName === "msg" && pos.length > 1) {
    message = pos.slice(1).join(" ");
  }
  if (!message) message = arg("--text", "hello");

  const aiPrompt = extractAiPrompt(message);
  if (aiPrompt) {
    const maxContext = Number(arg("--context-messages", process.env.ARCHIPEL_AI_CONTEXT_MESSAGES ?? "12"));
    const context = loadRecentChatContext(nodeName, dataDir, maxContext);
    const aiText = await queryGemini({
      prompt: aiPrompt,
      context,
      noAi: hasFlag("--no-ai"),
    });
    message = `[archipel-ai] ${aiText}`;
  }

  const secureNode = new SecureNode({
    nodeName,
    host: arg("--host", "127.0.0.1"),
    port: Number(arg("--port", "8801")),
    dataDir,
    keysDir,
  });

  await secureNode.start();
  const sent = await secureNode.sendEncryptedMessage({
    host: toHost,
    port: toPort,
    plaintext: message,
  });
  appendChatEvent(nodeName, dataDir, { direction: "out", peer: sent.peerNodeId, text: message });
  console.log(`secure-send ok to=${sent.peerNodeId.slice(0, 12)}`);
  await secureNode.stop();
}

function runPeers() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const { peersFile } = getPaths(nodeName);
  const peers = readJsonFile(peersFile, []);

  if (!Array.isArray(peers) || peers.length === 0) {
    console.log("peers=0");
    return;
  }

  console.log(`peers=${peers.length}`);
  for (const p of peers) {
    console.log(`${(p.node_id ?? "").slice(0, 12)} ${p.ip}:${p.tcp_port} last_seen=${p.last_seen}`);
  }
}

function runTrust() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const { trustFile, keysDir } = getPaths(nodeName);
  const pos = positionalArgs();
  const store = new TrustStore(trustFile);

  const approveNodeId = arg("--approve", "");
  if (approveNodeId) {
    const byNodeName = arg("--by", nodeName);
    const byIdentity = loadIdentity(byNodeName, keysDir);
    const note = arg("--note", "");
    const out = store.endorse(approveNodeId, byIdentity.nodeId, byIdentity.privateKey, note);
    if (!out.ok) throw new Error(`trust approve failed: ${out.reason}`);
    console.log(`trust approved node=${approveNodeId.slice(0, 12)} score=${out.trust_score}`);
    return;
  }

  const revokeNodeId = arg("--revoke", "");
  if (revokeNodeId) {
    const byNodeName = arg("--by", nodeName);
    const byIdentity = loadIdentity(byNodeName, keysDir);
    const reason = arg("--reason", "manual revoke");
    const out = store.revoke(revokeNodeId, byIdentity.nodeId, byIdentity.privateKey, reason);
    if (!out.ok) throw new Error(`trust revoke failed: ${out.reason}`);
    console.log(`trust revoked node=${revokeNodeId.slice(0, 12)} reason=${reason}`);
    return;
  }

  const filterNodeId = arg("--node-id", pos[0] ?? "");
  const entries = store.list();
  const filtered = filterNodeId ? entries.filter((e) => e.node_id === filterNodeId) : entries;

  if (filtered.length === 0) {
    console.log("trust=0");
    return;
  }

  console.log(`trust=${filtered.length}`);
  for (const e of filtered) {
    console.log(
      `${(e.node_id ?? "").slice(0, 12)} fp=${(e.fingerprint ?? "").slice(0, 12)} mode=${e.trust_mode} score=${e.trust_score}`
    );
  }
}

function runStatus() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const tcpPort = Number(arg("--port", process.env.ARCHIPEL_TCP_PORT ?? "7777"));
  const { dataDir, keysDir, peersFile, trustFile, indexFile, chatFile } = getPaths(nodeName);

  const peers = readJsonFile(peersFile, []);
  const trust = readJsonFile(trustFile, []);
  const index = readJsonFile(indexFile, { manifests: {} });
  const manifests = Object.keys(index?.manifests ?? {}).length;
  const chatLines = existsSync(chatFile)
    ? readFileSync(chatFile, "utf8").split("\n").filter(Boolean).length
    : 0;

  const nodeId = safeNodeId(nodeName, tcpPort, keysDir);
  console.log(`node_name=${nodeName}`);
  console.log(`node_id=${nodeId}`);
  console.log(`data_dir=${dataDir}`);
  console.log(`keys_dir=${keysDir}`);
  console.log(`peers=${Array.isArray(peers) ? peers.length : 0}`);
  console.log(`trusted_keys=${Array.isArray(trust) ? trust.length : 0}`);
  console.log(`manifests=${manifests}`);
  console.log(`chat_messages=${chatLines}`);
}

async function runSend() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const { dataDir, keysDir, indexFile } = getPaths(nodeName);
  const pos = positionalArgs();

  const toNodeId = arg("--to-node-id", pos[0] ?? "");
  const filePath = arg("--file", pos.length >= 2 ? pos[1] : pos[0] ?? "");
  const absFilePath = requireValue("--file or positional <filepath>", filePath);
  const chunkSize = Number(arg("--chunk-size", "524288"));

  const identity = loadIdentity(nodeName, keysDir);

  const manifest = stageFileForTransfer({
    filePath: absFilePath,
    chunkSize,
    dataDir,
    senderId: identity.nodeId,
    senderPublicPem: identity.publicPem,
    senderPrivateKey: identity.privateKey,
  });

  if (!verifyManifestSignature(manifest)) {
    throw new Error("manifest signature verification failed after staging");
  }

  const store = new IndexStore(indexFile);
  store.upsertManifest(manifest);

  const manifestsDir = join(dataDir, "manifests");
  mkdirSync(manifestsDir, { recursive: true });
  const manifestPath = join(manifestsDir, `${manifest.file_id}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`send prepared file=${absFilePath}`);
  console.log(`file_id=${manifest.file_id}`);
  console.log(`nb_chunks=${manifest.nb_chunks}`);
  console.log(`manifest_path=${manifestPath}`);

  if (!toNodeId) return;

  const peer = resolvePeerByNodeId(nodeName, toNodeId);
  const offerPort = Number(arg("--to-port", "8802"));
  const offer = `FILE_OFFER file_id=${manifest.file_id} filename=${manifest.filename} size=${manifest.size} chunk_size=${manifest.chunk_size}`;

  const secureNode = new SecureNode({
    nodeName,
    host: arg("--host", "127.0.0.1"),
    port: Number(arg("--port", "8801")),
    dataDir,
    keysDir,
  });

  await secureNode.start();
  await secureNode.sendEncryptedMessage({ host: peer.ip, port: offerPort, plaintext: offer });
  await secureNode.stop();
  appendChatEvent(nodeName, dataDir, { direction: "out", peer: toNodeId, text: offer });
  console.log(`file offer sent to=${toNodeId.slice(0, 12)} host=${peer.ip}:${offerPort}`);
}

async function runReceive() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const listenMode = hasFlag("--listen");
  const { dataDir, keysDir, indexFile } = getPaths(nodeName);

  const store = new IndexStore(indexFile);
  if (!listenMode) {
    const manifests = store.listManifests();
    if (manifests.length === 0) {
      console.log("available_files=0");
      return;
    }
    console.log(`available_files=${manifests.length}`);
    for (const m of manifests) {
      console.log(`${m.file_id} name=${m.filename} size=${m.size} chunks=${m.nb_chunks}`);
    }
    return;
  }

  const identity = loadIdentity(nodeName, keysDir);
  const transferNode = new ChunkTransferNode({
    nodeId: identity.nodeId,
    privateKey: identity.privateKey,
    publicPem: identity.publicPem,
    indexStore: store,
    host: arg("--host", "0.0.0.0"),
    port: Number(arg("--port", "9931")),
  });

  await transferNode.start();
  process.on("SIGINT", async () => {
    await transferNode.stop();
    process.exit(0);
  });
}

function loadManifestForDownload(store, fileId) {
  const fromIndex = store.getManifest(fileId);
  if (fromIndex) return fromIndex;

  const manifestPath = arg("--manifest", "");
  if (!manifestPath) {
    throw new Error(`manifest not found in local index for file_id=${fileId}. provide --manifest <path>`);
  }

  const manifest = readJsonFile(resolve(manifestPath), null);
  if (!manifest || manifest.file_id !== fileId) {
    throw new Error("manifest invalid or file_id mismatch");
  }
  if (!verifyManifestSignature(manifest)) {
    throw new Error("manifest signature invalid");
  }
  store.upsertManifest(manifest);
  return manifest;
}

function collectPeers(nodeName) {
  const peers = argAll("--peer").map(parsePeerSpec);
  if (peers.length > 0) return peers;

  const fromHost = arg("--from-host", "");
  const fromPort = arg("--from-port", "");
  if (fromHost && fromPort) {
    return [
      {
        node_id: arg("--from-node-id", `${fromHost}:${fromPort}`),
        host: fromHost,
        port: Number(fromPort),
      },
    ];
  }

  const providerPort = Number(arg("--provider-port", "9931"));
  const { peersFile } = getPaths(nodeName);
  const discovered = readJsonFile(peersFile, []);
  const fromDiscovery = Array.isArray(discovered)
    ? discovered.map((p) => ({ node_id: p.node_id, host: p.ip, port: providerPort }))
    : [];

  if (fromDiscovery.length > 0) return fromDiscovery;

  throw new Error("at least one provider is required via --peer, --from-host/--from-port, or discovered peers");
}

async function runDownload() {
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const pos = positionalArgs();
  const fileId = requireValue("--file-id or positional <file_id>", arg("--file-id", pos[0] ?? ""));
  const { dataDir, keysDir, indexFile } = getPaths(nodeName);

  const identity = loadIdentity(nodeName, keysDir);
  const store = new IndexStore(indexFile);
  const manifest = loadManifestForDownload(store, fileId);
  const peers = collectPeers(nodeName).filter((p) => p.node_id !== identity.nodeId);

  if (peers.length === 0) {
    throw new Error("no remote provider available for download");
  }

  const localNode = new ChunkTransferNode({
    nodeId: identity.nodeId,
    privateKey: identity.privateKey,
    publicPem: identity.publicPem,
    indexStore: store,
    port: Number(arg("--port", "9940")),
  });

  const allIndices = manifest.chunks.map((c) => c.index);
  const peerChunkMap = Object.fromEntries(peers.map((p) => [p.node_id, allIndices]));

  const mgr = new ChunkDownloadManager({
    localChunkNode: localNode,
    localNodeId: identity.nodeId,
    manifest,
    peers,
    peerChunkMap,
    outputDir: arg("--output-dir", join(dataDir, "downloads")),
    parallel: Number(arg("--parallel", "3")),
    requestTimeoutMs: Number(arg("--timeout-ms", "1500")),
  });

  const result = await mgr.download();
  console.log(`download ok file_id=${fileId}`);
  console.log(`output_path=${result.outputPath}`);
  console.log(`file_hash=${result.fileHash}`);
  console.log(`size=${result.size}`);
}

async function runGeminiAsk() {
  const prompt = requireValue("--prompt", arg("--prompt", ""));
  const contextMax = Number(arg("--context-messages", process.env.ARCHIPEL_AI_CONTEXT_MESSAGES ?? "12"));
  const nodeName = arg("--node-name", process.env.ARCHIPEL_NODE_NAME ?? "node-1");
  const { dataDir } = getPaths(nodeName);
  const context = arg("--context", loadRecentChatContext(nodeName, dataDir, contextMax));
  const text = await queryGemini({ prompt, context, noAi: hasFlag("--no-ai") });
  console.log(text);
}

function printUsage() {
  console.log("Usage:");
  console.log("  node src/cli/archipel.mjs start --port 7777");
  console.log("  node src/cli/archipel.mjs peers");
  console.log("  node src/cli/archipel.mjs msg <node_id> 'Hello!'");
  console.log("  node src/cli/archipel.mjs send <node_id> <filepath>");
  console.log("  node src/cli/archipel.mjs receive");
  console.log("  node src/cli/archipel.mjs download <file_id>");
  console.log("  node src/cli/archipel.mjs status");
  console.log("  node src/cli/archipel.mjs trust <node_id>");
  console.log("  node src/cli/archipel.mjs trust --approve <node_id> [--by <signer-node>]");
  console.log("  node src/cli/archipel.mjs trust --revoke <node_id> --reason 'compromised'");
  console.log("  node src/cli/archipel.mjs ask --prompt 'Question' --no-ai");
}

const cmd = process.argv[2];

try {
  if (cmd === "start") await runStart();
  else if (cmd === "peers") runPeers();
  else if (cmd === "status") runStatus();
  else if (cmd === "trust") runTrust();
  else if (cmd === "secure-listen") await runSecureListen();
  else if (cmd === "secure-send" || cmd === "msg") await runSecureSend({ commandName: cmd });
  else if (cmd === "send") await runSend();
  else if (cmd === "receive") await runReceive();
  else if (cmd === "download") await runDownload();
  else if (cmd === "ask") await runGeminiAsk();
  else {
    printUsage();
    process.exit(1);
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
