// Tests for scripts/dev-server.mjs: CORS, worker CSP, the folder boundary and the request log.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../scripts/dev-server.mjs";

async function withServer(run) {
  const base = await mkdtemp(path.join(os.tmpdir(), "dev-server-"));
  const folder = path.join(base, "site");
  await mkdir(path.join(folder, "bu-sri/runtime"), { recursive: true });
  await writeFile(path.join(folder, "bu-sri/agent-manifest.json"), "{}");
  await writeFile(path.join(folder, "bu-sri/runtime/sandbox-worker.js"), "//");
  await writeFile(path.join(folder, "bu-sri/index.html"), "<p>hi</p>");
  await writeFile(path.join(base, "secret.txt"), "secret");
  await mkdir(path.join(folder, "sub"));
  await symlink(path.join(base, "secret.txt"), path.join(folder, "sub/index.html"));
  const log = path.join(base, "log.jsonl");
  const server = createServer(folder, { log });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  // http.get keeps "/../x" and "%2e%2e" as written, unlike fetch.
  const get = (urlPath, headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: urlPath, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
  try {
    await run({ get, log });
  } finally {
    server.close();
    await rm(base, { recursive: true, force: true });
  }
}

test("sends CORS and no-store on a json file in a subfolder", () => withServer(async ({ get }) => {
  const res = await get("/bu-sri/agent-manifest.json");
  assert.equal(res.status, 200);
  assert.equal(res.headers["access-control-allow-origin"], "*");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal((await get("/bu-sri/")).body, "<p>hi</p>");
  const missing = await get("/nope");
  assert.equal(missing.status, 404);
  assert.equal(missing.headers["access-control-allow-origin"], "*");
}));

test("sends the worker CSP on runtime/sandbox-worker.js only", () => withServer(async ({ get }) => {
  assert.match((await get("/bu-sri/runtime/sandbox-worker.js")).headers["content-security-policy"], /^default-src 'none'; script-src blob:/);
  assert.equal((await get("/bu-sri/agent-manifest.json")).headers["content-security-policy"], undefined);
}));

test("refuses paths outside the folder", () => withServer(async ({ get }) => {
  for (const urlPath of ["/../secret.txt", "/%2e%2e/secret.txt", "/bu-sri/../../secret.txt", "/%2e%2e%2fsecret.txt"]) {
    const res = await get(urlPath);
    assert.ok([403, 404].includes(res.status), `${urlPath} -> ${res.status}`);
    assert.ok(!res.body.includes("secret"), urlPath);
  }
}));

test("logs authorization as a flag, never its value", () => withServer(async ({ get, log }) => {
  await get("/bu-sri/agent-manifest.json", { Authorization: "Bearer sk-test-123", Cookie: "sid=abc; theme=x", Origin: "http://localhost:8080" });
  const text = await readFile(log, "utf8");
  const line = JSON.parse(text.trim());
  assert.equal(line.authorization, true);
  assert.deepEqual(line.cookies, ["sid", "theme"]);
  assert.equal(line.origin, "http://localhost:8080");
  assert.ok(!text.includes("sk-test-123") && !text.includes("abc"));
}));

test("refuses a directory index.html that is a symlink out of the root", () => withServer(async ({ get }) => {
  assert.equal((await get("/sub/")).status, 403);
  assert.equal((await get("/bu-sri/")).status, 200);
}));

test("a directory redirect never starts with two slashes", () => withServer(async ({ get }) => {
  const res = await get("/.//bu-sri");
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, "/bu-sri/");
}));
