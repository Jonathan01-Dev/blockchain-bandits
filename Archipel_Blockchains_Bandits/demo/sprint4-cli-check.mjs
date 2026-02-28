import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";

const cli = resolve("src/cli/archipel.mjs");
const keygen = resolve("src/crypto/generate-keys.mjs");
const dataDir = resolve(".archipel/sprint4-check");

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

execFileSync(process.execPath, [keygen, "--node-name", "machine-1", "--force"], { stdio: "inherit" });

const env = {
  ...process.env,
  ARCHIPEL_DATA_DIR: dataDir,
};

execFileSync(process.execPath, [cli, "status", "--node-name", "machine-1"], { stdio: "inherit", env });

const sampleFile = resolve(".archipel/sprint4-check/sample.bin");
writeFileSync(sampleFile, Buffer.from("archipel-sprint4", "utf8"));

execFileSync(process.execPath, [cli, "send", "--node-name", "machine-1", "--file", sampleFile], {
  stdio: "inherit",
  env,
});

execFileSync(process.execPath, [cli, "receive", "--node-name", "machine-1"], { stdio: "inherit", env });
execFileSync(process.execPath, [cli, "ask", "--prompt", "offline", "--no-ai"], { stdio: "inherit", env });

console.log("Sprint 4 CLI check passed");
