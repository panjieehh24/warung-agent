// The warung page: loads warung.json, shows the menu and basket, and sends orders to
// WhatsApp. It works with no assistant. site-actions.js, site.js and the tests use the
// same page object through App.page, so a person and an agent follow one set of rules.
import { validateWarung } from "./warung-data.mjs";
import { formatRupiah, prepareOrder, receiptOf, checkOrder, publicState, MAX_QTY, MAX_NOTE } from "./order.js";

const DATA_URL = new URL("./warung.json", import.meta.url).href;

function el(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}

class Page {
  constructor(data) {
    this.data = data;
    this.basket = new Map();
    this.fulfilment = data.shop.pickup ? "pickup" : "delivery";
    this.noteText = "";
    this.lastReceipt = null;
  }

  basketItems() {
    return [...this.basket].map(([id, qty]) => ({ id, qty }));
  }

  /**
   * Read the page's data and basket as plain JSON.
   */
  getState() {
    return {
      ...publicState(this.data),
      basket: {
        items: this.basketItems(),
        total: this.basketTotal(),
        totalText: formatRupiah(this.basketTotal()),
        fulfilment: this.fulfilment,
        note: this.noteText,
      },
      lastOrder: this.lastReceipt,
    };
  }

  basketTotal() {
    let total = 0;
    for (const [id, qty] of this.basket) {
      total += this.data.menu.find((item) => item.id === id).price * qty;
    }
    return total;
  }

  /**
   * Change one basket line by delta. Refuses an unknown or sold-out item, and a
   * quantity above the limit, and changes nothing then.
   */
  changeQty(id, delta) {
    const item = this.data.menu.find((entry) => entry.id === id);
    if (!item) {
      return { ok: false, reason: `Menu dengan id "${id}" tidak ada.`, field: "id" };
    }
    const next = (this.basket.get(id) ?? 0) + delta;
    if (delta > 0 && !item.available) {
      return { ok: false, reason: `${item.name} sedang habis.`, field: "id" };
    }
    if (next > MAX_QTY) {
      return { ok: false, reason: `Maksimal ${MAX_QTY} per menu.`, field: "id" };
    }
    if (next <= 0) {
      this.basket.delete(id);
    } else {
      this.basket.set(id, next);
    }
    this.renderBasket();
    return { ok: true };
  }

  /**
   * Check an order without sending it. The assistant's review dialog calls this.
   */
  checkOrder(input) {
    return checkOrder(this.data, input);
  }

  /**
   * The one ordering path, for people and agents: check, build the message, open
   * WhatsApp and show the confirmation panel. Refuses bad input and changes nothing.
   */
  sendOrder(input) {
    const prepared = prepareOrder(this.data, input);
    if (!prepared.ok) {
      return prepared;
    }
    const receipt = receiptOf(prepared);
    this.lastReceipt = receipt;
    this.showConfirmation(prepared);
    // A popup opened outside a tap may be blocked: the panel's link is the fallback.
    if (typeof globalThis.open === "function") {
      globalThis.open(prepared.url, "_blank", "noopener");
    }
    return receipt;
  }

  /**
   * The page's own "Pesan via WhatsApp" button.
   */
  orderFromBasket() {
    const result = this.sendOrder({
      items: this.basketItems(),
      fulfilment: this.fulfilment,
      note: this.noteText,
    });
    const error = document.getElementById("order-error");
    error.hidden = result.ok;
    error.textContent = result.ok ? "" : result.reason;
    return result;
  }

  showConfirmation(prepared) {
    document.getElementById("confirm-code").textContent = prepared.code;
    document.getElementById("confirm-total").textContent = formatRupiah(prepared.total);
    document.getElementById("confirm-link").href = prepared.url;
    document.getElementById("confirmation").hidden = false;
    document.getElementById("order-error").hidden = true;
  }

  render() {
    const { shop, theme } = this.data;
    document.title = shop.name;
    document.getElementById("app").setAttribute("style", `--accent: ${theme.primary}`);
    document.getElementById("shop-name").textContent = shop.name;
    document.getElementById("shop-tagline").textContent = shop.tagline ?? "";
    document.getElementById("shop-meta").textContent = [shop.area, shop.hours].filter(Boolean).join(" · ");
    document.getElementById("assistant-heading").textContent = `Tanya asisten ${shop.name}`;
    this.renderMenu();
    this.renderFulfilment();
    this.renderBasket();
    this.bindControls();
  }

  renderMenu() {
    const groups = new Map();
    for (const item of this.data.menu) {
      const category = item.category || "Menu";
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }
    const sections = [];
    for (const [category, items] of groups) {
      const section = el("section", "", "category");
      section.append(el("h3", category), ...items.map((item) => this.menuCard(item)));
      sections.push(section);
    }
    document.getElementById("menu").replaceChildren(...sections);
  }

  menuCard(item) {
    const card = el("article", "", item.available ? "item" : "item sold-out");
    const info = el("div", "", "info");
    info.append(el("h4", item.name));
    if (item.description) {
      info.append(el("p", item.description, "desc"));
    }
    const tags = el("p", "", "tags");
    tags.append(...(item.tags ?? []).map((tag) => el("span", tag, "chip")));
    info.append(tags);
    const buy = el("div", "", "buy");
    buy.append(el("strong", formatRupiah(item.price), "price"));
    if (item.available) {
      const add = el("button", "Tambah", "add");
      add.type = "button";
      add.addEventListener("click", () => this.changeQty(item.id, 1));
      buy.append(add);
    } else {
      buy.append(el("span", "Habis · Sold out", "chip soldout"));
    }
    card.append(info, buy);
    return card;
  }

  renderFulfilment() {
    const select = document.getElementById("fulfilment");
    const options = [];
    for (const [value, label] of [["pickup", "Ambil sendiri"], ["delivery", "Diantar (ongkir dikonfirmasi di chat)"]]) {
      if (this.data.shop[value]) {
        const option = el("option", label);
        option.value = value;
        options.push(option);
      }
    }
    select.replaceChildren(...options);
    select.value = this.fulfilment;
  }

  renderBasket() {
    const rows = [];
    for (const [id, qty] of this.basket) {
      const item = this.data.menu.find((entry) => entry.id === id);
      const row = el("li");
      const minus = this.qtyButton("−", `Kurangi ${item.name}`, id, -1);
      const plus = this.qtyButton("+", `Tambah ${item.name}`, id, 1);
      row.append(el("span", `${item.name} × ${qty}`), el("span", formatRupiah(item.price * qty)), minus, plus);
      rows.push(row);
    }
    document.getElementById("basket-list").replaceChildren(...rows);
    document.getElementById("basket-empty").hidden = rows.length > 0;
    document.getElementById("basket-total").textContent = formatRupiah(this.basketTotal());
    document.getElementById("order-button").disabled = rows.length === 0;
  }

  qtyButton(symbol, label, id, delta) {
    const button = el("button", symbol, "qty");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => this.changeQty(id, delta));
    return button;
  }

  bindControls() {
    const select = document.getElementById("fulfilment");
    select.addEventListener("change", () => {
      this.fulfilment = select.value;
    });
    const note = document.getElementById("note");
    note.maxLength = MAX_NOTE;
    note.addEventListener("input", () => {
      this.noteText = note.value;
    });
    document.getElementById("order-button").addEventListener("click", () => this.orderFromBasket());
  }
}

/**
 * The page object the assistant's code shares. App.page is null when warung.json could
 * not be loaded or is invalid; the page then shows why in #load-error.
 */
export class App {
  static page = null;

  static showLoadError(message) {
    const box = document.getElementById("load-error");
    box.textContent = message;
    box.hidden = false;
  }

  static async loadData(url = DATA_URL) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`warung.json tidak bisa dimuat (${response.status}).`);
    }
    return response.json();
  }

  static async start() {
    try {
      const data = await App.loadData();
      const problems = validateWarung(data);
      if (problems.length > 0) {
        throw new Error(`warung.json bermasalah: ${problems.join(" ")}`);
      }
      App.page = new Page(data);
      App.page.render();
    } catch (error) {
      App.showLoadError(error.message);
    }
  }

  static requirePage() {
    if (App.page === null) {
      throw new Error("Menu warung belum termuat.");
    }
    return App.page;
  }
}

if (typeof document !== "undefined") {
  await App.start();
}
