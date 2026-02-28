import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(filePath) {
  const raw = readFileSync(filePath);
  return sha256Buffer(raw);
}
