// Static server for local checks only. Mirrors GitHub Pages: CORS on everything, no cache,
// the sandbox worker CSP. Usage: node scripts/dev-server.mjs <folder> [--port N] [--host 127.0.0.1] [--log file.jsonl]
import { appendFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copied from vendor/agentify-website/scripts/serve_site.mjs.
const WORKER_CSP = "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2",
};

function logLine(file, request, urlPath, status) {
  const cookies = (request.headers.cookie || "").split(";").map((part) => part.split("=")[0].trim()).filter(Boolean);
  const record = {
    time: Date.now(),
    method: request.method,
    path: urlPath,
    status,
    origin: request.headers.origin || null,
    authorization: request.headers.authorization !== undefined,
    cookies,
  };
  appendFileSync(file, `${JSON.stringify(record)}\n`);
}

/**
 * Build (not start) the server for one folder.
 *
 * :param options: {log?: path of a JSONL file}
 */
export function createServer(folder, options = {}) {
  const rootPromise = realpath(folder);
  const inside = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);

  async function locate(root, decoded) {
    if (decoded.includes("\0")) return null;
    const target = path.resolve(root, `.${path.sep}${decoded}`);
    if (!inside(root, target)) return null;
    try {
      const real = await realpath(target);
      return inside(root, real) ? real : null;
    } catch {
      return target; // missing but inside: caller answers 404
    }
  }

  async function answer(request, urlPath) {
    if (request.method !== "GET" && request.method !== "HEAD") return [405, { Allow: "GET, HEAD" }, "Method not allowed"];
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return [400, {}, "Bad request"];
    }
    const root = await rootPromise;
    let file = await locate(root, decoded);
    if (file === null) return [403, {}, "Forbidden"];
    try {
      if ((await stat(file)).isDirectory()) {
        if (!urlPath.endsWith("/")) return [301, { Location: `${urlPath.replace(/^\/+/, "/")}/` }, ""];
        file = path.join(file, "index.html");
        if ((await locate(root, path.relative(root, file))) === null) return [403, {}, "Forbidden"];
      }
      const headers = { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" };
      if (urlPath.endsWith("runtime/sandbox-worker.js")) headers["Content-Security-Policy"] = WORKER_CSP;
      return [200, headers, await readFile(file)];
    } catch {
      return [404, {}, "Not found"];
    }
  }

  return http.createServer(async (request, response) => {
    let urlPath = "/";
    let result;
    try {
      urlPath = new URL(request.url, "http://localhost").pathname;
      result = await answer(request, urlPath);
    } catch {
      result = urlPath === "/" && !request.url.startsWith("/") ? [400, {}, "Bad request"] : [500, {}, "Server error"];
    }
    const [status, headers, body] = result;
    const all = { ...headers, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body) };
    if (options.log) logLine(options.log, request, urlPath, status);
    response.writeHead(status, all);
    response.end(request.method === "HEAD" ? "" : body);
  });
}

function parseArgs(argv) {
  const options = { folder: null, host: "127.0.0.1", port: 8080, log: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host" || arg === "--port" || arg === "--log") {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value.`);
      options[arg.slice(2)] = arg === "--port" ? Number(argv[i + 1]) : argv[i + 1];
      i += 1;
    } else if (options.folder === null) {
      options.folder = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (options.folder === null) throw new Error("Give the folder to serve.");
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("--port needs a number from 0 to 65535.");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const server = createServer(options.folder, { log: options.log });
    server.on("error", (error) => {
      console.error(`dev-server: ${error.message}`);
      process.exit(2);
    });
    server.listen(options.port, options.host, () => {
      console.log(`Open http://${options.host}:${server.address().port}/`);
    });
  } catch (error) {
    console.error(`${error.message}\nUsage: node scripts/dev-server.mjs <folder> [--port N] [--host 127.0.0.1] [--log file.jsonl]`);
    process.exit(2);
  }
}
