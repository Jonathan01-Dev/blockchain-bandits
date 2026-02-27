import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

function parseArgs(argv) {
  const options = {
    nodeName: "node-1",
    keysDir: ".archipel/keys",
    force: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--node-name") options.nodeName = argv[++i];
    else if (arg === "--keys-dir") options.keysDir = argv[++i];
    else if (arg === "--force") options.force = true;
  }

  return options;
}

function main() {
  const { nodeName, keysDir, force } = parseArgs(process.argv);
  const absDir = resolve(keysDir);
  const privatePath = join(absDir, `${nodeName}_ed25519.pem`);
  const publicPath = join(absDir, `${nodeName}_ed25519.pub.pem`);

  mkdirSync(absDir, { recursive: true });
  if (!force && (existsSync(privatePath) || existsSync(publicPath))) {
    throw new Error(`Keys already exist for ${nodeName}. Use --force to overwrite.`);
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(
    privatePath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
    { encoding: "utf8" }
  );
  writeFileSync(
    publicPath,
    publicKey.export({ type: "spki", format: "pem" }),
    { encoding: "utf8" }
  );

  console.log("Archipel keys generated:");
  console.log(`- private: ${privatePath}`);
  console.log(`- public : ${publicPath}`);
}

main();
