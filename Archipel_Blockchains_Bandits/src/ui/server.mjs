import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { execFile } from "node:child_process";

const PORT = Number(process.env.ARCHIPEL_UI_PORT ?? "8787");
const webRoot = resolve("web");
const cliPath = resolve("src/cli/archipel.mjs");

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function parseBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1024 * 1024) {
        rejectPromise(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        rejectPromise(new Error("invalid JSON body"));
      }
    });
    req.on("error", rejectPromise);
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

async function handleApi(req, res, url) {
  try {
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
      const out = await runCli(["trust", "--node-name", node]);
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
      const toNodeId = body.toNodeId;
      const message = body.message ?? "hello";
      const args = ["msg", toNodeId, message, "--node-name", node];
      if (body.noAi) args.push("--no-ai");
      const out = await runCli(args);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/send") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const toNodeId = body.toNodeId;
      const filePath = body.filePath;
      const out = await runCli(["send", toNodeId, filePath, "--node-name", node]);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/download") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const fileId = body.fileId;
      const out = await runCli(["download", fileId, "--node-name", node]);
      sendJson(res, 200, { ok: true, raw: out.stdout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await parseBody(req);
      const node = body.nodeName ?? "machine-1";
      const prompt = body.prompt ?? "status";
      const args = ["ask", "--prompt", prompt, "--node-name", node];
      if (body.noAi) args.push("--no-ai");
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`archipel ui listening on http://127.0.0.1:${PORT}`);
});
