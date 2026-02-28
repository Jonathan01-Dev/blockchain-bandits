import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_CHUNK_SIZE, DOWNLOAD_DIR, INDEX_DB_FILE, DEFAULT_REPLICATION_FACTOR } from '../core/constants.js';
import { ensureDir, writeJson, readJson } from '../core/files.js';

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

export class FileTransferManager {
  constructor({ logger }) {
    this.logger = logger;
    ensureDir(DOWNLOAD_DIR);
    this.manifests = readJson(path.join(DOWNLOAD_DIR, 'manifests.json'), {});
    this.received = new Map();
    this.index = readJson(INDEX_DB_FILE, { files: {} });
  }

  saveManifestState() {
    writeJson(path.join(DOWNLOAD_DIR, 'manifests.json'), this.manifests);
    writeJson(INDEX_DB_FILE, this.index);
  }

  calculateReceivedBytes(manifest, receivedSet) {
    if (!manifest?.chunks || !receivedSet) return 0;
    let total = 0;
    for (const idx of receivedSet) {
      total += manifest.chunks[idx]?.size || 0;
    }
    return total;
  }

  buildManifest(filePath, senderId, chunkSize = DEFAULT_CHUNK_SIZE) {
    const stat = fs.statSync(filePath);
    const total = stat.size;
    const fd = fs.openSync(filePath, 'r');
    const chunks = [];
    const hashAll = crypto.createHash('sha256');

    let index = 0;
    let offset = 0;
    while (offset < total) {
      const size = Math.min(chunkSize, total - offset);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, offset);
      hashAll.update(buf);
      chunks.push({ index, size, hash: sha256Buffer(buf) });
      offset += size;
      index += 1;
    }
    fs.closeSync(fd);

    const manifest = {
      fileId: hashAll.digest('hex'),
      filename: path.basename(filePath),
      size: total,
      chunkSize,
      nbChunks: chunks.length,
      chunks,
      senderId,
      createdAt: new Date().toISOString(),
    };

    return manifest;
  }

  *readFileChunks(filePath, chunkSize = DEFAULT_CHUNK_SIZE) {
    const stat = fs.statSync(filePath);
    const total = stat.size;
    const fd = fs.openSync(filePath, 'r');
    let idx = 0;
    let offset = 0;

    while (offset < total) {
      const size = Math.min(chunkSize, total - offset);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, offset);
      yield { index: idx, dataB64: buf.toString('base64'), hash: sha256Buffer(buf), size };
      offset += size;
      idx += 1;
    }

    fs.closeSync(fd);
  }

  readChunkAt(filePath, chunkSize, chunkIndex) {
    const fd = fs.openSync(filePath, 'r');
    const offset = chunkIndex * chunkSize;
    const stat = fs.statSync(filePath);
    if (offset >= stat.size) {
      fs.closeSync(fd);
      return null;
    }

    const size = Math.min(chunkSize, stat.size - offset);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, offset);
    fs.closeSync(fd);

    return {
      index: chunkIndex,
      size,
      dataB64: buf.toString('base64'),
      hash: sha256Buffer(buf),
    };
  }

  readStoredChunk(fileId, chunkIndex) {
    const manifest = this.manifests[fileId];
    if (!manifest) return null;
    const chunkPath = path.join(DOWNLOAD_DIR, fileId, `${chunkIndex}.chunk`);
    if (!fs.existsSync(chunkPath)) return null;
    const buf = fs.readFileSync(chunkPath);
    return {
      index: chunkIndex,
      size: buf.length,
      dataB64: buf.toString('base64'),
      hash: sha256Buffer(buf),
    };
  }

  hydrateReceivedSet(fileId, manifest) {
    const dir = path.join(DOWNLOAD_DIR, fileId);
    ensureDir(dir);

    const set = new Set();
    for (let i = 0; i < manifest.nbChunks; i += 1) {
      const p = path.join(dir, `${i}.chunk`);
      if (fs.existsSync(p)) set.add(i);
    }

    this.received.set(fileId, set);
    return set;
  }

  acceptManifest(manifest, { resume = true } = {}) {
    const previous = this.manifests[manifest.fileId] || {};
    const incoming = {
      ...manifest,
      status: previous.status || 'receiving',
      receivedChunks: previous.receivedChunks || 0,
      bytesReceived: previous.bytesReceived || 0,
      transferStartedAt: previous.transferStartedAt || nowIso(),
      lastChunkAt: previous.lastChunkAt || null,
      updatedAt: nowIso(),
    };

    this.manifests[manifest.fileId] = incoming;
    this.ensureIndexFile(manifest.fileId, incoming, {
      replicationFactorTarget: incoming.replicationFactorTarget || DEFAULT_REPLICATION_FACTOR,
    });
    const set = resume ? this.hydrateReceivedSet(manifest.fileId, incoming) : new Set();
    if (!resume) this.received.set(manifest.fileId, set);
    incoming.receivedChunks = set.size;
    incoming.bytesReceived = this.calculateReceivedBytes(incoming, set);
    incoming.status = set.size >= incoming.nbChunks ? 'ready_to_assemble' : 'receiving';
    this.saveManifestState();
  }

  ensureIndexFile(fileId, manifest, { replicationFactorTarget = DEFAULT_REPLICATION_FACTOR } = {}) {
    if (!this.index.files[fileId]) {
      this.index.files[fileId] = {
        fileId,
        filename: manifest.filename,
        nbChunks: manifest.nbChunks,
        chunkSize: manifest.chunkSize,
        providers: [],
        chunks: {},
        replicationFactorTarget,
        updatedAt: nowIso(),
      };
    }

    const entry = this.index.files[fileId];
    if (!entry.filename && manifest.filename) entry.filename = manifest.filename;
    if (!entry.nbChunks && manifest.nbChunks) entry.nbChunks = manifest.nbChunks;
    if (!entry.chunkSize && manifest.chunkSize) entry.chunkSize = manifest.chunkSize;
    entry.updatedAt = nowIso();
    return entry;
  }

  registerProvider(fileId, providerNodeId) {
    const manifest = this.manifests[fileId];
    if (!manifest) return;
    const entry = this.ensureIndexFile(fileId, manifest);
    if (!entry.providers.includes(providerNodeId)) {
      entry.providers.push(providerNodeId);
      entry.updatedAt = nowIso();
      this.saveManifestState();
    }
  }

  getMissingChunkIndexes(fileId) {
    const manifest = this.manifests[fileId];
    if (!manifest) return [];

    if (!this.received.has(fileId)) {
      this.hydrateReceivedSet(fileId, manifest);
    }
    const set = this.received.get(fileId);
    const missing = [];
    for (let i = 0; i < manifest.nbChunks; i += 1) {
      if (!set.has(i)) missing.push(i);
    }
    return missing;
  }

  receiveChunk(fileId, chunkIndex, dataB64, expectedHash) {
    const manifest = this.manifests[fileId];
    if (!manifest) {
      return { ok: false, reason: 'manifest_not_found' };
    }

    const buf = Buffer.from(dataB64, 'base64');
    const actualHash = sha256Buffer(buf);
    if (actualHash !== expectedHash) {
      return { ok: false, reason: 'hash_mismatch' };
    }

    const expectedMeta = manifest.chunks?.[chunkIndex];
    if (expectedMeta?.hash && expectedMeta.hash !== expectedHash) {
      return { ok: false, reason: 'chunk_hash_not_in_manifest' };
    }

    const fileDir = path.join(DOWNLOAD_DIR, fileId);
    ensureDir(fileDir);
    fs.writeFileSync(path.join(fileDir, `${chunkIndex}.chunk`), buf);

    if (!this.received.has(fileId)) this.received.set(fileId, new Set());
    const set = this.received.get(fileId);
    if (!set.has(chunkIndex)) {
      set.add(chunkIndex);
      manifest.receivedChunks = set.size;
      manifest.bytesReceived = this.calculateReceivedBytes(manifest, set);
      manifest.lastChunkAt = nowIso();
      manifest.updatedAt = nowIso();
      if (set.size === manifest.nbChunks) manifest.status = 'ready_to_assemble';
      const indexEntry = this.ensureIndexFile(fileId, manifest);
      indexEntry.chunks[String(chunkIndex)] = {
        hash: expectedHash,
        size: buf.length,
        status: 'stored',
        updatedAt: nowIso(),
      };
      this.saveManifestState();
    }

    return { ok: true };
  }

  assemble(fileId, outputPath = null) {
    const manifest = this.manifests[fileId];
    if (!manifest) {
      throw new Error('Manifest inconnu');
    }

    const chunksDir = path.join(DOWNLOAD_DIR, fileId);
    const finalPath = outputPath || path.join(DOWNLOAD_DIR, `${manifest.filename}`);
    const fd = fs.openSync(finalPath, 'w');

    const hashAll = crypto.createHash('sha256');
    for (let i = 0; i < manifest.nbChunks; i += 1) {
      const chunkPath = path.join(chunksDir, `${i}.chunk`);
      const data = fs.readFileSync(chunkPath);
      hashAll.update(data);
      fs.writeSync(fd, data);
    }
    fs.closeSync(fd);

    const finalHash = hashAll.digest('hex');
    const ok = finalHash === manifest.fileId;
    manifest.status = ok ? 'complete' : 'corrupted';
    manifest.updatedAt = nowIso();
    manifest.outputPath = finalPath;
    manifest.finalHash = finalHash;
    const indexEntry = this.ensureIndexFile(fileId, manifest);
    indexEntry.assembledPath = finalPath;
    indexEntry.status = ok ? 'complete' : 'corrupted';
    indexEntry.updatedAt = nowIso();
    this.saveManifestState();

    this.logger.info(`Assembly ${ok ? 'OK' : 'FAILED'} for file ${manifest.filename}`);
    return { ok, finalPath, expectedHash: manifest.fileId, finalHash };
  }

  listManifests() {
    return Object.values(this.manifests);
  }

  listTransferProgress() {
    const out = [];
    const now = Date.now();

    for (const manifest of Object.values(this.manifests)) {
      if (!this.received.has(manifest.fileId)) this.hydrateReceivedSet(manifest.fileId, manifest);
      const set = this.received.get(manifest.fileId) || new Set();
      const receivedChunks = set.size;
      const missingChunks = Math.max(0, manifest.nbChunks - receivedChunks);
      const bytesReceived = this.calculateReceivedBytes(manifest, set);
      const totalBytes = manifest.size || 0;
      const progressPct = totalBytes > 0 ? Number(((bytesReceived / totalBytes) * 100).toFixed(2)) : 0;

      const startedMs = manifest.transferStartedAt ? Date.parse(manifest.transferStartedAt) : NaN;
      const elapsedSec = Number.isFinite(startedMs) ? Math.max(1, Math.floor((now - startedMs) / 1000)) : 1;
      const avgBytesPerSec = Math.floor(bytesReceived / elapsedSec);
      const remainingBytes = Math.max(0, totalBytes - bytesReceived);
      const etaSec = avgBytesPerSec > 0 ? Math.ceil(remainingBytes / avgBytesPerSec) : null;

      out.push({
        fileId: manifest.fileId,
        filename: manifest.filename,
        status: manifest.status,
        receivedChunks,
        totalChunks: manifest.nbChunks,
        missingChunks,
        bytesReceived,
        totalBytes,
        progressPct,
        avgBytesPerSec,
        etaSec,
        transferStartedAt: manifest.transferStartedAt || null,
        lastChunkAt: manifest.lastChunkAt || null,
      });
    }

    return out;
  }

  getManifest(fileId) {
    return this.manifests[fileId] || null;
  }

  getLocalChunkIndexes(fileId) {
    const manifest = this.manifests[fileId];
    if (!manifest) return [];
    if (!this.received.has(fileId)) this.hydrateReceivedSet(fileId, manifest);
    return Array.from(this.received.get(fileId)).sort((a, b) => a - b);
  }

  hasChunk(fileId, chunkIndex) {
    const manifest = this.manifests[fileId];
    if (!manifest) return false;
    if (!this.received.has(fileId)) this.hydrateReceivedSet(fileId, manifest);
    return this.received.get(fileId).has(chunkIndex);
  }
}
