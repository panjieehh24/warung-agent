// Unit tests for site/kit/warung-data.mjs, and the proof that personalize() output passes
// build_network.mjs --check without a rebuild.
// Run: node --test "tests/kit-*.test.mjs"   (quote the glob)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mergeRootHeaders, packageSite, personalize, slugify, validateWarung } from "../site/kit/warung-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT = path.join(ROOT, "site/kit/warung");
const BUILD = path.join(ROOT, "vendor/agentify-website/scripts/build_network.mjs");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const validShop = () => readJson(path.join(ROOT, "data/demo/bu-sri.json"));

async function readKit() {
  const files = new Map();
  for (const name of await readJson(path.join(KIT, "files.json"))) {
    files.set(name, await readFile(path.join(KIT, name), "utf8"));
  }
  return files;
}

test("both demo warungs are valid", async () => {
  for (const slug of ["bu-sri", "pak-budi"]) {
    assert.deepEqual(validateWarung(await readJson(path.join(ROOT, `data/demo/${slug}.json`))), []);
  }
});

// Each case changes one thing in a valid warung and expects exactly one problem.
const INVALID = [
  ["a non-object", () => null, /objek/],
  ["an empty name", (d) => ({ ...d, shop: { ...d.shop, name: "  " } }), /Nama warung/],
  ["a whatsapp not starting with 62", (d) => ({ ...d, shop: { ...d.shop, whatsapp: "081234567890" } }), /WhatsApp/],
  ["a whatsapp with a plus sign", (d) => ({ ...d, shop: { ...d.shop, whatsapp: "+6281234567890" } }), /WhatsApp/],
  ["a whatsapp that is too short", (d) => ({ ...d, shop: { ...d.shop, whatsapp: "621234567" } }), /WhatsApp/],
  ["a whatsapp that is too long", (d) => ({ ...d, shop: { ...d.shop, whatsapp: "62123456789012345" } }), /WhatsApp/],
  ["neither pickup nor delivery", (d) => ({ ...d, shop: { ...d.shop, pickup: false, delivery: false } }), /minimal satu/],
  ["a bad theme color", (d) => ({ ...d, theme: { primary: "red" } }), /theme\.primary/],
  ["an empty menu", (d) => ({ ...d, menu: [] }), /minimal satu item/],
  ["a zero price", (d) => ({ ...d, menu: [{ ...d.menu[0], price: 0 }] }), /harga/],
  ["a fractional price", (d) => ({ ...d, menu: [{ ...d.menu[0], price: 1500.5 }] }), /harga/],
  ["a price as text", (d) => ({ ...d, menu: [{ ...d.menu[0], price: "15000" }] }), /harga/],
  ["a menu item without a name", (d) => ({ ...d, menu: [{ ...d.menu[0], name: "" }] }), /nama/],
  ["an id that is not a slug", (d) => ({ ...d, menu: [{ ...d.menu[0], id: "Nasi Goreng" }] }), /slug/],
  ["a repeated id", (d) => ({ ...d, menu: [d.menu[0], d.menu[0]] }), /dipakai dua kali/],
];

for (const [name, change, pattern] of INVALID) {
  test(`validateWarung reports ${name}`, async () => {
    const problems = validateWarung(change(await validShop()));
    assert.equal(problems.length, 1, problems.join(" | "));
    assert.match(problems[0], pattern);
  });
}

test("validateWarung lists every problem, not only the first", async () => {
  const data = await validShop();
  const bad = { ...data, shop: { ...data.shop, name: "", whatsapp: "1" }, menu: [{ ...data.menu[0], price: -1 }] };
  assert.equal(validateWarung(bad).length, 3);
});

test("slugify makes lowercase hyphenated ascii slugs", () => {
  assert.equal(slugify("Warung Bu Sri"), "warung-bu-sri");
  assert.equal(slugify("  Es Teh -- Manis!! "), "es-teh-manis");
  assert.equal(slugify("Kafé Ñandú"), "kafe-nandu");
  assert.equal(slugify("Bakmi 99"), "bakmi-99");
  assert.equal(slugify("!!!"), "");
  assert.equal(slugify(undefined), "");
});

test("personalize returns a new Map and does not mutate its input", async () => {
  const kit = await readKit();
  const copy = new Map(kit);
  const data = await validShop();
  const dataCopy = structuredClone(data);
  const result = personalize(kit, { ...data, shop: { ...data.shop, name: "Soto Mbak Rini" }, theme: { primary: "#0f766e" } });
  assert.notEqual(result, kit);
  assert.deepEqual([...kit], [...copy]);
  assert.deepEqual(data, dataCopy);
  assert.deepEqual([...result.keys()], [...kit.keys()]);
  const manifest = JSON.parse(result.get("agent-manifest.json"));
  assert.equal(manifest.brand, "Soto Mbak Rini Assistant");
  assert.match(manifest.networks[0].description, /Soto Mbak Rini/);
  assert.equal(manifest.theme.primary, "#0f766e");
  assert.equal(JSON.parse(result.get("warung.json")).shop.name, "Soto Mbak Rini");
  // Everything else is carried over untouched.
  for (const [name, text] of kit) {
    if (name !== "warung.json" && name !== "agent-manifest.json") {
      assert.equal(result.get(name), text, `${name} changed`);
    }
  }
});

test("personalize refuses invalid data and a kit without a manifest", async () => {
  const kit = await readKit();
  const data = await validShop();
  assert.throws(() => personalize(kit, { ...data, menu: [] }), /tidak valid/);
  const noManifest = new Map(kit);
  noManifest.delete("agent-manifest.json");
  assert.throws(() => personalize(noManifest, data), /no agent-manifest/);
});

test("a personalized kit passes build_network.mjs --check without a rebuild", async () => {
  const kit = await readKit();
  const data = await readJson(path.join(ROOT, "data/demo/pak-budi.json"));
  const shop = { ...data, shop: { ...data.shop, name: "Kafé “Ñandú” & Anak" }, theme: { primary: "#1d4ed8" } };
  const out = await mkdtemp(path.join(os.tmpdir(), "warung-kit-"));
  try {
    for (const [name, text] of personalize(kit, shop)) {
      await mkdir(path.dirname(path.join(out, name)), { recursive: true });
      await writeFile(path.join(out, name), text);
    }
    const output = execFileSync(process.execPath, [BUILD, path.join(out, "warung.hocon"), "--manifest", path.join(out, "agent-manifest.json"), "--check"], { encoding: "utf8" });
    assert.match(output, /OK: these files are up to date/);
    assert.ok(!output.includes("WARNING"));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("the kit's copy of warung-data.mjs is the shared module", async () => {
  assert.equal(await readFile(path.join(KIT, "warung-data.mjs"), "utf8"), await readFile(path.join(ROOT, "site/kit/warung-data.mjs"), "utf8"));
});

test("packageSite puts the shop in <slug>/ with a root _headers and index.html", async () => {
  const kit = await readKit();
  const before = new Map(kit);
  const data = await validShop();
  const site = packageSite(kit, data);
  assert.deepEqual([...kit], [...before]);
  for (const name of kit.keys()) {
    assert.ok(site.has(`warung-bu-sri/${name}`), name);
  }
  assert.deepEqual([...site.keys()].filter((name) => !name.startsWith("warung-bu-sri/")).sort(), ["_headers", "index.html"]);
  const headers = site.get("_headers");
  assert.match(headers, /^\/warung-bu-sri\/agent-manifest\.json\n {2}Access-Control-Allow-Origin: \*$/m);
  assert.match(headers, /^\/warung-bu-sri\/runtime\/sandbox-worker\.js\n {2}Content-Security-Policy:/m);
  assert.ok(!/^\/(agent|warung\.|links|runtime)/m.test(headers));
  assert.match(site.get("index.html"), /http-equiv="refresh" content="0; url=\.\/warung-bu-sri\/"/);
  assert.match(site.get("index.html"), /<a href="\.\/warung-bu-sri\/">.*Warung Bu Sri/);
  assert.ok([...packageSite(kit, data, "bu-sri").keys()].includes("bu-sri/warung.json"));
  assert.match(mergeRootHeaders([["a", "/x\n  H: 1\n"], ["b", "/x\n  H: 1\n"]]), /^\/a\/x[^]*^\/b\/x/m);
});

test("a packaged site passes build_network.mjs --check in its <slug>/ folder", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "warung-pkg-"));
  try {
    for (const [name, text] of packageSite(await readKit(), await validShop())) {
      await mkdir(path.dirname(path.join(out, name)), { recursive: true });
      await writeFile(path.join(out, name), text);
    }
    const dir = path.join(out, "warung-bu-sri");
    const output = execFileSync(process.execPath, [BUILD, path.join(dir, "warung.hocon"), "--manifest", path.join(dir, "agent-manifest.json"), "--check"], { encoding: "utf8" });
    assert.match(output, /OK: these files are up to date/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("validateWarung enforces text lengths, tag limits and boolean types", async () => {
  const bad = async (change) => validateWarung(change(await validShop()));
  assert.equal((await bad((d) => { d.shop.tagline = "x".repeat(121); return d; })).length, 1);
  assert.equal((await bad((d) => { d.shop.area = "x".repeat(81); return d; })).length, 1);
  assert.equal((await bad((d) => { d.shop.hours = 5; return d; })).length, 1);
  assert.equal((await bad((d) => { d.shop.name = "x".repeat(81); return d; })).length, 1);
  assert.equal((await bad((d) => { d.menu[0].name = "x".repeat(81); return d; })).length, 1);
  assert.equal((await bad((d) => { d.menu[0].category = "x".repeat(41); return d; })).length, 1);
  assert.equal((await bad((d) => { d.menu[0].description = "x".repeat(201); return d; })).length, 1);
  assert.equal((await bad((d) => { d.menu[0].tags = Array(11).fill("a"); return d; })).length, 1);
  assert.equal((await bad((d) => { d.menu[0].tags = ["x".repeat(31)]; return d; })).length, 1);
  assert.equal((await bad((d) => { d.shop.pickup = "yes"; return d; })).length, 1);
  assert.equal((await bad((d) => { d.menu[0].available = 1; return d; })).length, 1);
  assert.deepEqual(await bad((d) => { d.shop.area = "x".repeat(80); d.menu[0].description = "x".repeat(200); return d; }), []);
});

test("the warung page, not the bridge, gets frame-ancestors none, scoped under /<slug>/", async () => {
  const kit = await readKit();
  const headers = packageSite(kit, await validShop()).get("_headers");
  assert.match(headers, /^\/warung-bu-sri\/\n {2}Content-Security-Policy: frame-ancestors 'none'$/m);
  assert.match(headers, /^\/warung-bu-sri\/index\.html\n {2}Content-Security-Policy: frame-ancestors 'none'$/m);
  assert.ok(!/bridge/.test(headers.replace(/^#.*$/gm, "")));
});
