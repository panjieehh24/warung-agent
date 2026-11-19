// Checks the Builder's form logic, validation display and zip flow, against the real
// kit module (site/kit/warung-data.mjs), a fake kit served by a mock fetch, and the
// vendored JSZip.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { BuilderPage, core } from "./harness.mjs";

// JSZip is a UMD file; evaluate it the way a classic <script> would.
const jszipSource = await readFile(new URL("../lib/jszip.min.js", import.meta.url), "utf8");
const jszipModule = { exports: {} };
new Function("module", "exports", jszipSource)(jszipModule, jszipModule.exports);
const JSZip = jszipModule.exports;

const FAKE_KIT = {
  "index.html": "<h1>warung</h1>",
  "agent-manifest.json": JSON.stringify({ brand: "x", networks: [{ name: "warung", description: "d" }], theme: { primary: "#000000" } }),
  "runtime/index.js": "export const ok = 1;\n",
  "_headers": "/agent-manifest.json\n  Access-Control-Allow-Origin: *\n",
  "warung.json": "{}",
};

function fakeFetch(kit, { missing = [] } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const path = url.replace("./kit/warung/", "");
    if (path === "files.json") {
      return { ok: true, text: async () => JSON.stringify(Object.keys(kit)) };
    }
    if (missing.includes(path) || !(path in kit)) {
      return { ok: false, status: 404, text: async () => "" };
    }
    return { ok: true, text: async () => kit[path] };
  };
  fn.calls = calls;
  return fn;
}

function freshPage(deps) {
  const page = new BuilderPage(document, deps);
  return page;
}

function fillValid(page) {
  page.fillShopDetails({ name: "Warung Bu Sri", tagline: "Masakan rumahan", area: "Kemang", hours: "07.00-15.00", whatsapp: "0812-3456-7890", pickup: true, delivery: false });
  page.fillMenu({ items: [{ name: "Nasi Goreng", category: "Makanan", price: 15000 }] });
}

test("WhatsApp numbers: spaces, plus and dashes go, a leading 0 becomes 62", () => {
  assert.equal(core.normalizeWhatsapp("0812-3456 7890"), "6281234567890");
  assert.equal(core.normalizeWhatsapp("+62 812-3456-7890"), "6281234567890");
  assert.equal(core.normalizeWhatsapp("6281234567890"), "6281234567890");
  assert.equal(core.normalizeWhatsapp(""), "");
  assert.equal(core.normalizeWhatsapp("abc"), "abc");
});

test("ids are slugs, deduplicated with -2 and -3, and never collide", () => {
  assert.deepEqual(core.makeIds(["Es Teh", "es teh", "Es-Teh!", "Es Teh 2"]), ["es-teh", "es-teh-2", "es-teh-3", "es-teh-2-2"]);
  assert.deepEqual(core.makeIds(["Es Teh", "Es Teh 2", "Es Teh"]), ["es-teh", "es-teh-2", "es-teh-3"]);
  assert.deepEqual(core.makeIds(["!!!", "???"]), ["item", "item-2"]);
});

test("tags split on commas, trimmed, no empties or repeats; rupiah are formatted", () => {
  assert.deepEqual(core.parseTags(" pedas, halal ,, pedas"), ["pedas", "halal"]);
  assert.equal(core.formatRupiah(15000), "Rp15.000");
  assert.equal(core.formatRupiah(4000), "Rp4.000");
  assert.equal(core.formatRupiah(1250000), "Rp1.250.000");
  assert.equal(core.formatRupiah(500), "Rp500");
});

test("buildData makes the exact warung.json shape, and does not mutate its input", () => {
  const shop = { name: " Warung Bu Sri ", tagline: "t", area: "a", hours: "h", whatsapp: "0812 3456 7890", pickup: true, delivery: true };
  const rows = [{ name: "Nasi", category: "Makanan", price: "15000", description: "", tags: "pedas, halal", available: true }];
  const copy = structuredClone({ shop, rows });
  const data = core.buildData(shop, "#9a3412", rows);
  assert.deepEqual(data, {
    version: 1,
    shop: { name: "Warung Bu Sri", tagline: "t", area: "a", hours: "h", whatsapp: "6281234567890", pickup: true, delivery: true },
    theme: { primary: "#9a3412" },
    menu: [{ id: "nasi", name: "Nasi", category: "Makanan", price: 15000, description: "", tags: ["pedas", "halal"], available: true }],
  });
  assert.deepEqual({ shop, rows }, copy);
  assert.deepEqual(core.problemsFor(data), []);
});

test("code does not parse prices: text and fractions reach the validator as invalid", () => {
  const data = core.buildData({ name: "x", tagline: "", area: "", hours: "", whatsapp: "0812345678", pickup: true, delivery: false }, "#9a3412",
    [{ name: "a", category: "", price: "15rb", description: "", tags: "", available: true }, { name: "b", category: "", price: "15.5", description: "", tags: "", available: true }, { name: "c", category: "", price: "", description: "", tags: "", available: true }]);
  assert.ok(Number.isNaN(data.menu[0].price));
  assert.equal(data.menu[1].price, 15.5);
  assert.equal(data.menu[2].price, null);
  assert.equal(core.problemsFor(data).filter((problem) => /harga/.test(problem)).length, 3);
});

test("problems are grouped next to their fields", () => {
  const groups = core.groupProblems(core.problemsFor(core.buildData({ name: "", tagline: "", area: "", hours: "", whatsapp: "123", pickup: false, delivery: false }, "red", [])));
  assert.ok(groups.name && groups.whatsapp && groups.fulfilment && groups.primary && groups.menu);
  assert.equal(core.fieldForProblem("Something odd"), "general");
});

test("typing in the form shows each problem next to its field and clears it when fixed", () => {
  const page = freshPage({});
  assert.equal(document.getElementById("err-whatsapp").hidden, true, "no complaints before the owner types");
  const phone = document.getElementById("f-whatsapp");
  phone.value = "123";
  phone.dispatch("input");
  assert.equal(document.getElementById("err-whatsapp").hidden, false);
  assert.match(document.getElementById("err-whatsapp").textContent, /WhatsApp/);
  assert.equal(phone.getAttribute("aria-invalid"), "true");
  phone.value = "0812 3456 7890";
  phone.dispatch("input");
  assert.equal(document.getElementById("err-whatsapp").hidden, true);
  assert.equal(phone.getAttribute("aria-invalid"), "false");
  assert.equal(page.getState().shop.whatsapp, "6281234567890");
});

test("menu rows can be added, edited and removed", () => {
  const page = freshPage({});
  const body = document.getElementById("menu-body");
  assert.equal(body.children.length, 1);
  document.getElementById("add-item").dispatch("click");
  assert.equal(body.children.length, 2);
  const [name, , price] = body.children[1].children.map((td) => td.children[0]);
  name.value = "Es Teh";
  name.dispatch("input");
  price.value = "4000";
  price.dispatch("input");
  assert.deepEqual([page.getState().menu[1].name, page.getState().menu[1].price, page.getState().menu[1].id], ["Es Teh", 4000, "es-teh"]);
  const remove = body.children[0].children.at(-1).children[0];
  remove.dispatch("click");
  assert.equal(body.children.length, 1);
  assert.equal(page.getState().menu[0].name, "Es Teh");
});

test("download builds personalised files from the kit and zips them as <slug>-warung-site.zip", async () => {
  const fetch = fakeFetch(FAKE_KIT);
  const saved = [];
  const page = freshPage({ fetch, JSZip, outputType: "uint8array", save: (zip) => saved.push(zip) });
  fillValid(page);
  const result = await page.download();
  assert.deepEqual(result, { ok: true, name: "warung-bu-sri-warung-site.zip" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "warung-bu-sri-warung-site.zip");
  assert.deepEqual(fetch.calls.slice(0, 1), ["./kit/warung/files.json"]);
  assert.equal(fetch.calls.length, 1 + Object.keys(FAKE_KIT).length);
  const zip = await JSZip.loadAsync(saved[0].content);
  assert.deepEqual(Object.keys(zip.files).filter((path) => !path.endsWith("/")).sort(), [...Object.keys(FAKE_KIT).map((path) => `warung-bu-sri/${path}`), "_headers", "index.html"].sort());
  const warung = JSON.parse(await zip.file("warung-bu-sri/warung.json").async("string"));
  assert.equal(warung.shop.whatsapp, "6281234567890");
  assert.equal(warung.menu[0].id, "nasi-goreng");
  const manifest = JSON.parse(await zip.file("warung-bu-sri/agent-manifest.json").async("string"));
  assert.equal(manifest.brand, "Warung Bu Sri Assistant");
  assert.equal(await zip.file("warung-bu-sri/_headers").async("string"), FAKE_KIT._headers);
  assert.match(await zip.file("_headers").async("string"), /^\/warung-bu-sri\/agent-manifest\.json$/m);
  assert.match(await zip.file("index.html").async("string"), /url=\.\/warung-bu-sri\//);
  assert.equal(document.getElementById("online-panel").hidden, false);
  assert.match(document.getElementById("download-status").textContent, /Downloaded/);
  assert.equal(document.getElementById("download").disabled, false);
});

test("download with problems fetches nothing and tells the owner", async () => {
  const fetch = fakeFetch(FAKE_KIT);
  const saved = [];
  const page = freshPage({ fetch, JSZip, save: (zip) => saved.push(zip) });
  assert.deepEqual(await page.download(), { ok: false });
  assert.equal(fetch.calls.length, 0);
  assert.equal(saved.length, 0);
  assert.equal(document.getElementById("err-name").hidden, false);
  assert.equal(document.getElementById("download-status").className, "status error");
});

test("a kit file that fails to load shows an error, saves nothing and re-enables the button", async () => {
  const fetch = fakeFetch(FAKE_KIT, { missing: ["runtime/index.js"] });
  const saved = [];
  const page = freshPage({ fetch, JSZip, save: (zip) => saved.push(zip) });
  fillValid(page);
  const result = await page.download();
  assert.equal(result.ok, false);
  assert.match(document.getElementById("download-status").textContent, /runtime\/index\.js \(HTTP 404\)/);
  assert.equal(saved.length, 0);
  assert.equal(document.getElementById("download").disabled, false);
});

test("a malformed files.json is an explicit error", async () => {
  const fetch = async () => ({ ok: true, text: async () => '{"not":"an array"}' });
  await assert.rejects(core.loadKit(fetch), /array of paths/);
});

test("the real kit zips too, when its files.json exists", { skip: !existsSync(new URL("../kit/warung/files.json", import.meta.url)) }, async () => {
  const root = new URL("../kit/warung/", import.meta.url);
  const fetch = async (url) => {
    const path = url.replace("./kit/warung/", "");
    try {
      return { ok: true, text: async () => readFile(new URL(path, root), "utf8") };
    } catch {
      return { ok: false, status: 404, text: async () => "" };
    }
  };
  const page = freshPage({ fetch, JSZip, save: () => {} });
  fillValid(page);
  const data = page.data();
  const { name, content } = await core.buildZip(data, { fetch, JSZip, outputType: "uint8array" });
  assert.equal(name, "warung-bu-sri-warung-site.zip");
  const zip = await JSZip.loadAsync(content);
  assert.ok(zip.file("warung-bu-sri/warung.json") && zip.file("warung-bu-sri/agent-manifest.json") && zip.file("_headers") && zip.file("index.html"));
  assert.ok((await readdir(root)).length > 0);
});

test("loadKit rejects absolute, parent and backslash paths in files.json", async () => {
  for (const bad of ["/etc/passwd", "../x", "a/../../x", "a\\b"]) {
    const fetch = async () => ({ ok: true, text: async () => JSON.stringify([bad]) });
    await assert.rejects(core.loadKit(fetch), /unsafe path/, bad);
  }
});

test("length problems map to their own Builder field", () => {
  assert.equal(core.fieldForProblem("Tagline harus teks, maksimal 120 karakter."), "tagline");
  assert.equal(core.fieldForProblem("Daerah (area) harus teks, maksimal 80 karakter."), "area");
  assert.equal(core.fieldForProblem("Jam buka harus teks, maksimal 80 karakter."), "hours");
  assert.equal(core.fieldForProblem("Nama warung maksimal 80 karakter."), "name");
  assert.equal(core.fieldForProblem("Menu #1: deskripsi harus teks, maksimal 200 karakter."), "menu");
});
