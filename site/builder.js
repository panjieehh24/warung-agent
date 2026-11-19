// The Builder page: a form that produces warung.json and a zip of the warung site.
// The page's own buttons and the assistant's actions (site-actions.js) call the same
// methods on Builder.page, so both follow one set of rules.
import {
  DEFAULT_PRIMARY, buildData, buildZip, formatRupiah, groupProblems, makeIds,
  normalizeWhatsapp, parseTags, problemsFor,
} from "./builder-core.js";

const TEXT_FIELDS = ["name", "tagline", "area", "hours", "whatsapp"];
const SHOP_FIELDS = [...TEXT_FIELDS, "pickup", "delivery"];
const ERROR_FIELDS = [...TEXT_FIELDS, "fulfilment", "primary", "menu", "general"];
const MENU_COLUMNS = [
  ["name", "Name", "text"],
  ["category", "Category", "text"],
  ["price", "Price (Rp)", "number"],
  ["description", "Description", "text"],
  ["tags", "Tags (comma separated)", "text"],
];
const MAX_ITEMS = 200;

function blankRow() {
  return { name: "", category: "", price: "", description: "", tags: "", available: true };
}

function rowFromItem(item) {
  return {
    name: item.name,
    category: item.category ?? "",
    price: String(item.price),
    description: item.description ?? "",
    tags: (item.tags ?? []).join(", "),
    available: item.available !== false,
  };
}

/** Form state, rendering, validation and download for the Builder. */
export class BuilderPage {
  constructor(doc, deps = {}) {
    this.doc = doc;
    this.deps = deps;
    this.shop = { name: "", tagline: "", area: "", hours: "", whatsapp: "", pickup: true, delivery: false };
    this.primary = DEFAULT_PRIMARY;
    this.rows = [blankRow()];
    this.showProblems = false;
    this.byId = (id) => doc.getElementById(id);
    this.bind();
    this.renderRows();
    this.refresh();
  }

  bind() {
    for (const field of TEXT_FIELDS) {
      this.byId(`f-${field}`).addEventListener("input", () => this.onShopInput(field, this.byId(`f-${field}`).value));
    }
    for (const field of ["pickup", "delivery"]) {
      this.byId(`f-${field}`).addEventListener("change", () => this.onShopInput(field, this.byId(`f-${field}`).checked));
    }
    this.byId("f-primary").addEventListener("input", () => {
      this.primary = this.byId("f-primary").value;
      this.touch();
    });
    this.byId("add-item").addEventListener("click", () => this.addRow());
    this.byId("download").addEventListener("click", () => this.download());
  }

  onShopInput(field, value) {
    this.shop = { ...this.shop, [field]: value };
    this.touch();
  }

  touch() {
    this.showProblems = true;
    this.refresh();
  }

  // ---- state readers (no side effects) ----

  data() {
    return buildData(this.shop, this.primary, this.rows);
  }

  problems() {
    return problemsFor(this.data());
  }

  /** Plain-JSON copy of the form: warung.json shape plus the current problems. */
  getState() {
    const data = this.data();
    return { ...data, problems: problemsFor(data) };
  }

  // ---- operations (page buttons and agent actions both use these) ----

  /** Read-only check for fill_shop_details. Returns {ok, shop} or {ok:false, reason, field}. */
  checkShop(args) {
    const given = SHOP_FIELDS.filter((field) => args && args[field] !== undefined);
    if (given.length === 0) {
      return { ok: false, reason: "Give at least one shop field to fill.", field: "shop" };
    }
    const shop = {};
    for (const field of given) {
      const value = args[field];
      const isFlag = field === "pickup" || field === "delivery";
      if (isFlag ? typeof value !== "boolean" : typeof value !== "string") {
        return { ok: false, reason: `${field} must be ${isFlag ? "true or false" : "text"}.`, field };
      }
      shop[field] = field === "whatsapp" ? normalizeWhatsapp(value) : value;
    }
    if (shop.whatsapp !== undefined && !/^\d+$/.test(shop.whatsapp)) {
      return { ok: false, reason: "whatsapp must be digits only, such as 081234567890 or +62 812-3456-7890.", field: "whatsapp" };
    }
    if (shop.name !== undefined && shop.name.trim() === "") {
      return { ok: false, reason: "The shop name cannot be empty.", field: "name" };
    }
    return { ok: true, shop };
  }

  /** Read-only check for fill_menu. Returns {ok, items} (ids added) or {ok:false, reason, field}. */
  checkMenu(args) {
    const items = args && args.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
      return { ok: false, reason: `Give between 1 and ${MAX_ITEMS} menu items.`, field: "items" };
    }
    for (const [index, item] of items.entries()) {
      const label = `Item ${index + 1}`;
      if (typeof item?.name !== "string" || item.name.trim() === "") {
        return { ok: false, reason: `${label} has no name.`, field: "name" };
      }
      if (!Number.isInteger(item.price) || item.price < 1) {
        return { ok: false, reason: `${label} (${item.name}) needs a price in whole rupiah above 0, such as 15000. Ask the owner if it is unclear.`, field: "price" };
      }
    }
    const ids = makeIds(items.map((item) => item.name));
    return { ok: true, items: items.map((item, index) => ({ ...item, id: ids[index] })) };
  }

  fillShopDetails(args) {
    const check = this.checkShop(args);
    if (!check.ok) {
      return check;
    }
    this.shop = { ...this.shop, ...check.shop };
    this.syncShopFields();
    this.touch();
    return { ok: true, ...this.getState() };
  }

  fillMenu(args) {
    const check = this.checkMenu(args);
    if (!check.ok) {
      return check;
    }
    this.rows = check.items.map(rowFromItem);
    this.renderRows();
    this.touch();
    return { ok: true, ...this.getState() };
  }

  addRow() {
    this.rows = [...this.rows, blankRow()];
    this.renderRows();
    this.refresh();
  }

  removeRow(index) {
    this.rows = this.rows.filter((_, i) => i !== index);
    this.renderRows();
    this.touch();
  }

  setRow(index, key, value) {
    this.rows = this.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    this.touch();
  }

  /** Validate, then personalise and zip the kit, and hand the file to the browser. */
  async download() {
    this.showProblems = true;
    this.refresh();
    const data = this.data();
    if (problemsFor(data).length > 0) {
      this.setStatus("Fix the problems shown in the form, then download again.", true);
      return { ok: false };
    }
    this.byId("download").disabled = true;
    this.setStatus("Building your site…", false);
    try {
      const zip = await buildZip(data, this.zipDeps());
      this.save(zip);
      this.setStatus(`Downloaded ${zip.name}. Next, put it online below.`, false);
      this.byId("online-panel").hidden = false;
      return { ok: true, name: zip.name };
    } catch (error) {
      this.setStatus(`Could not build the zip: ${error.message}`, true);
      return { ok: false, error: error.message };
    } finally {
      this.byId("download").disabled = false;
    }
  }

  zipDeps() {
    return {
      fetch: this.deps.fetch ?? globalThis.fetch.bind(globalThis),
      JSZip: this.deps.JSZip ?? globalThis.JSZip,
      outputType: this.deps.outputType,
    };
  }

  save(zip) {
    if (this.deps.save) {
      this.deps.save(zip);
      return;
    }
    const url = URL.createObjectURL(zip.content);
    const link = this.doc.createElement("a");
    link.href = url;
    link.download = zip.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ---- rendering ----

  setStatus(text, isError) {
    const status = this.byId("download-status");
    status.textContent = text;
    status.className = isError ? "status error" : "status";
  }

  syncShopFields() {
    for (const field of TEXT_FIELDS) {
      this.byId(`f-${field}`).value = this.shop[field];
    }
    this.byId("f-pickup").checked = this.shop.pickup;
    this.byId("f-delivery").checked = this.shop.delivery;
  }

  /** Show each problem next to its field, once the owner has started typing. */
  refresh() {
    const groups = this.showProblems ? groupProblems(this.problems()) : {};
    for (const field of ERROR_FIELDS) {
      const messages = groups[field] ?? [];
      const box = this.byId(`err-${field}`);
      box.textContent = messages.join(" ");
      box.hidden = messages.length === 0;
      const input = field in this.shop || field === "primary" ? this.doc.getElementById(`f-${field}`) : null;
      if (input) {
        input.setAttribute("aria-invalid", messages.length > 0 ? "true" : "false");
      }
    }
  }

  renderRows() {
    this.byId("menu-body").replaceChildren(...this.rows.map((row, index) => this.renderRow(row, index)));
  }

  renderRow(row, index) {
    const tr = this.doc.createElement("tr");
    for (const [key, label, type] of MENU_COLUMNS) {
      tr.append(this.cell(label, this.input(type, `${label}, item ${index + 1}`, row[key], (value) => this.setRow(index, key, value))));
    }
    const box = this.input("checkbox", `Available, item ${index + 1}`, "", (value) => this.setRow(index, "available", value));
    box.checked = row.available;
    tr.append(this.cell("Available", box));
    const remove = this.doc.createElement("button");
    remove.type = "button";
    remove.className = "link-button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove item ${index + 1}`);
    remove.addEventListener("click", () => this.removeRow(index));
    tr.append(this.cell("", remove));
    return tr;
  }

  cell(label, child) {
    const td = this.doc.createElement("td");
    td.setAttribute("data-label", label);
    td.append(child);
    return td;
  }

  input(type, label, value, onChange) {
    const el = this.doc.createElement("input");
    el.type = type;
    el.setAttribute("aria-label", label);
    if (type === "number") {
      el.min = "0";
      el.step = "1";
      el.inputMode = "numeric";
    }
    if (type !== "checkbox") {
      el.value = value;
    }
    const isBox = type === "checkbox";
    el.addEventListener(isBox ? "change" : "input", () => onChange(isBox ? el.checked : el.value));
    return el;
  }
}

export class Builder {
  /** The one page object, shared with site-actions.js and site.js. */
  static page = new BuilderPage(document);
}

export { formatRupiah, parseTags };
