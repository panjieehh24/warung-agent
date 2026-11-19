// Pure helpers shared by the Builder, the demo scripts and each warung's page.
// No DOM and no Node-only imports: this file runs in Node and in the browser.
// scripts/build-kit.mjs copies it into warung/ so a downloaded kit carries its own copy.

const WHATSAPP_PATTERN = /^62\d{8,13}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Turn free text into a lowercase slug of letters, digits and single hyphens.
 */
export function slugify(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const TEXT_LIMITS = { name: 80, tagline: 120, area: 80, hours: 80 };
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

function tooLong(value, max) {
  return value !== undefined && (typeof value !== "string" || value.length > max);
}

function validateShop(shop) {
  if (!isPlainObject(shop)) {
    return ["shop harus berupa objek."];
  }
  const problems = [];
  if (typeof shop.name !== "string" || shop.name.trim() === "") {
    problems.push("Nama warung tidak boleh kosong.");
  }
  if (typeof shop.whatsapp !== "string" || !WHATSAPP_PATTERN.test(shop.whatsapp)) {
    problems.push("Nomor WhatsApp harus berupa angka saja, diawali 62, lalu 8 sampai 13 angka (contoh 6281234567890).");
  }
  if (tooLong(shop.name, TEXT_LIMITS.name)) {
    problems.push(`Nama warung maksimal ${TEXT_LIMITS.name} karakter.`);
  }
  if (tooLong(shop.tagline, TEXT_LIMITS.tagline)) {
    problems.push(`Tagline harus teks, maksimal ${TEXT_LIMITS.tagline} karakter.`);
  }
  if (tooLong(shop.area, TEXT_LIMITS.area)) {
    problems.push(`Daerah (area) harus teks, maksimal ${TEXT_LIMITS.area} karakter.`);
  }
  if (tooLong(shop.hours, TEXT_LIMITS.hours)) {
    problems.push(`Jam buka harus teks, maksimal ${TEXT_LIMITS.hours} karakter.`);
  }
  for (const key of ["pickup", "delivery"]) {
    if (typeof shop[key] !== "boolean") {
      problems.push(`shop.${key} harus true atau false.`);
    }
  }
  if (shop.pickup === false && shop.delivery === false) {
    problems.push("Pilih minimal satu: ambil sendiri atau diantar.");
  }
  return problems;
}

function validateItem(item, index, seenIds) {
  const label = `Menu #${index + 1}`;
  if (!isPlainObject(item)) {
    return [`${label} harus berupa objek.`];
  }
  const problems = [];
  if (typeof item.id !== "string" || !SLUG_PATTERN.test(item.id)) {
    problems.push(`${label}: id harus slug huruf kecil, angka, dan tanda hubung.`);
  } else if (seenIds.has(item.id)) {
    problems.push(`${label}: id "${item.id}" dipakai dua kali.`);
  } else {
    seenIds.add(item.id);
  }
  if (typeof item.name !== "string" || item.name.trim() === "") {
    problems.push(`${label}: nama tidak boleh kosong.`);
  }
  if (!Number.isInteger(item.price) || item.price <= 0) {
    problems.push(`${label}: harga harus bilangan bulat rupiah lebih dari 0.`);
  }
  if (typeof item.available !== "boolean") {
    problems.push(`${label}: available harus true atau false.`);
  }
  if (tooLong(item.name, 80) && typeof item.name === "string") {
    problems.push(`${label}: nama maksimal 80 karakter.`);
  }
  if (tooLong(item.category, 40)) {
    problems.push(`${label}: kategori harus teks, maksimal 40 karakter.`);
  }
  if (tooLong(item.description, 200)) {
    problems.push(`${label}: deskripsi harus teks, maksimal 200 karakter.`);
  }
  const tags = item.tags;
  if (tags !== undefined && !(Array.isArray(tags) && tags.length <= MAX_TAGS && tags.every((tag) => typeof tag === "string" && tag.length <= MAX_TAG_LENGTH))) {
    problems.push(`${label}: tags harus daftar teks, maksimal ${MAX_TAGS} tag, masing-masing ${MAX_TAG_LENGTH} karakter.`);
  }
  return problems;
}

/**
 * Check a warung.json value against the design's schema.
 *
 * :return: Human-readable problems (Indonesian), empty when the data is valid.
 */
export function validateWarung(data) {
  if (!isPlainObject(data)) {
    return ["warung.json harus berupa objek."];
  }
  const problems = validateShop(data.shop);
  const primary = data.theme?.primary;
  if (typeof primary !== "string" || !COLOR_PATTERN.test(primary)) {
    problems.push("theme.primary harus warna heksadesimal seperti #9a3412.");
  }
  if (!Array.isArray(data.menu) || data.menu.length === 0) {
    problems.push("Menu harus punya minimal satu item.");
    return problems;
  }
  const seenIds = new Set();
  data.menu.forEach((item, index) => problems.push(...validateItem(item, index, seenIds)));
  return problems;
}

/**
 * The manifest description a visitor reads at the top of the chat.
 */
export function describeShop(data) {
  return `Tanya menu, harga, dan jam buka ${data.shop.name}, lalu pesan lewat WhatsApp. Ask about the menu or place an order.`;
}

function personalizeManifest(manifestText, data) {
  const manifest = JSON.parse(manifestText);
  const [network, ...otherNetworks] = manifest.networks;
  const next = {
    ...manifest,
    brand: `${data.shop.name} Assistant`,
    networks: [{ ...network, description: describeShop(data) }, ...otherNetworks],
    theme: { ...manifest.theme, primary: data.theme.primary },
  };
  return `${JSON.stringify(next, null, 2)}\n`;
}

/**
 * Make one shop's files from the kit's files.
 *
 * Only warung.json and agent-manifest.json change. The other files the build derives
 * from the manifest (agent-mcp.json, .well-known/*, bridge/agent-manifest.json) copy
 * only the linking and agent_mcp parts, which stay the same, so they stay valid without
 * a rebuild. networks[0].sample_queries is not touched: build_network.mjs requires it to
 * equal metadata.sample_queries in warung.hocon, which holds no shop name.
 *
 * :param files: Map of kit-relative path to text. Not mutated.
 * :param data: A valid warung.json value.
 * :return: A new Map with the same keys.
 * :raises Error: When data is invalid or the kit has no manifest.
 */
export function personalize(files, data) {
  const problems = validateWarung(data);
  if (problems.length > 0) {
    throw new Error(`warung.json tidak valid: ${problems.join(" ")}`);
  }
  if (!files.has("agent-manifest.json")) {
    throw new Error("The kit has no agent-manifest.json.");
  }
  const result = new Map(files);
  result.set("warung.json", `${JSON.stringify(data, null, 2)}\n`);
  result.set("agent-manifest.json", personalizeManifest(files.get("agent-manifest.json"), data));
  return result;
}

/**
 * The kit's _headers rules moved under /<slug>/ (Cloudflare Pages reads only the root file).
 */
export function scopeHeaders(kitHeaders, slug) {
  return kitHeaders
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .map((line) => (line.startsWith("/") ? `/${slug}${line}` : line))
    .join("\n");
}

/**
 * One root _headers for several shops hosted side by side.
 *
 * :param entries: Array of [slug, kitHeadersText].
 */
export function mergeRootHeaders(entries) {
  return `${entries.map(([slug, text]) => scopeHeaders(text, slug).trim()).join("\n")}\n`;
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Personalise the kit and put it in a <slug>/ folder, so the network URL path is
 * <slug>/warung and two shops never share a tool name.
 *
 * :param slug: Optional folder name, default slugify(data.shop.name).
 * :return: A new Map: <slug>/<kit paths>, plus a root _headers and a root index.html.
 */
export function packageSite(files, data, slug) {
  const personalized = personalize(files, data);
  const folder = slug ?? slugify(data.shop.name);
  if (!SLUG_PATTERN.test(folder)) {
    throw new Error("Nama warung harus punya huruf atau angka.");
  }
  const result = new Map();
  for (const [name, text] of personalized) {
    result.set(`${folder}/${name}`, text);
  }
  result.set("_headers", mergeRootHeaders([[folder, files.get("_headers") ?? ""]]));
  const name = escapeHtml(data.shop.name);
  result.set(
    "index.html",
    `<!doctype html>\n<html lang="id"><head><meta charset="utf-8"><title>${name}</title>\n<meta http-equiv="refresh" content="0; url=./${folder}/"></head>\n<body><h1>${name}</h1><p><a href="./${folder}/">Buka / Open ${name}</a></p></body></html>\n`,
  );
  return result;
}
