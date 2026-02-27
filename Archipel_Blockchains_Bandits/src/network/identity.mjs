import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function resolveNodeIdHex(nodeName, tcpPort, keysDir) {
  const pubPath = join(keysDir, `${nodeName}_ed25519.pub.pem`);
  const seed = existsSync(pubPath)
    ? readFileSync(pubPath, "utf8")
    : `${nodeName}:${tcpPort}:no-key`;
  return createHash("sha256").update(seed).digest("hex");
}
