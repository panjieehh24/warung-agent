// Serves the main site and the demo warungs on two local origins, as in docs/design.md.
// Usage: node scripts/serve-all.mjs     (Ctrl+C stops both)
//
// main    http://localhost:8080  -> site/   (Builder, Pasar)
// warungs http://127.0.0.1:8081  -> demo/   (bu-sri, pak-budi)
// Each server logs one JSON line per request, including whether an Authorization header
// was sent, to requests-main.jsonl and requests-warungs.jsonl. The warungs log is the
// evidence that the visitor's key never reaches a peer site.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVE = path.join(ROOT, "scripts/dev-server.mjs");

const SERVERS = [
  { folder: "site", port: "8080", host: "localhost", log: "requests-main.jsonl" },
  { folder: "demo", port: "8081", host: "127.0.0.1", log: "requests-warungs.jsonl" },
];

const children = SERVERS.map(({ folder, port, host, log }) =>
  spawn(
    process.execPath,
    [SERVE, path.join(ROOT, folder), "--port", port, "--host", host, "--log", path.join(ROOT, log)],
    { stdio: "inherit" },
  ),
);

function stopAll() {
  children.forEach((child) => child.kill());
}

children.forEach((child) =>
  child.on("exit", (code) => {
    if (code) {
      console.error(`serve-all: a server exited with code ${code}; stopping the other.`);
      stopAll();
      process.exitCode = code;
    }
  }),
);
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
