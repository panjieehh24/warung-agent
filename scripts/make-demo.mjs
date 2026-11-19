// Makes one warung site per data/demo/<slug>.json: the kit's files, personalized, in
// demo/<slug>/. Then checks each one with build_network.mjs --check.
// Run scripts/build-kit.mjs first. Usage: node scripts/make-demo.mjs
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeRootHeaders, packageSite } from "../site/kit/warung-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT_DIR = path.join(ROOT, "site/kit/warung");
const DATA_DIR = path.join(ROOT, "data/demo");
const DEMO_DIR = path.join(ROOT, "demo");
const BUILD = path.join(ROOT, "vendor/agentify-website/scripts/build_network.mjs");

async function readKit() {
  const names = JSON.parse(await readFile(path.join(KIT_DIR, "files.json"), "utf8"));
  const files = new Map();
  for (const name of names) {
    files.set(name, await readFile(path.join(KIT_DIR, name), "utf8"));
  }
  return files;
}

async function writeFiles(dir, files) {
  for (const [name, text] of files) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), text);
  }
}

function check(out) {
  execFileSync(process.execPath, [BUILD, path.join(out, "warung.hocon"), "--manifest", path.join(out, "agent-manifest.json"), "--check"], { stdio: "inherit" });
}

async function main() {
  const kit = await readKit();
  const slugs = (await readdir(DATA_DIR)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
  await rm(DEMO_DIR, { recursive: true, force: true });
  const headers = [];
  for (const slug of slugs) {
    const data = JSON.parse(await readFile(path.join(DATA_DIR, `${slug}.json`), "utf8"));
    // The file name is the slug, so the network URL is /<slug>/warung (Pasar expects that).
    const packaged = packageSite(kit, data, slug);
    packaged.delete("_headers");
    packaged.delete("index.html");
    await writeFiles(DEMO_DIR, packaged);
    check(path.join(DEMO_DIR, slug));
    headers.push([slug, kit.get("_headers")]);
    console.log(`make-demo: demo/${slug}/ ok`);
  }
  const links = slugs.map((slug) => `<li><a href="./${slug}/">${slug}</a></li>`).join("");
  await writeFiles(DEMO_DIR, new Map([
    ["_headers", mergeRootHeaders(headers)],
    ["index.html", `<!doctype html>\n<html lang="id"><head><meta charset="utf-8"><title>Demo warung</title></head>\n<body><h1>Demo warung</h1><ul>${links}</ul></body></html>\n`],
  ]));
}

await main();
