import fs from 'node:fs';
import path from 'node:path';
import { makeLogger } from './logger.js';
import { ensureDir } from './files.js';
import {
  STORAGE_ROOT,
  CHUNK_MAX_RETRIES,
  CHUNK_RETRY_BASE_MS,
  REQUEST_TIMEOUT_MS,
  DEFAULT_REPLICATION_FACTOR,
} from './constants.js';
import { loadOrCreateIdentity, signPayload, verifySignature, nodeIdFromPublicKeyPem } from '../crypto/identity.js';
import { TrustStore } from '../crypto/trustStore.js';
import { PeerTable } from '../network/peerTable.js';
import { DiscoveryService } from '../network/discovery.js';
import { SecureTcpService } from '../network/secureTcp.js';
import { FileTransferManager } from '../transfer/fileTransfer.js';
import { GeminiAssistant } from '../ai/gemini.js';

export class ArchipelNode {
  constructor({ port, noAi = false, replicationFactor = DEFAULT_REPLICATION_FACTOR }) {
    ensureDir(STORAGE_ROOT);
    this.port = Number(port);
    this.nodeName = `node-${this.port}`;
    this.identity = loadOrCreateIdentity(this.nodeName);
    this.logger = makeLogger(this.identity.nodeId.slice(0, 8));
    this.trustStore = new TrustStore();
    this.peerTable = new PeerTable();
    this.transfer = new FileTransferManager({ logger: this.logger });
    this.sharedFiles = new Map();
    this.replicationFactor = Number(replicationFactor) || DEFAULT_REPLICATION_FACTOR;
    this.ai = new GeminiAssistant({ enabled: !noAi, logger: this.logger });

    this.discovery = new DiscoveryService({
      identity: this.identity,
      tcpPort: this.port,
      peerTable: this.peerTable,
      logger: this.logger,
      getSharedFileIds: () => Array.from(this.sharedFiles.keys()),
    });

    this.tcp = new SecureTcpService({
      identity: this.identity,
      trustStore: this.trustStore,
      peerTable: this.peerTable,
      logger: this.logger,
      onSecurePayload: (ctx) => this.onSecurePayload(ctx),
    });

    this.stats = {
      receivedMessages: 0,
      sentMessages: 0,
      receivedChunks: 0,
      sentChunks: 0,
      chunkRetryAttempts: 0,
      requestTimeouts: 0,
      startedAt: Date.now(),
    };
  }

  start() {
    this.discovery.start();
    this.tcp.start(this.port);
    this.persistLoop = setInterval(() => this.peerTable.save(), 10_000);
    this.logger.info(`Node started on TCP ${this.port}`);
    this.logger.info(`Node ID: ${this.identity.nodeId}`);
  }

  stop() {
    if (this.persistLoop) clearInterval(this.persistLoop);
    this.persistLoop = null;
    this.discovery.stop();
    this.tcp.stop();
    this.peerTable.save();
  }

  resolvePeerByPrefix(prefix) {
    const peers = this.peerTable.list();
    return peers.find((p) => p.nodeId.startsWith(prefix));
  }

  listPeers() {
    return this.peerTable.list();
  }

  listTrust() {
    return this.trustStore.list();
  }

  async approvePeer(peerPrefix) {
    const peer = this.resolvePeerByPrefix(peerPrefix);
    if (!peer) throw new Error('Pair introuvable');
    const entry = this.trustStore.approve(peer.nodeId);
    const trustSig = this.signTrustForPeer(peer.nodeId, peer.publicKeyPem);
    this.trustStore.addSignature(peer.nodeId, trustSig);
    await this.propagateTrustSignature(peer.nodeId, trustSig);
    return { nodeId: peer.nodeId, entry, trustSig };
  }

  revokePeer(peerPrefix, reason = 'manual_revoke') {
    const peer = this.resolvePeerByPrefix(peerPrefix);
    if (!peer) throw new Error('Pair introuvable');
    const entry = this.trustStore.revoke(peer.nodeId, reason);
    return { nodeId: peer.nodeId, entry };
  }

  trustSignablePayload(targetNodeId, targetPublicKeyPem) {
    return {
      targetNodeId,
      targetPublicKeyPem,
      signerNodeId: this.identity.nodeId,
      ts: Date.now(),
    };
  }

  signTrustForPeer(targetNodeId, targetPublicKeyPem) {
    const signable = this.trustSignablePayload(targetNodeId, targetPublicKeyPem);
    const signature = signPayload(Buffer.from(JSON.stringify(signable), 'utf8'), this.identity.privateKeyObj);
    return { ...signable, signature };
  }

  manifestSignable(manifest) {
    const { signature, ...signable } = manifest;
    return signable;
  }

  signManifest(manifest) {
    const signable = this.manifestSignable(manifest);
    return signPayload(Buffer.from(JSON.stringify(signable), 'utf8'), this.identity.privateKeyObj);
  }

  verifyManifest(manifest) {
    if (!manifest?.senderPublicKeyPem || !manifest?.signature || !manifest?.senderId) {
      return { ok: false, reason: 'manifest_missing_signature' };
    }

    const computedNodeId = nodeIdFromPublicKeyPem(manifest.senderPublicKeyPem);
    if (computedNodeId !== manifest.senderId) {
      return { ok: false, reason: 'manifest_sender_mismatch' };
    }

    const trust = this.trustStore.isTrusted(manifest.senderId, manifest.senderPublicKeyPem);
    if (!trust.ok) return { ok: false, reason: 'manifest_trust_mismatch' };

    const signable = this.manifestSignable(manifest);
    const ok = verifySignature(
      Buffer.from(JSON.stringify(signable), 'utf8'),
      manifest.signature,
      manifest.senderPublicKeyPem,
    );
    return ok ? { ok: true } : { ok: false, reason: 'manifest_bad_signature' };
  }

  chunkSignablePayload(payload) {
    return {
      fileId: payload.fileId,
      chunkIndex: payload.chunkIndex,
      hash: payload.hash,
      size: payload.size,
      senderId: payload.senderId,
    };
  }

  verifyChunkSignature(payload, publicKeyPem) {
    if (!payload.signature) return false;
    const signable = this.chunkSignablePayload(payload);
    return verifySignature(Buffer.from(JSON.stringify(signable), 'utf8'), payload.signature, publicKeyPem);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async requestChunkWithRetry(peer, fileId, chunkIndex, maxRetries = CHUNK_MAX_RETRIES) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const res = await this.tcp.sendSecureRequest(
          peer,
          {
            op: 'CHUNK_REQ',
            fileId,
            chunkIndex,
          },
          { timeoutMs: REQUEST_TIMEOUT_MS },
        );
        if (!res?.ok) throw new Error(res?.reason || 'chunk_req_failed');
        if (!this.verifyChunkSignature(res, peer.publicKeyPem)) throw new Error('chunk_bad_signature');
        this.peerTable.updateReputation(peer.nodeId, true);
        return res;
      } catch (err) {
        lastError = err;
        this.peerTable.updateReputation(peer.nodeId, false);
        if (String(err.message || '').includes('timeout')) {
          this.stats.requestTimeouts += 1;
        }
        if (attempt < maxRetries) {
          this.stats.chunkRetryAttempts += 1;
          const backoff = CHUNK_RETRY_BASE_MS * (2 ** attempt);
          await this.sleep(backoff);
        }
      }
    }

    throw lastError || new Error('chunk_request_failed');
  }

  async sendMessage(peerPrefix, text) {
    const peer = this.resolvePeerByPrefix(peerPrefix);
    if (!peer) throw new Error('Pair introuvable');

    const response = await this.tcp.sendSecureRequest(peer, {
      op: 'MSG',
      from: this.identity.nodeId,
      text,
      ts: Date.now(),
    });

    this.stats.sentMessages += 1;
    return response;
  }

  async askAi(question) {
    const res = await this.ai.ask(question);
    if (!res.ok) {
      throw new Error(`AI indisponible: ${res.reason}`);
    }
    return res.text;
  }

  async propagateTrustSignature(targetNodeId, signaturePayload) {
    const peers = this.peerTable.list().filter((p) => p.status === 'online');
    await Promise.all(peers.map(async (peer) => {
      if (peer.nodeId === targetNodeId) return;
      try {
        await this.tcp.sendSecureRequest(peer, {
          op: 'TRUST_UPDATE',
          ...signaturePayload,
        });
      } catch {
        // best effort propagation
      }
    }));
  }

  async sendFile(peerPrefix, filePath) {
    const peer = this.resolvePeerByPrefix(peerPrefix);
    if (!peer) throw new Error('Pair introuvable');
    if (!fs.existsSync(filePath)) throw new Error('Fichier introuvable');

    const manifest = this.shareFile(filePath);
    const offerResp = await this.tcp.sendSecureRequest(peer, { op: 'MANIFEST_OFFER', manifest });
    if (!offerResp?.ok) throw new Error(`Refus manifest: ${offerResp?.reason || 'unknown'}`);

    for (const chunk of this.transfer.readFileChunks(filePath, manifest.chunkSize)) {
      const signable = this.chunkSignablePayload({
        fileId: manifest.fileId,
        chunkIndex: chunk.index,
        hash: chunk.hash,
        size: chunk.size,
        senderId: this.identity.nodeId,
      });
      const signature = signPayload(Buffer.from(JSON.stringify(signable), 'utf8'), this.identity.privateKeyObj);
      const ack = await this.tcp.sendSecureRequest(peer, {
        op: 'CHUNK_DATA',
        fileId: manifest.fileId,
        chunkIndex: chunk.index,
        dataB64: chunk.dataB64,
        hash: chunk.hash,
        size: chunk.size,
        senderId: this.identity.nodeId,
        signature,
      });
      if (!ack?.ok) throw new Error(`Chunk ${chunk.index} reject: ${ack?.reason}`);
      this.stats.sentChunks += 1;
    }

    const finalize = await this.tcp.sendSecureRequest(peer, {
      op: 'ASSEMBLE_REQUEST',
      fileId: manifest.fileId,
    });

    return { manifest, finalize };
  }

  shareFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('Fichier introuvable');
    const manifest = this.transfer.buildManifest(filePath, this.identity.nodeId);
    manifest.replicationFactorTarget = this.replicationFactor;
    manifest.senderPublicKeyPem = this.identity.publicKeyPem;
    manifest.signature = this.signManifest(manifest);
    this.sharedFiles.set(manifest.fileId, { filePath, manifest });
    this.transfer.acceptManifest(manifest, { resume: true });
    this.transfer.registerProvider(manifest.fileId, this.identity.nodeId);
    this.discovery.sendHello();
    return manifest;
  }

  async pullFile(peerPrefix, fileId, outputPath = null) {
    const peer = this.resolvePeerByPrefix(peerPrefix);
    if (!peer) throw new Error('Pair introuvable');

    const info = await this.tcp.sendSecureRequest(peer, { op: 'FILE_INFO_REQUEST', fileId });
    if (!info?.ok || !info?.manifest) {
      throw new Error(info?.reason || 'Manifest distant introuvable');
    }
    const manifestCheck = this.verifyManifest(info.manifest);
    if (!manifestCheck.ok) throw new Error(`Manifest invalide: ${manifestCheck.reason}`);

    this.transfer.acceptManifest(info.manifest, { resume: true });
    this.transfer.registerProvider(fileId, peer.nodeId);

    const missing = this.transfer.getMissingChunkIndexes(fileId);
    for (const i of missing) {
      const res = await this.requestChunkWithRetry(peer, fileId, i);

      const store = this.transfer.receiveChunk(fileId, i, res.dataB64, res.hash);
      if (!store.ok) throw new Error(`Chunk ${i} invalide: ${store.reason}`);
      this.stats.receivedChunks += 1;
    }

    const assembled = this.transfer.assemble(fileId, outputPath);
    if (assembled.ok) {
      this.sharedFiles.set(fileId, {
        filePath: assembled.finalPath,
        manifest: info.manifest,
      });
      this.discovery.sendHello();
    }
    return assembled;
  }

  findSourcePeers(fileId) {
    return this.peerTable
      .list()
      .filter((p) => p.status === 'online' && Array.isArray(p.sharedFileIds) && p.sharedFileIds.includes(fileId));
  }

  async pullFileMulti(fileId, outputPath = null, parallelism = 3) {
    const peers = this.findSourcePeers(fileId);
    if (peers.length === 0) throw new Error('Aucune source disponible pour ce file_id');

    let info = null;
    for (const peer of peers) {
      try {
        const attempt = await this.tcp.sendSecureRequest(peer, { op: 'FILE_INFO_REQUEST', fileId });
        if (attempt?.ok && attempt?.manifest) {
          info = attempt;
          break;
        }
      } catch {
        // try next source
      }
    }

    if (!info?.manifest) throw new Error('Impossible de recuperer le manifest depuis les sources');
    const manifestCheck = this.verifyManifest(info.manifest);
    if (!manifestCheck.ok) throw new Error(`Manifest invalide: ${manifestCheck.reason}`);
    this.transfer.acceptManifest(info.manifest, { resume: true });
    peers.forEach((p) => this.transfer.registerProvider(fileId, p.nodeId));

    const chunkMapByPeer = new Map();
    await Promise.all(peers.map(async (peer) => {
      try {
        const mapResp = await this.tcp.sendSecureRequest(peer, { op: 'CHUNK_MAP_REQUEST', fileId });
        if (mapResp?.ok && Array.isArray(mapResp.chunkIndexes)) {
          chunkMapByPeer.set(peer.nodeId, new Set(mapResp.chunkIndexes));
          return;
        }
      } catch {
        // ignore unavailable source
      }
      chunkMapByPeer.set(
        peer.nodeId,
        new Set(Array.from({ length: info.manifest.nbChunks }, (_, i) => i)),
      );
    }));

    const missing = this.transfer.getMissingChunkIndexes(fileId);
    const rarity = new Map();
    for (const idx of missing) {
      let count = 0;
      for (const set of chunkMapByPeer.values()) {
        if (set.has(idx)) count += 1;
      }
      rarity.set(idx, count || Number.MAX_SAFE_INTEGER);
    }
    const pendingQueue = missing.sort((a, b) => rarity.get(a) - rarity.get(b));
    let nextIndex = 0;
    let failures = 0;

    const fetchChunkWithFallback = async (chunkIndex, seed) => {
      const peersWithChunk = peers.filter((p) => (chunkMapByPeer.get(p.nodeId) || new Set()).has(chunkIndex));
      const selection = peersWithChunk.length > 0 ? peersWithChunk : peers;
      const orderedPeers = selection.map((_, i) => selection[(seed + i) % selection.length]);
      for (const peer of orderedPeers) {
        try {
          const res = await this.requestChunkWithRetry(peer, fileId, chunkIndex);
          const store = this.transfer.receiveChunk(fileId, chunkIndex, res.dataB64, res.hash);
          if (!store.ok) continue;
          this.stats.receivedChunks += 1;
          return true;
        } catch {
          // fallback next peer
        }
      }
      return false;
    };

    if (pendingQueue.length === 0) {
      return this.transfer.assemble(fileId, outputPath);
    }

    const workers = Array.from(
      { length: Math.max(1, Math.min(parallelism, pendingQueue.length)) },
      (_, workerId) =>
      (async () => {
        while (true) {
          const queueIndex = nextIndex;
          nextIndex += 1;
          if (queueIndex >= pendingQueue.length) return;
          const chunkIndex = pendingQueue[queueIndex];

          const ok = await fetchChunkWithFallback(chunkIndex, workerId + chunkIndex);
          if (!ok) failures += 1;
        }
      })(),
    );

    await Promise.all(workers);

    if (failures > 0) {
      throw new Error(`Telechargement incomplet: ${failures} chunk(s) non recuperes`);
    }

    const assembled = this.transfer.assemble(fileId, outputPath);
    if (assembled.ok) {
      this.sharedFiles.set(fileId, {
        filePath: assembled.finalPath,
        manifest: info.manifest,
      });
      this.discovery.sendHello();
    }
    return assembled;
  }

  assemble(fileId, outputPath = null) {
    return this.transfer.assemble(fileId, outputPath);
  }

  status() {
    const uptimeSec = Math.floor((Date.now() - this.stats.startedAt) / 1000);
    const transferProgress = this.transfer.listTransferProgress().map((t) => ({
      ...t,
      sourcesOnline: this.findSourcePeers(t.fileId).length,
    }));

    return {
      nodeId: this.identity.nodeId,
      port: this.port,
      uptimeSec,
      peersOnline: this.peerTable.list().filter((p) => p.status === 'online').length,
      peersTotal: this.peerTable.list().length,
      stats: this.stats,
      aiEnabled: this.ai.enabled,
      aiAvailable: this.ai.isAvailable(),
      replicationFactor: this.replicationFactor,
      sharedFiles: Array.from(this.sharedFiles.keys()),
      transferProgress,
      manifests: this.transfer.listManifests().map((m) => ({
        fileId: m.fileId,
        filename: m.filename,
        status: m.status,
        progress: `${m.receivedChunks || 0}/${m.nbChunks}`,
      })),
    };
  }

  onSecurePayload({ payload, reply }) {
    if (payload.op === 'MSG') {
      this.stats.receivedMessages += 1;
      this.logger.info(`Encrypted message from ${payload.from.slice(0, 8)}: ${payload.text}`);
      const txt = String(payload.text || '').trim();
      if (txt.startsWith('@archipel-ai') || txt.startsWith('/ask')) {
        const query = txt.replace(/^@archipel-ai\s*/, '').replace(/^\/ask\s*/, '').trim();
        (async () => {
          const res = await this.ai.ask(query, [{ role: 'user', text: txt }]);
          if (res.ok) {
            this.logger.info(`AI response: ${res.text}`);
            reply({ ok: true, receivedAt: Date.now(), ai: true, response: res.text });
            return;
          }
          reply({ ok: true, receivedAt: Date.now(), ai: false, aiError: res.reason });
        })();
        return;
      }

      this.ai.addContextMessage('user', txt);
      reply({ ok: true, receivedAt: Date.now() });
      return;
    }

    if (payload.op === 'MANIFEST_OFFER') {
      const manifestCheck = this.verifyManifest(payload.manifest);
      if (!manifestCheck.ok) {
        reply({ ok: false, reason: manifestCheck.reason });
        return;
      }
      this.transfer.acceptManifest(payload.manifest);
      this.logger.info(`Manifest accepted: ${payload.manifest.filename} (${payload.manifest.nbChunks} chunks)`);
      reply({ ok: true });
      return;
    }

    if (payload.op === 'CHUNK_DATA') {
      const peer = this.peerTable.get(payload.senderId);
      if (!peer?.publicKeyPem || !this.verifyChunkSignature(payload, peer.publicKeyPem)) {
        reply({ ok: false, reason: 'chunk_bad_signature' });
        return;
      }
      const res = this.transfer.receiveChunk(payload.fileId, payload.chunkIndex, payload.dataB64, payload.hash);
      if (res.ok) this.stats.receivedChunks += 1;
      reply(res.ok ? { ok: true } : { ok: false, reason: res.reason });
      return;
    }

    if (payload.op === 'ASSEMBLE_REQUEST') {
      try {
        const result = this.transfer.assemble(payload.fileId);
        reply({ ok: result.ok, result });
      } catch (err) {
        reply({ ok: false, reason: err.message });
      }
      return;
    }

    if (payload.op === 'FILE_INFO_REQUEST') {
      const shared = this.sharedFiles.get(payload.fileId);
      if (!shared) {
        reply({ ok: false, reason: 'file_not_shared' });
        return;
      }
      reply({ ok: true, manifest: shared.manifest });
      return;
    }

    if (payload.op === 'CHUNK_REQ') {
      const shared = this.sharedFiles.get(payload.fileId);
      const manifest = shared?.manifest || this.transfer.getManifest(payload.fileId);
      if (!manifest) {
        reply({ ok: false, reason: 'file_not_known' });
        return;
      }

      let chunk = null;
      if (shared?.filePath) {
        chunk = this.transfer.readChunkAt(shared.filePath, manifest.chunkSize, payload.chunkIndex);
      }
      if (!chunk) {
        chunk = this.transfer.readStoredChunk(payload.fileId, payload.chunkIndex);
      }
      if (!chunk) {
        reply({ ok: false, reason: 'chunk_not_found' });
        return;
      }
      const signable = this.chunkSignablePayload({
        fileId: payload.fileId,
        chunkIndex: chunk.index,
        hash: chunk.hash,
        size: chunk.size,
        senderId: this.identity.nodeId,
      });
      const signature = signPayload(Buffer.from(JSON.stringify(signable), 'utf8'), this.identity.privateKeyObj);
      this.stats.sentChunks += 1;
      reply({
        ok: true,
        ...chunk,
        fileId: payload.fileId,
        chunkIndex: chunk.index,
        size: chunk.size,
        senderId: this.identity.nodeId,
        signature,
      });
      return;
    }

    if (payload.op === 'CHUNK_MAP_REQUEST') {
      let chunkIndexes = this.transfer.getLocalChunkIndexes(payload.fileId);
      if (chunkIndexes.length === 0) {
        const shared = this.sharedFiles.get(payload.fileId);
        if (shared?.manifest?.nbChunks) {
          chunkIndexes = Array.from({ length: shared.manifest.nbChunks }, (_, i) => i);
        }
      }
      reply({ ok: true, chunkIndexes });
      return;
    }

    if (payload.op === 'TRUST_UPDATE') {
      if (!payload?.targetNodeId || !payload?.targetPublicKeyPem || !payload?.signerNodeId || !payload?.signature) {
        reply({ ok: false, reason: 'invalid_trust_update' });
        return;
      }
      const signerPeer = this.peerTable.get(payload.signerNodeId);
      const signerPub = signerPeer?.publicKeyPem || this.trustStore.list()?.[payload.signerNodeId]?.publicKeyPem;
      if (!signerPub) {
        reply({ ok: false, reason: 'unknown_signer' });
        return;
      }
      const signable = {
        targetNodeId: payload.targetNodeId,
        targetPublicKeyPem: payload.targetPublicKeyPem,
        signerNodeId: payload.signerNodeId,
        ts: payload.ts,
      };
      const isValid = verifySignature(Buffer.from(JSON.stringify(signable), 'utf8'), payload.signature, signerPub);
      if (!isValid) {
        reply({ ok: false, reason: 'invalid_trust_signature' });
        return;
      }
      this.trustStore.addSignature(payload.targetNodeId, {
        signerNodeId: payload.signerNodeId,
        signature: payload.signature,
        ts: payload.ts || Date.now(),
      });
      reply({ ok: true });
      return;
    }

    if (payload.op === 'SHARED_FILES_REQUEST') {
      reply({ ok: true, fileIds: Array.from(this.sharedFiles.keys()) });
      return;
    }

    reply({ ok: false, reason: 'unknown_operation' });
  }
}
