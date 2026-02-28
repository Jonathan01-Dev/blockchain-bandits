import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class IndexStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      manifests: {},
    };
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch {
      this.data = { manifests: {} };
    }
  }

  save() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  upsertManifest(manifest) {
    this.data.manifests[manifest.file_id] = manifest;
    this.save();
  }

  getManifest(fileId) {
    return this.data.manifests[fileId] ?? null;
  }

  listManifests() {
    return Object.values(this.data.manifests);
  }
}
