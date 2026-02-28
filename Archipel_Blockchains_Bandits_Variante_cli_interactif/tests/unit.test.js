import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { loadOrCreateIdentity, signPayload, verifySignature } from '../src/crypto/identity.js';
import { FileTransferManager } from '../src/transfer/fileTransfer.js';
import { isTimestampFresh } from '../src/core/time.js';
import { HANDSHAKE_MAX_SKEW_MS, PEER_PRUNE_MS } from '../src/core/constants.js';
import { PeerTable } from '../src/network/peerTable.js';

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archipel-unit-'));
}

test('identity signatures are valid for same payload', () => {
  const tmp = mkTmpDir();
  const prev = process.cwd();
  process.chdir(tmp);

  try {
    const identity = loadOrCreateIdentity('unit-node');
    const payload = Buffer.from('hello-archipel', 'utf8');
    const sig = signPayload(payload, identity.privateKeyObj);
    const ok = verifySignature(payload, sig, identity.publicKeyPem);
    assert.equal(ok, true);
  } finally {
    process.chdir(prev);
  }
});

test('resume detects only missing chunks', () => {
  const tmp = mkTmpDir();
  const prev = process.cwd();
  process.chdir(tmp);

  try {
    fs.mkdirSync('.archipel', { recursive: true });
    const file = path.join(tmp, 'sample.bin');
    fs.writeFileSync(file, crypto.randomBytes(1024 * 1024));

    const logger = { info() {}, warn() {}, error() {} };
    const t1 = new FileTransferManager({ logger });
    const manifest = t1.buildManifest(file, 'sender-node');
    t1.acceptManifest(manifest, { resume: true });

    const chunk0 = t1.readChunkAt(file, manifest.chunkSize, 0);
    const r0 = t1.receiveChunk(manifest.fileId, 0, chunk0.dataB64, chunk0.hash);
    assert.equal(r0.ok, true);

    const t2 = new FileTransferManager({ logger });
    t2.acceptManifest(manifest, { resume: true });

    const missing = t2.getMissingChunkIndexes(manifest.fileId);
    assert.equal(missing.includes(0), false);
    assert.equal(missing.length, manifest.nbChunks - 1);
  } finally {
    process.chdir(prev);
  }
});

test('signature verification fails when payload changes', () => {
  const tmp = mkTmpDir();
  const prev = process.cwd();
  process.chdir(tmp);

  try {
    const identity = loadOrCreateIdentity('unit-node-2');
    const payload = Buffer.from('payload-a', 'utf8');
    const sig = signPayload(payload, identity.privateKeyObj);
    const tampered = Buffer.from('payload-b', 'utf8');
    assert.equal(verifySignature(tampered, sig, identity.publicKeyPem), false);
  } finally {
    process.chdir(prev);
  }
});

test('timestamp freshness rejects stale handshakes', () => {
  const now = Date.now();
  assert.equal(isTimestampFresh(now, HANDSHAKE_MAX_SKEW_MS, now), true);
  assert.equal(isTimestampFresh(now - HANDSHAKE_MAX_SKEW_MS - 1, HANDSHAKE_MAX_SKEW_MS, now), false);
  assert.equal(isTimestampFresh(now + HANDSHAKE_MAX_SKEW_MS + 1, HANDSHAKE_MAX_SKEW_MS, now), false);
});

test('peer table prunes very old peers', () => {
  const tmp = mkTmpDir();
  const prev = process.cwd();
  process.chdir(tmp);

  try {
    fs.mkdirSync('.archipel', { recursive: true });
    const table = new PeerTable();
    table.upsert({ nodeId: 'peer-recent', ip: '127.0.0.1', tcpPort: 7777 });
    table.upsert({ nodeId: 'peer-old', ip: '127.0.0.1', tcpPort: 7778 });
    table.peers.get('peer-old').lastSeen = Date.now() - PEER_PRUNE_MS - 1;
    const list = table.list();
    assert.equal(list.some((p) => p.nodeId === 'peer-old'), false);
    assert.equal(list.some((p) => p.nodeId === 'peer-recent'), true);
  } finally {
    process.chdir(prev);
  }
});
