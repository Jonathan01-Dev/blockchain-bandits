import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_DIR = path.resolve(__dirname, '../../web');

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function serveFile(reqPath, res) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath;
  const absolute = path.resolve(STATIC_DIR, `.${safePath}`);
  if (!absolute.startsWith(STATIC_DIR)) {
    json(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
    json(res, 404, { ok: false, error: 'Not found' });
    return;
  }

  const ext = path.extname(absolute).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };

  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(absolute).pipe(res);
}

export class DashboardServer {
  constructor({ node, logger, port = 8080 }) {
    this.node = node;
    this.logger = logger;
    this.port = Number(port);
    this.server = null;
  }

  async routeApi(req, res, pathname) {
    try {
      if (req.method === 'GET' && pathname === '/api/status') {
        json(res, 200, { ok: true, data: this.node.status() });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/peers') {
        json(res, 200, { ok: true, data: this.node.listPeers() });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/trust') {
        json(res, 200, { ok: true, data: this.node.listTrust() });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/manifests') {
        json(res, 200, { ok: true, data: this.node.transfer.listManifests() });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/msg') {
        const body = await readBody(req);
        const out = await this.node.sendMessage(body.peerPrefix, body.text || '');
        json(res, 200, { ok: true, data: out });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/ask') {
        const body = await readBody(req);
        const out = await this.node.askAi(body.question || '');
        json(res, 200, { ok: true, data: { answer: out } });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/share') {
        const body = await readBody(req);
        const out = this.node.shareFile(body.filePath || '');
        json(res, 200, { ok: true, data: out });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/pull') {
        const body = await readBody(req);
        const out = await this.node.pullFile(body.peerPrefix, body.fileId, body.outputPath || null);
        json(res, 200, { ok: true, data: out });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/pull-multi') {
        const body = await readBody(req);
        const out = await this.node.pullFileMulti(
          body.fileId,
          body.outputPath || null,
          Number(body.parallelism || 3),
        );
        json(res, 200, { ok: true, data: out });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/trust/approve') {
        const body = await readBody(req);
        const out = await this.node.approvePeer(body.peerPrefix);
        json(res, 200, { ok: true, data: out });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/trust/revoke') {
        const body = await readBody(req);
        const out = this.node.revokePeer(body.peerPrefix, body.reason || 'manual_revoke');
        json(res, 200, { ok: true, data: out });
        return;
      }

      json(res, 404, { ok: false, error: 'Unknown API route' });
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
    }
  }

  start() {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        await this.routeApi(req, res, pathname);
        return;
      }

      serveFile(pathname, res);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      this.logger.info(`Dashboard web disponible: http://127.0.0.1:${this.port}`);
    });
  }

  stop() {
    if (!this.server) return;
    try {
      this.server.close();
    } catch {
      // noop
    }
    this.server = null;
  }
}
