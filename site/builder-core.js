// Pure helpers for the Builder: no DOM, no globals. builder.js wires them to the page.
// Validation, slugs and personalising the kit come from the shared kit module.
import { packageSite, slugify, validateWarung } from "./kit/warung-data.mjs";

export const KIT_BASE = "./kit/warung/";
export const DEFAULT_PRIMARY = "#9a3412";
const SLUG_FALLBACK = "item";
const ZIP_SUFFIX = "-warung-site.zip";

/**
 * Normalise a WhatsApp number: drop spaces, "+" and dashes, and turn a leading 0 into 62.
 * Anything else is left for validateWarung to flag.
 */
export function normalizeWhatsapp(text) {
  const digits = String(text ?? "").replace(/[\s+\-]/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

/** Split comma-separated tags, trimmed, with empties and repeats dropped. */
export function parseTags(text) {
  const tags = String(text ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  return [...new Set(tags)];
}

/** Slug ids for names, unique in order: "a", "a-2", "a-3". Returns a new array. */
export function makeIds(names) {
  const used = new Set();
  return names.map((name) => {
    const base = slugify(name) || SLUG_FALLBACK;
    let id = base;
    for (let n = 2; used.has(id); n += 1) {
      id = `${base}-${n}`;
    }
    used.add(id);
    return id;
  });
}

/** Whole rupiah as the dialog and page show it: 15000 -> "Rp15.000". */
export function formatRupiah(price) {
  return `Rp${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Read a price field. Empty is null, anything else goes through Number so that
 * the validator flags fractions and text. Reading prices out of free text ("15rb")
 * is the model's job (menu_reader), not code's.
 */
function readPrice(raw) {
  const text = String(raw ?? "").trim();
  return text === "" ? null : Number(text);
}

/**
 * Build the warung.json object from the form state.
 *
 * :param shop: {name, tagline, area, hours, whatsapp, pickup, delivery}
 * :param primary: theme colour.
 * :param rows: [{name, category, price, description, tags, available}] as typed.
 */
export function buildData(shop, primary, rows) {
  const ids = makeIds(rows.map((row) => row.name));
  return {
    version: 1,
    shop: {
      name: shop.name.trim(),
      tagline: shop.tagline.trim(),
      area: shop.area.trim(),
      hours: shop.hours.trim(),
      whatsapp: normalizeWhatsapp(shop.whatsapp),
      pickup: Boolean(shop.pickup),
      delivery: Boolean(shop.delivery),
    },
    theme: { primary },
    menu: rows.map((row, index) => ({
      id: ids[index],
      name: row.name.trim(),
      category: row.category.trim(),
      price: readPrice(row.price),
      description: row.description.trim(),
      tags: parseTags(row.tags),
      available: Boolean(row.available),
    })),
  };
}

// validateWarung returns Indonesian sentences (kit/warung-data.mjs); these match its wording.
const FIELD_PATTERNS = [
  ["whatsapp", /whatsapp/],
  ["primary", /theme|warna/],
  ["fulfilment", /pickup|delivery|ambil sendiri|diantar/],
  ["tagline", /tagline/],
  ["area", /daerah/],
  ["hours", /jam buka/],
  ["menu", /^menu|harga|\bid\b/],
  ["name", /nama warung|shop\.name/],
];

/** Which field a validateWarung message belongs to; "general" when none matches. */
export function fieldForProblem(problem) {
  const text = problem.toLowerCase();
  const hit = FIELD_PATTERNS.find(([, pattern]) => pattern.test(text));
  return hit ? hit[0] : "general";
}

/** Group problems by field: {whatsapp: ["..."], menu: [...]}. */
export function groupProblems(problems) {
  return problems.reduce((groups, problem) => {
    const field = fieldForProblem(problem);
    return { ...groups, [field]: [...(groups[field] ?? []), problem] };
  }, {});
}

/** Problems for a data object (empty array when valid). */
export function problemsFor(data) {
  return validateWarung(data);
}

/** Zip file name for a shop name. */
export function zipName(shopName) {
  return `${slugify(shopName) || "warung"}${ZIP_SUFFIX}`;
}

async function fetchText(fetchFn, url) {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
  }
  return response.text();
}

/** Fetch the kit: files.json, then every listed file as text. Returns Map<path, text>. */
export async function loadKit(fetchFn, kitBase = KIT_BASE) {
  const list = JSON.parse(await fetchText(fetchFn, `${kitBase}files.json`));
  if (!Array.isArray(list) || list.some((path) => typeof path !== "string")) {
    throw new Error("kit/warung/files.json must be an array of paths.");
  }
  if (list.some((path) => path.startsWith("/") || path.includes("\\") || path.split("/").includes(".."))) {
    throw new Error("kit/warung/files.json has an unsafe path.");
  }
  const texts = await Promise.all(list.map((path) => fetchText(fetchFn, `${kitBase}${path}`)));
  return new Map(list.map((path, index) => [path, texts[index]]));
}

/**
 * Personalise the kit, put it in a <slug>/ folder and zip it.
 *
 * :param data: A valid warung.json object.
 * :param deps: {fetch, JSZip, kitBase?, outputType?} ("blob" in browsers).
 * :return: {name, content}
 */
export async function buildZip(data, deps) {
  const files = packageSite(await loadKit(deps.fetch, deps.kitBase), data);
  const zip = new deps.JSZip();
  for (const [path, text] of files) {
    zip.file(path, text);
  }
  const content = await zip.generateAsync({ type: deps.outputType ?? "blob" });
  return { name: zipName(data.shop.name), content };
}
