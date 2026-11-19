// Switches the two origins (main site, demo warungs) everywhere they are written, then rebuilds.
// Usage: node scripts/set-origins.mjs --main https://you.github.io --warungs https://warung-agent-demo.pages.dev
//        node scripts/set-origins.mjs --local      (back to http://localhost:8080 and http://127.0.0.1:8081)
//        add --no-build to skip the rebuild (used by tests)
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL = { main: "http://localhost:8080", warungs: "http://127.0.0.1:8081" };

/** Folders that hold origins (site tests live under site/). runtime/ is vendored and never rewritten. */
const SEARCH_DIRS = ["site", "data"];
const SKIP_DIRS = new Set(["runtime", "lib", "node_modules"]);
const TEXT_EXT = new Set([".json", ".hocon", ".js", ".mjs", ".html", ".md"]);

/** Returns an origin string without a trailing slash, or throws for anything else. */
export function parseOrigin(value) {
  const url = new URL(value);
  if (url.origin !== value.replace(/\/$/, "")) throw new Error(`Not a bare origin: ${value}`);
  if (url.protocol !== "https:" && !Object.values(LOCAL).includes(url.origin)) {
    throw new Error(`Live origins must use https: ${value}`);
  }
  return url.origin;
}

/** Replaces each old origin with its new one. Pure: returns new text. */
export function swapOrigins(text, from, to) {
  return Object.keys(from).reduce((out, key) => out.replaceAll(from[key], to[key]), text);
}

function listTextFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listTextFiles(full);
    return TEXT_EXT.has(path.extname(entry.name)) ? [full] : [];
  });
}

/** Rewrites every file under root that mentions an old origin. Returns the changed paths. */
export function rewriteTree(root, from, to) {
  const files = SEARCH_DIRS.flatMap((d) => {
    try {
      return listTextFiles(path.join(root, d));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  });
  return files.filter((file) => {
    const before = readFileSync(file, "utf8");
    const after = swapOrigins(before, from, to);
    if (after === before) return false;
    writeFileSync(file, after);
    return true;
  });
}

function parseArgs(argv) {
  if (argv.includes("--local")) return { to: LOCAL, build: !argv.includes("--no-build") };
  const value = (flag) => {
    const i = argv.indexOf(flag);
    if (i < 0 || !argv[i + 1]) throw new Error(`Missing ${flag}. See the usage at the top of this file.`);
    return parseOrigin(argv[i + 1]);
  };
  return { to: { main: value("--main"), warungs: value("--warungs") }, build: !argv.includes("--no-build") };
}

function main(root, argv) {
  const configPath = path.join(root, "origins.json");
  const from = JSON.parse(readFileSync(configPath, "utf8"));
  const { to, build } = parseArgs(argv);
  if (to.main === to.warungs) throw new Error("The main site and the warungs need different origins.");
  const changed = rewriteTree(root, from, to);
  writeFileSync(configPath, `${JSON.stringify(to, null, 2)}\n`);
  console.log(`set-origins: ${changed.length} files updated; origins.json now ${JSON.stringify(to)}`);
  if (build) execFileSync(process.execPath, [path.join(root, "scripts/build-all.mjs")], { stdio: "inherit" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.argv.slice(2));
  } catch (error) {
    console.error(`set-origins: ${error.message}`);
    process.exitCode = 1;
  }
}
