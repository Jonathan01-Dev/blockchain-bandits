import { readJson, writeJson } from '../core/files.js';
import { TRUST_STORE_FILE } from '../core/constants.js';

export class TrustStore {
  constructor() {
    this.data = readJson(TRUST_STORE_FILE, {});
  }

  save() {
    writeJson(TRUST_STORE_FILE, this.data);
  }

  isTrusted(nodeId, publicKeyPem) {
    const entry = this.data[nodeId];
    if (entry?.revokedAt) {
      return { ok: false, status: 'revoked' };
    }

    if (!entry) {
      this.data[nodeId] = {
        publicKeyPem,
        firstSeenAt: new Date().toISOString(),
        state: 'trusted_tofu',
        signatures: [],
      };
      this.save();
      return { ok: true, status: 'tofu' };
    }

    if (this.data[nodeId].publicKeyPem !== publicKeyPem) {
      return { ok: false, status: 'mismatch' };
    }

    return { ok: true, status: 'known' };
  }

  ensureEntry(nodeId) {
    if (!this.data[nodeId]) {
      this.data[nodeId] = {
        firstSeenAt: new Date().toISOString(),
        state: 'trusted_tofu',
        signatures: [],
      };
    }
    if (!Array.isArray(this.data[nodeId].signatures)) this.data[nodeId].signatures = [];
    return this.data[nodeId];
  }

  approve(nodeId) {
    const entry = this.ensureEntry(nodeId);
    entry.state = 'approved';
    entry.approvedAt = new Date().toISOString();
    delete entry.revokedAt;
    this.save();
    return entry;
  }

  revoke(nodeId, reason = 'manual_revoke') {
    const entry = this.ensureEntry(nodeId);
    entry.state = 'revoked';
    entry.revokedAt = new Date().toISOString();
    entry.revocationReason = reason;
    this.save();
    return entry;
  }

  addSignature(targetNodeId, signatureObj) {
    const entry = this.ensureEntry(targetNodeId);
    const sigId = `${signatureObj.signerNodeId}:${signatureObj.signature}`;
    const exists = entry.signatures.some((s) => `${s.signerNodeId}:${s.signature}` === sigId);
    if (!exists) {
      entry.signatures.push(signatureObj);
      this.save();
    }
  }

  getSignatures(targetNodeId) {
    const entry = this.data[targetNodeId];
    return Array.isArray(entry?.signatures) ? entry.signatures : [];
  }

  list() {
    return this.data;
  }
}
