// The ordering rules, with no DOM: the page, the assistant's actions and the bridge's
// order window all call these, so a person and an agent get the same checks and message.
// All reasons are in Indonesian, since the buyer and the shop read them.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;
export const MIN_QTY = 1;
export const MAX_QTY = 50;
export const MAX_NOTE = 120;
export const FULFILMENTS = ["pickup", "delivery"];

/**
 * Format whole rupiah the Indonesian way, such as 15000 -> "Rp15.000".
 */
export function formatRupiah(amount) {
  return `Rp${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Make an order code "WA-XXXX". 256 is a multiple of the 32-letter alphabet, so a byte
 * modulo 32 picks each letter evenly.
 */
export function makeOrderCode(cryptoSource = globalThis.crypto) {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `WA-${code}`;
}

function refuse(reason, field) {
  return { ok: false, reason, field };
}

function checkFulfilment(shop, fulfilment) {
  if (!FULFILMENTS.includes(fulfilment)) {
    return refuse("Pilih ambil sendiri (pickup) atau diantar (delivery).", "fulfilment");
  }
  if (!shop[fulfilment]) {
    const label = fulfilment === "pickup" ? "ambil sendiri" : "diantar";
    return refuse(`Warung ini tidak melayani ${label}.`, "fulfilment");
  }
  return null;
}

function checkNote(note) {
  if (note === undefined || note === null) {
    return { value: "" };
  }
  if (typeof note !== "string") {
    return { refusal: refuse("Catatan harus berupa teks.", "note") };
  }
  const value = note.trim().replace(/\s+/g, " ");
  if (value.length > MAX_NOTE) {
    return { refusal: refuse(`Catatan maksimal ${MAX_NOTE} karakter.`, "note") };
  }
  return { value };
}

function checkLine(menuById, line, seen) {
  if (line === null || typeof line !== "object") {
    return { refusal: refuse("Setiap item harus berisi id dan qty.", "items") };
  }
  const item = menuById.get(line.id);
  if (!item) {
    return { refusal: refuse(`Menu dengan id "${line.id}" tidak ada.`, "items") };
  }
  if (seen.has(line.id)) {
    return { refusal: refuse(`${item.name} ditulis dua kali. Gabungkan jadi satu item.`, "items") };
  }
  if (!item.available) {
    return { refusal: refuse(`${item.name} sedang habis.`, "items") };
  }
  if (!Number.isInteger(line.qty) || line.qty < MIN_QTY || line.qty > MAX_QTY) {
    return { refusal: refuse(`Jumlah ${item.name} harus bilangan bulat ${MIN_QTY} sampai ${MAX_QTY}.`, "items") };
  }
  seen.add(line.id);
  return { line: { id: item.id, name: item.name, qty: line.qty, price: item.price, subtotal: item.price * line.qty } };
}

/**
 * Check an order against the menu, and change nothing.
 *
 * :param data: The warung.json value.
 * :param input: {items: [{id, qty}], fulfilment, note?}.
 * :return: {ok: true, lines, total, fulfilment, note} or {ok: false, reason, field}.
 */
export function checkOrder(data, input) {
  if (input === null || typeof input !== "object" || !Array.isArray(input.items) || input.items.length === 0) {
    return refuse("Pilih minimal satu menu.", "items");
  }
  const menuById = new Map(data.menu.map((item) => [item.id, item]));
  const seen = new Set();
  const lines = [];
  for (const raw of input.items) {
    const checked = checkLine(menuById, raw, seen);
    if (checked.refusal) {
      return checked.refusal;
    }
    lines.push(checked.line);
  }
  const fulfilmentRefusal = checkFulfilment(data.shop, input.fulfilment);
  if (fulfilmentRefusal) {
    return fulfilmentRefusal;
  }
  const note = checkNote(input.note);
  if (note.refusal) {
    return note.refusal;
  }
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  return { ok: true, lines, total, fulfilment: input.fulfilment, note: note.value };
}

/**
 * Build the Indonesian order message that goes to the shop's WhatsApp.
 */
export function buildMessage(data, checked, code) {
  const lines = [`Halo ${data.shop.name}, saya mau pesan (kode ${code}):`];
  for (const line of checked.lines) {
    lines.push(`- ${line.qty}x ${line.name} — ${formatRupiah(line.subtotal)}`);
  }
  lines.push(`Total: ${formatRupiah(checked.total)}`);
  lines.push(checked.fulfilment === "pickup" ? "Ambil sendiri" : "Minta diantar (ongkir dikonfirmasi di chat)");
  if (checked.note) {
    lines.push(`Catatan: ${checked.note}`);
  }
  lines.push("(dipesan lewat Warung Agent)");
  return lines.join("\n");
}

export function whatsappUrl(data, message) {
  return `https://wa.me/${data.shop.whatsapp}?text=${encodeURIComponent(message)}`;
}

/**
 * Check an order, then make its code, message and WhatsApp link. Sends nothing.
 *
 * :return: The refusal, or {ok: true, code, total, message, url, lines}.
 */
export function prepareOrder(data, input, cryptoSource) {
  const checked = checkOrder(data, input);
  if (!checked.ok) {
    return checked;
  }
  const code = makeOrderCode(cryptoSource);
  const message = buildMessage(data, checked, code);
  return { ok: true, code, total: checked.total, lines: checked.lines, message, url: whatsappUrl(data, message) };
}

/**
 * What an assistant gets back: the order was handed to WhatsApp, not confirmed by the shop.
 */
export function receiptOf(prepared) {
  return { ok: true, order_code: prepared.code, total: prepared.total, handed_to: "whatsapp", confirmed: false };
}

/**
 * The public, basket-free view of a warung, for get_warung_state.
 */
export function publicState(data) {
  const { shop } = data;
  return {
    shop: { name: shop.name, tagline: shop.tagline ?? "", whatsapp: shop.whatsapp },
    hours: shop.hours ?? "",
    area: shop.area ?? "",
    fulfilment: { pickup: shop.pickup, delivery: shop.delivery },
    currency: "IDR (rupiah utuh)",
    menu: data.menu.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category ?? "",
      price: item.price,
      priceText: formatRupiah(item.price),
      description: item.description ?? "",
      tags: item.tags ?? [],
      available: item.available,
    })),
  };
}
