// Builds the warung kit: copies the shared data module into it, builds its network, and
// writes site/kit/warung/files.json, the sorted list of files a shop owner downloads.
// Usage: node scripts/build-kit.mjs
import { execFileSync } from "node:child_process";
import { copyFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT_DIR = path.join(ROOT, "site/kit/warung");
const BUILD = path.join(ROOT, "vendor/agentify-website/scripts/build_network.mjs");
// Not shipped: the tests, and the list itself. The HOCON ships: it is the network's source.
const NOT_SHIPPED = new Set(["tests", "files.json", ".DS_Store"]);

async function listFiles(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (NOT_SHIPPED.has(entry.name) && (prefix === "" || entry.name === ".DS_Store")) {
      continue;
    }
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await listFiles(path.join(dir, entry.name), relative)));
    } else {
      found.push(relative);
    }
  }
  return found;
}

async function main() {
  await copyFile(path.join(ROOT, "site/kit/warung-data.mjs"), path.join(KIT_DIR, "warung-data.mjs"));
  execFileSync(process.execPath, [BUILD, path.join(KIT_DIR, "warung.hocon"), "--manifest", path.join(KIT_DIR, "agent-manifest.json")], { stdio: "inherit" });
  const files = (await listFiles(KIT_DIR)).sort();
  await writeFile(path.join(KIT_DIR, "files.json"), `${JSON.stringify(files, null, 2)}\n`);
  console.log(`build-kit: ${files.length} files listed in site/kit/warung/files.json`);
}

await main();
