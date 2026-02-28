import http from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { TrustStore } from "../messaging/trust-store.mjs";
import { loadIdentity } from "../crypto/keyring.mjs";

const PORT = Number(process.env.ARCHIPEL_UI_PORT ?? "8787");
const webRoot = resolve("web");
const cliPath = resolve("src/cli/archipel.mjs");
const keysScriptPath = resolve("src/crypto/generate-keys.mjs");
const serviceState = new Map();

const SERVICE_SPECS = {
  node: { cmd: "start", defaultPort: 7777 },
  secure: { cmd: "secure-listen", defaultPort: 8802 },
  provider: { cmd: "receive", defaultPort: 9931, extraArgs: ["--listen"] },
};

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function parseBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = "";
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      rejectPromise(err);
    };
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1024 * 1024) {
        req.destroy();
        fail(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      if (done) return;
      if (!raw) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        fail(new Error("invalid JSON body"));
      }
    });
    req.on("error", fail);
  });
}

function runCli(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(process.execPath, [cliPath, ...args], { env: process.env }, (err, stdout, stderr) => {
      if (err) {
        const text = [stdout, stderr].filter(Boolean).join("\n").trim() || err.message;
        rejectPromise(new Error(text));
        return;
      }
      resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseTableOutput(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readJsonFile(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
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
    trustFile: join(dataDir, `trust-${nodeName}.json`),
    peersFile: join(dataDir, `peers-${nodeName}.json`),
  };
}

function collectKnownNodeIds(nodeName) {
  const { trustFile, peersFile, keysDir } = getPaths(nodeName);
  const known = new Set();

  const trustEntries = readJsonFile(trustFile, []);
  if (Array.isArray(trustEntries)) {
    for (const e of trustEntries) {
      if (e?.node_id) known.add(String(e.node_id));
    }
  }

  const peers = readJsonFile(peersFile, []);
  if (Array.isArray(peers)) {
    for (const p of peers) {
      if (p?.node_id) known.add(String(p.node_id));
    }
  }

  if (existsSync(keysDir)) {
    const files = readdirSync(keysDir).filter((f) => f.endsWith("_ed25519.pub.pem"));
    for (const file of files) {
      const node = file.replace(/_ed25519\.pub\.pem$/, "");
      try {
        const id = loadIdentity(node, keysDir).nodeId;
        if (id) known.add(id);
      } catch {
        // ignore invalid key files
      }
    }
  }

  return [...known];
}

function resolveNodeIdInput(nodeName, value) {
  const input = stringField(value);
  if (!input) return "";
  if (/^[a-f0-9]{64}$/i.test(input)) return input;

  const candidates = collectKnownNodeIds(nodeName).filter((id) => id.startsWith(input));
  if (candidates.length === 1) return candidates[0];
  return input;
}

function ensureTrustEntryKnown(nodeName, targetNodeId) {
  const resolvedTarget = stringField(targetNodeId);
  if (!resolvedTarget) return false;
  const { trustFile, keysDir } = getPaths(nodeName);
  const store = new TrustStore(trustFile);
  if (store.getPublicKeyPem(resolvedTarget)) return true;

  if (!existsSync(keysDir)) return false;
  const files = readdirSync(keysDir).filter((f) => f.endsWith("_ed25519.pub.pem"));
  for (const file of files) {
    const candidateNode = file.replace(/_ed25519\.pub\.pem$/, "");
    try {
      const id = loadIdentity(candidateNode, keysDir);
      if (id.nodeId === resolvedTarget) {
        store.verifyOrTrust(id.nodeId, id.publicPem);
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function stringField(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function numberField(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendStatic(res, filePath) {
  try {
    const raw = readFileSync(filePath);
    res.writeHead(200, {
      "content-type": contentTypeByExt[extname(filePath)] ?? "application/octet-stream",
      "content-length": raw.length,
    });
    res.end(raw);
  } catch {
    sendJson(res, 404, { ok: false, error: "not found" });
  }
}

function serviceKey(service, nodeName) {
  return `${service}:${nodeName}`;
}

function pushServiceLog(entry, stream, chunk) {
  const lines = String(chunk ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  for (const line of lines) {
    entry.logs.push(`[${stream}] ${line}`);
    if (entry.logs.length > 300) entry.logs.shift();
  }
}

function serializeService(entry) {
  return {
    service: entry.service,
    nodeName: entry.nodeName,
    port: entry.port,
    running: Boolean(entry.proc && !entry.proc.killed && entry.exitCode === null),
    pid: entry.proc?.pid ?? null,
    startedAt: entry.startedAt,
    exitCode: entry.exitCode,
    signal: entry.signal,
    recentLogs: entry.logs.slice(-25),
  };
}

function getNodeServices(nodeName) {
  return Object.keys(SERVICE_SPECS).map((service) => {
    const entry = serviceState.get(serviceKey(service, nodeName));
    if (!entry) {
      return {
        service,
        nodeName,
        port: null,
        running: false,
        pid: null,
        startedAt: null,
        exitCode: null,
        signal: null,
        recentLogs: [],
      };
    }
    return serializeService(entry);
  });
}

async function generateKeys(nodeName, force = true) {
  const args = [keysScriptPath, "--node-name", nodeName];
  if (force) args.push("--force");
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(process.execPath, args, { env: process.env }, (err, stdout, stderr) => {
      if (err) {
        const text = [stdout, stderr].filter(Boolean).join("\n").trim() || err.message;
        rejectPromise(new Error(text));
        return;
      }
      resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function startService({ service, nodeName, port }) {
  const spec = SERVICE_SPECS[service];
  if (!spec) throw new Error(`unknown service: ${service}`);
  const key = serviceKey(service, nodeName);
  const existing = serviceState.get(key);
  if (existing?.proc && !existing.proc.killed && existing.exitCode === null) return existing;

  const resolvedPort = Number(port ?? spec.defaultPort);
  const args = [cliPath, spec.cmd, "--node-name", nodeName, "--port", String(resolvedPort), ...(spec.extraArgs ?? [])];
  const proc = spawn(process.execPath, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = {
    service,
    nodeName,
    port: resolvedPort,
    proc,
    startedAt: Date.now(),
    exitCode: null,
    signal: null,
    logs: [],
  };
  serviceState.set(key, entry);

  proc.stdout?.on("data", (chunk) => pushServiceLog(entry, "out", chunk));
  proc.stderr?.on("data", (chunk) => pushServiceLog(entry, "err", chunk));
  proc.on("exit", (code, signal) => {
    entry.exitCode = code;
    entry.signal = signal;
    entry.proc = null;
  });
  proc.on("error", (err) => {
    pushServiceLog(entry, "err", err.message);
    entry.exitCode = entry.exitCode ?? 1;
    entry.proc = null;
  });

  return entry;
}

async function stopService({ service, nodeName }) {
  const spec = SERVICE_SPECS[service];
  if (!spec) throw new Error(`unknown service: ${service}`);
  const key = serviceKey(service, nodeName);
  const entry = serviceState.get(key);
  if (!entry?.proc || entry.proc.killed || entry.exitCode !== null) return entry ?? null;

  const proc = entry.proc;
  proc.kill("SIGINT");

  await new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      try {
        if (!proc.killed) proc.kill("SIGTERM");
      } catch {
        // no-op
      }
      resolvePromise();
    }, 1200);
    proc.once("exit", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });

  return entry;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/services") {
      const node = url.searchParams.get("node") ?? "machine-1";
      sendJson(res, 200, { ok: true, services: getNodeServices(node) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/keys/generate") {
      const body = await parseBody(req);
      const node = stringField(body.nodeName, "machine-1");
      const force = body.force !== false;
      const out = await generateKeys(node, force);
      sendJson(res, 200, { ok: true, raw: out.stdout || out.stderr || "keys generated" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/services/start") {
      const body = await parseBody(req);
      const node = stringField(body.nodeName, "machine-1");
      const service = stringField(body.service);

      const servicesToStart = service
        ? [service]
        : ["node", "secure", "provider"];

      for (const cur of servicesToStart) {
        const portField = `${cur}Port`;
        startService({
          service: cur,
          nodeName: node,
          port: body[portField] ?? body.port,
        });
      }
      sendJson(res, 200, { ok: true, services: getNodeServices(node) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/services/stop") {
      const body = await parseBody(req);
      const node = stringField(body.nodeName, "machine-1");
      const service = stringField(body.service);

      const servicesToStop = service
        ? [service]
        : ["provider", "secure", "node"];

      for (const cur of servicesToStop) {
        await stopService({ service: cur, nodeName: node });
      }
      sendJson(res, 200, { ok: true, services: getNodeServices(node) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      const node = url.searchParams.get("node") ?? "machine-1";
      const out = await runCli(["status", "--node-name", node]);
      sendJson(res, 200, { ok: true, lines: parseTableOutput(out.stdout), raw: out.stdout });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/peers") {
      const node = url.searchParams.get("node") ?? "machine-1";
      const out = await runCli(["peers", "--node-name", node]);
      sendJson(res, 200, { ok: true, lines: parseTableOutput(out.stdout), raw: out.stdout });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/trust") {
      const node = url.searchParams.get("node") ?? "machine-1";
      const nodeId = stringField(url.searchParams.get("nodeId"), "");
      const args = ["trust", "--node-name", node];
      if (nodeId) args.push("--node-id", nodeId);
      const out = await runCli(args);
      sendJson(res, 200, { ok: true, lines: parseTableOutput(out.stdout), raw: out.stdout });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/files") {
      const node = url.searchParams.get("node") ?? "machine-1";
      const out = await runCli(["receive", "--node-name", node]);
      sendJson(res, 200, { ok: true, lines: parseTableOutput(out.stdout), raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/msg") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const toNodeId = stringField(body.toNodeId);
      const message = body.message ?? "hello";
      if (!toNodeId) throw new Error("missing required field: toNodeId");
      const args = ["msg", toNodeId, message, "--node-name", node];
      const toPort = numberField(body.toPort);
      if (toPort) args.push("--to-port", String(toPort));
      if (body.noAi) args.push("--no-ai");
      if (body.contextMessages !== undefined && body.contextMessages !== null && body.contextMessages !== "") {
        args.push("--context-messages", String(body.contextMessages));
      }
      const out = await runCli(args);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/send") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const toNodeId = stringField(body.toNodeId);
      const filePath = stringField(body.filePath);
      if (!filePath) throw new Error("missing required field: filePath");
      const args = ["send"];
      if (toNodeId) args.push(toNodeId);
      args.push(filePath, "--node-name", node);
      const toPort = numberField(body.toPort);
      if (toPort) args.push("--to-port", String(toPort));
      const chunkSize = numberField(body.chunkSize);
      if (chunkSize) args.push("--chunk-size", String(chunkSize));
      const out = await runCli(args);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/download") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const fileId = stringField(body.fileId);
      if (!fileId) throw new Error("missing required field: fileId");
      const args = ["download", fileId, "--node-name", node];
      const providerPort = numberField(body.providerPort);
      if (providerPort) args.push("--provider-port", String(providerPort));
      const parallel = numberField(body.parallel);
      if (parallel) args.push("--parallel", String(parallel));
      const timeoutMs = numberField(body.timeoutMs);
      if (timeoutMs) args.push("--timeout-ms", String(timeoutMs));
      const peers = Array.isArray(body.peers) ? body.peers : [];
      for (const peer of peers) {
        const nodeId = stringField(peer?.nodeId);
        const host = stringField(peer?.host);
        const port = numberField(peer?.port);
        if (nodeId && host && port) {
          args.push("--peer", `${nodeId}@${host}:${port}`);
        }
      }
      const out = await runCli(args);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/trust/approve") {
      const body = await parseBody(req);
      const node = stringField(body.nodeName, "machine-1");
      const targetNodeId = resolveNodeIdInput(node, body.targetNodeId);
      if (!targetNodeId) throw new Error("missing required field: targetNodeId");
      const byNode = stringField(body.byNodeName, node);
      const note = stringField(body.note);
      const args = ["trust", "--node-name", node, "--approve", targetNodeId, "--by", byNode];
      if (note) args.push("--note", note);
      let out;
      try {
        out = await runCli(args);
      } catch (err) {
        if (String(err.message).includes("unknown node_id") && ensureTrustEntryKnown(node, targetNodeId)) {
          out = await runCli(args);
        } else {
          throw err;
        }
      }
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/trust/revoke") {
      const body = await parseBody(req);
      const node = stringField(body.nodeName, "machine-1");
      const targetNodeId = resolveNodeIdInput(node, body.targetNodeId);
      if (!targetNodeId) throw new Error("missing required field: targetNodeId");
      const byNode = stringField(body.byNodeName, node);
      const reason = stringField(body.reason, "revocation manuelle");
      const args = ["trust", "--node-name", node, "--revoke", targetNodeId, "--by", byNode, "--reason", reason];
      let out;
      try {
        out = await runCli(args);
      } catch (err) {
        if (String(err.message).includes("unknown node_id") && ensureTrustEntryKnown(node, targetNodeId)) {
          out = await runCli(args);
        } else {
          throw err;
        }
      }
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const prompt = stringField(body.prompt, "status");
      const args = ["ask", "--prompt", prompt, "--node-name", node];
      if (body.noAi) args.push("--no-ai");
      if (body.contextMessages !== undefined && body.contextMessages !== null && body.contextMessages !== "") {
        args.push("--context-messages", String(body.contextMessages));
      }
      const context = stringField(body.context);
      if (context) args.push("--context", context);
      const out = await runCli(args);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    sendJson(res, 404, { ok: false, error: "api route not found" });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    sendStatic(res, join(webRoot, "index.html"));
    return;
  }

  const filePath = join(webRoot, url.pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(webRoot) || !existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }
  sendStatic(res, filePath);
});

process.on("SIGINT", async () => {
  const entries = [...serviceState.values()].filter((e) => e?.proc && !e.proc.killed && e.exitCode === null);
  await Promise.allSettled(entries.map((e) => stopService({ service: e.service, nodeName: e.nodeName })));
  process.exit(0);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`archipel ui listening on http://127.0.0.1:${PORT}`);
});
