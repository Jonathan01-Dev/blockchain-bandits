import crypto from 'node:crypto';
import path from 'node:path';
import { ensureDir, readJson, writeJson } from '../core/files.js';
import { KEY_DIR } from '../core/constants.js';

function nodeKeyPath(nodeName) {
  return path.join(KEY_DIR, `${nodeName}.json`);
}

function exportPubPem(keyObj) {
  return keyObj.export({ format: 'pem', type: 'spki' }).toString();
}

function exportPrivPem(keyObj) {
  return keyObj.export({ format: 'pem', type: 'pkcs8' }).toString();
}

export function nodeIdFromPublicKeyPem(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 64);
}

export function loadOrCreateIdentity(nodeName) {
  ensureDir(KEY_DIR);
  const file = nodeKeyPath(nodeName);
  const existing = readJson(file, null);

  if (existing?.privateKeyPem && existing?.publicKeyPem && existing?.nodeId) {
    return {
      nodeId: existing.nodeId,
      publicKeyPem: existing.publicKeyPem,
      privateKeyPem: existing.privateKeyPem,
      privateKeyObj: crypto.createPrivateKey(existing.privateKeyPem),
      publicKeyObj: crypto.createPublicKey(existing.publicKeyPem),
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = exportPubPem(publicKey);
  const privateKeyPem = exportPrivPem(privateKey);
  const nodeId = nodeIdFromPublicKeyPem(publicKeyPem);

  writeJson(file, { nodeId, publicKeyPem, privateKeyPem, createdAt: new Date().toISOString() });

  return {
    nodeId,
    publicKeyPem,
    privateKeyPem,
    privateKeyObj: privateKey,
    publicKeyObj: publicKey,
  };
}

export function signPayload(payloadBuffer, privateKeyObj) {
  return crypto.sign(null, payloadBuffer, privateKeyObj).toString('base64');
}

export function verifySignature(payloadBuffer, signatureB64, publicKeyPem) {
  try {
    return crypto.verify(null, payloadBuffer, crypto.createPublicKey(publicKeyPem), Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
