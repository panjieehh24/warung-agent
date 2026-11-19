// Builds every network and the demo warungs, then checks each one is up to date.
// Usage: node scripts/build-all.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "vendor/agentify-website/scripts/build_network.mjs");

/** Sites built straight from their HOCON: [folder, network name]. */
const SITES = [
  ["site", "warung_builder"],
  ["site/pasar", "pasar"],
];

function run(args) {
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
}

function buildSite([folder, network]) {
  const dir = path.join(ROOT, folder);
  const hocon = path.join(dir, `${network}.hocon`);
  const manifest = path.join(dir, "agent-manifest.json");
  run([BUILD, hocon, "--manifest", manifest]);
  run([BUILD, hocon, "--manifest", manifest, "--check"]);
}

run([path.join(ROOT, "scripts/build-kit.mjs")]);
run([path.join(ROOT, "scripts/make-demo.mjs")]);
SITES.forEach(buildSite);
console.log("build-all: every network built and checked.");
