import { createHash, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function fingerprint(publicKeyPem) {
  return createHash("sha256").update(publicKeyPem, "utf8").digest("hex");
}

export class TrustStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.map = new Map();
    this.load();
  }

  load() {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const entries = JSON.parse(raw);
      this.map = new Map(entries.map((x) => [x.node_id, this.normalize(x)]));
    } catch {
      this.map = new Map();
    }
  }

  normalize(entry) {
    return {
      ...entry,
      trust_mode: entry.trust_mode ?? "TOFU",
      trust_score: entry.trust_score ?? 1,
      endorsements: Array.isArray(entry.endorsements) ? entry.endorsements : [],
      revoked: Boolean(entry.revoked),
      revoked_at: entry.revoked_at ?? null,
      revocation: entry.revocation ?? null,
    };
  }

  save() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify([...this.map.values()], null, 2), "utf8");
  }

  verifyOrTrust(nodeId, publicKeyPem) {
    const fp = fingerprint(publicKeyPem);
    const known = this.map.get(nodeId);
    if (!known) {
      this.map.set(
        nodeId,
        this.normalize({
          node_id: nodeId,
          public_key_pem: publicKeyPem,
          fingerprint: fp,
          trust_mode: "TOFU",
          trust_score: 1,
          endorsements: [],
          revoked: false,
          revoked_at: null,
          revocation: null,
          first_seen: Date.now(),
          last_seen: Date.now(),
        })
      );
      this.save();
      return { trusted: true, tofu: true };
    }
    if (known.revoked) {
      return { trusted: false, reason: "key revoked by local policy" };
    }
    if (known.fingerprint !== fp || known.public_key_pem !== publicKeyPem) {
      return { trusted: false, reason: "public key changed (possible MITM)" };
    }
    known.last_seen = Date.now();
    this.map.set(nodeId, known);
    this.save();
    return { trusted: true, tofu: false };
  }

  getPublicKeyPem(nodeId) {
    return this.map.get(nodeId)?.public_key_pem ?? null;
  }

  list() {
    return [...this.map.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
  }

  endorse(nodeId, signerNodeId, signerPrivateKey, note = "") {
    const known = this.map.get(nodeId);
    if (!known) return { ok: false, reason: "unknown node_id" };
    if (known.revoked) return { ok: false, reason: "node is revoked" };

    const ts = Date.now();
    const statement = `${nodeId}|${known.fingerprint}|ENDORSE|${ts}|${note}`;
    const signature = sign(null, Buffer.from(statement, "utf8"), signerPrivateKey).toString("base64");
    known.endorsements.push({
      by: signerNodeId,
      ts,
      note,
      signature,
    });
    known.trust_mode = "TOFU+ENDORSED";
    known.trust_score = Math.max(known.trust_score ?? 1, 1) + 1;
    known.last_seen = ts;
    this.map.set(nodeId, known);
    this.save();
    return { ok: true, trust_score: known.trust_score };
  }

  revoke(nodeId, signerNodeId, signerPrivateKey, reason = "manual revoke") {
    const known = this.map.get(nodeId);
    if (!known) return { ok: false, reason: "unknown node_id" };

    const ts = Date.now();
    const statement = `${nodeId}|${known.fingerprint}|REVOKE|${ts}|${reason}`;
    const signature = sign(null, Buffer.from(statement, "utf8"), signerPrivateKey).toString("base64");
    known.revoked = true;
    known.revoked_at = ts;
    known.trust_mode = "REVOKED";
    known.trust_score = 0;
    known.revocation = {
      by: signerNodeId,
      ts,
      reason,
      signature,
    };
    this.map.set(nodeId, known);
    this.save();
    return { ok: true };
  }
}
