import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { LOCAL, parseOrigin, rewriteTree, swapOrigins } from "../scripts/set-origins.mjs";

const LIVE = { main: "https://owner.github.io", warungs: "https://warung-agent-demo.pages.dev" };

test("swapOrigins replaces both origins and keeps paths", () => {
  const text = `["${LOCAL.main}"] ${LOCAL.warungs}/bu-sri/warung`;
  assert.equal(swapOrigins(text, LOCAL, LIVE), `["${LIVE.main}"] ${LIVE.warungs}/bu-sri/warung`);
});

test("parseOrigin rejects paths and plain http, accepts local origins", () => {
  assert.throws(() => parseOrigin("https://owner.github.io/warung-agent"));
  assert.throws(() => parseOrigin("http://example.com"));
  assert.equal(parseOrigin("https://owner.github.io/"), "https://owner.github.io");
  assert.equal(parseOrigin(LOCAL.warungs), LOCAL.warungs);
});

test("rewriteTree edits site files but never runtime/", () => {
  const root = mkdtempSync(path.join(tmpdir(), "origins-"));
  mkdirSync(path.join(root, "site/pasar/runtime"), { recursive: true });
  const hocon = path.join(root, "site/pasar/pasar.hocon");
  const runtimeFile = path.join(root, "site/pasar/runtime/engine.js");
  writeFileSync(hocon, `"${LOCAL.warungs}/bu-sri/warung"`);
  writeFileSync(runtimeFile, `// ${LOCAL.main}`);

  const changed = rewriteTree(root, LOCAL, LIVE);

  assert.deepEqual(changed, [hocon]);
  assert.equal(readFileSync(hocon, "utf8"), `"${LIVE.warungs}/bu-sri/warung"`);
  assert.equal(readFileSync(runtimeFile, "utf8"), `// ${LOCAL.main}`);
});
