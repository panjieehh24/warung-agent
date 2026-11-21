// The order this warung shares with other agent sites (the Pasar), through its action
// bridge. bridge-actions.js registers it.
//
// An order is irreversible, so the runtime runs it in a window on this site that the
// visitor sees. The window shows the order and total, and a "Kirim ke WhatsApp" button.
// The button is a direct click, so the browser allows the WhatsApp popup. The calling
// assistant gets back only the code, the total and that it was handed to WhatsApp.
import { loadWarung } from "./load-warung.js";
import { checkOrder, formatRupiah, MAX_NOTE, MAX_QTY, prepareOrder, receiptOf } from "../order.js";

const STYLE_URL = new URL("../styles.css", import.meta.url).href;

/**
 * Shares one irreversible write, with the checks the page's own order button uses.
 */
export class PlaceOrder {
  /**
   * The site allowed to order through this window: the Pasar, as an exact origin.
   * scripts/set-origins.mjs swaps this one string, so keep it on its own line.
   */
  static CALLERS = ["https://panjieehh24.github.io"];

  /**
   * Describe the shared order.
   *
   * :return: The action definition.
   */
  static definition() {
    return {
      name: "place_order",
      description: "Place an order at this warung, in one call. Use ids from get_warung_state, and only available items. A window opens on this site, where the buyer checks the order and sends it to the warung's WhatsApp, so never ask for a name, phone number or address. Returns once the buyer has sent or cancelled there. With ok true the order was handed to WhatsApp with confirmed false: the warung confirms in WhatsApp, so never call it confirmed or paid. Returns the order code and total, or ok false with the reason, such as the buyer cancelling.",
      effect: "irreversible",
      availability: "bridge",
      callerOrigins: PlaceOrder.CALLERS,
      // The window shows the order and asks the buyer to send or cancel, so the runtime's
      // generic dialog of the raw arguments is not needed.
      confirmsInWindow: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["items", "fulfilment"],
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 30,
            description: "One line per menu item.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "qty"],
              properties: {
                id: { type: "string", description: "Menu id from get_warung_state." },
                qty: { type: "integer", minimum: 1, maximum: MAX_QTY, description: "How many." },
              },
            },
          },
          fulfilment: {
            type: "string",
            enum: ["pickup", "delivery"],
            description: "pickup or delivery. Only what the warung offers.",
          },
          note: {
            type: "string",
            maxLength: MAX_NOTE,
            description: "Optional food note such as less spicy. No names, phone numbers or addresses.",
          },
        },
      },
      execute: PlaceOrder.order,
    };
  }

  /**
   * Check the order against a fresh load of warung.json, then ask the buyer in this window.
   *
   * :return: A refusal, or a promise of the receipt or the buyer's cancel.
   */
  static async order(args, context) {
    const data = await loadWarung();
    const checked = checkOrder(data, args);
    if (!checked.ok) {
      return checked;
    }
    return new Promise(PlaceOrder.showWindow.bind(null, { data, args, checked, caller: PlaceOrder.hostOf(context?.callerOrigin) }));
  }

  static hostOf(origin) {
    try {
      return new URL(origin).host;
    } catch {
      return "situs lain";
    }
  }

  static element(tag, text = "", className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) {
      element.className = className;
    }
    return element;
  }

  static showWindow(state, resolve) {
    const { data } = state;
    document.title = `Pesan di ${data.shop.name}`;
    document.head.append(PlaceOrder.stylesheet());
    document.body.classList.add("order-window");
    const box = PlaceOrder.element("main", "", "panel");
    box.append(
      PlaceOrder.element("h1", `Pesan di ${data.shop.name} · Order at ${data.shop.name}`),
      PlaceOrder.element("p", `Asisten di ${state.caller} meminta pesanan ini. Periksa dulu. Nama dan alamatmu tidak dikirim lewat chat: warung menanyakannya di WhatsApp. / An assistant on ${state.caller} asked for this order. Check it first. Your name and address are not sent: the warung asks for them on WhatsApp.`),
      PlaceOrder.summary(state),
      PlaceOrder.buttons(state, box, resolve),
    );
    document.body.append(box);
  }

  static stylesheet() {
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = STYLE_URL;
    return sheet;
  }

  static summary(state) {
    const { checked, data } = state;
    const list = PlaceOrder.element("ul");
    for (const line of checked.lines) {
      list.append(PlaceOrder.element("li", `${line.qty} × ${line.name} — ${formatRupiah(line.subtotal)}`));
    }
    const section = PlaceOrder.element("section");
    section.append(
      list,
      PlaceOrder.element("p", `Total: ${formatRupiah(checked.total)}`, "total"),
      PlaceOrder.element("p", checked.fulfilment === "pickup" ? "Ambil sendiri · Pickup" : "Diantar · Delivery (ongkir dikonfirmasi di chat · fee confirmed in chat)"),
      PlaceOrder.element("p", `WhatsApp warung: +${data.shop.whatsapp}`),
    );
    if (checked.note) {
      section.append(PlaceOrder.element("p", `Catatan: ${checked.note}`));
    }
    return section;
  }

  static buttons(state, box, resolve) {
    const send = PlaceOrder.element("button", "Kirim ke WhatsApp · Send on WhatsApp");
    send.type = "button";
    const cancel = PlaceOrder.element("button", "Jangan pesan · Don't order", "secondary");
    cancel.type = "button";
    send.addEventListener("click", PlaceOrder.send.bind(null, state, box, resolve));
    cancel.addEventListener("click", PlaceOrder.cancel.bind(null, box, resolve));
    const row = PlaceOrder.element("p", "", "actions");
    row.append(send, cancel);
    return row;
  }

  /**
   * Open WhatsApp from the buyer's own click, show the confirmation (its link is the
   * fallback when a popup is blocked) and resolve with the receipt. open() returns null
   * with "noopener", so its result says nothing about a block.
   */
  static send(state, box, resolve) {
    const prepared = prepareOrder(state.data, state.args);
    if (!prepared.ok) {
      resolve(prepared);
      return;
    }
    globalThis.open(prepared.url, "_blank", "noopener");
    box.replaceChildren(PlaceOrder.confirmation(prepared));
    resolve(receiptOf(prepared));
  }

  static confirmation(prepared) {
    const section = PlaceOrder.element("section");
    const link = PlaceOrder.element("a", "Buka WhatsApp · Open WhatsApp", "button");
    link.href = prepared.url;
    link.target = "_blank";
    link.rel = "noopener";
    section.append(
      PlaceOrder.element("h2", "Buka WhatsApp lalu tekan Kirim · Open WhatsApp, then press Send"),
      PlaceOrder.element("p", "Pesanan belum terkirim sampai kamu menekan Kirim di WhatsApp. / The order is not sent until you press Send in WhatsApp."),
      PlaceOrder.element("p", `Kode pesanan: ${prepared.code}. Total: ${formatRupiah(prepared.total)}.`),
      link,
      PlaceOrder.element("p", "Pesanan dikonfirmasi oleh warung di WhatsApp."),
    );
    return section;
  }

  static cancel(box, resolve) {
    box.replaceChildren(PlaceOrder.element("h2", "Tidak jadi memesan · Order cancelled"));
    resolve({ ok: false, reason: "Pembeli membatalkan di jendela pesanan. Tidak ada yang dipesan." });
  }
}
