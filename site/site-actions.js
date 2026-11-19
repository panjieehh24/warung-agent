// Registers the Builder's operations with the agent runtime (agent-manifest.json ->
// "actions.module"). Every action is "read" or "irreversible": a model-called "write"
// would run with no dialog. The page's own buttons (Download, add and remove rows) are
// for people only and are not listed here.
// Import builder.js by the same URL the page uses, so both share one page object.
import { Builder } from "./builder.js";

const SHOP_PROPERTIES = {
  name: { type: "string", minLength: 1, maxLength: 80, description: "Shop name." },
  tagline: { type: "string", maxLength: 120, description: "Short line under the name." },
  area: { type: "string", maxLength: 80, description: "Neighbourhood and city, such as 'Kemang, Jakarta Selatan'." },
  hours: { type: "string", maxLength: 80, description: "Opening hours in the owner's words." },
  whatsapp: { type: "string", maxLength: 24, description: "The shop's WhatsApp number as the owner wrote it, such as 0812-3456-7890 or +62 812 3456 7890. The page turns it into 62 followed by digits." },
  pickup: { type: "boolean", description: "True when buyers can pick up." },
  delivery: { type: "boolean", description: "True when the shop delivers." },
};

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "price"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80, description: "Dish or drink name." },
    category: { type: "string", maxLength: 40, description: "Such as Makanan, Minuman, Camilan." },
    price: { type: "integer", minimum: 1, maximum: 10000000, description: "Whole rupiah, such as 15000. You work this out from the owner's text; ask if unclear." },
    description: { type: "string", maxLength: 200, description: "Short description, only if the owner gave one." },
    tags: { type: "array", maxItems: 10, items: { type: "string", maxLength: 30 }, description: "Free-text tags in the owner's words, such as pedas or vegetarian." },
    available: { type: "boolean", description: "False if the owner said it is sold out. Default true." },
  },
};

class SiteActions {
  static registerActions(actions) {
    actions.register(SiteActions.readStateAction());
    actions.register(SiteActions.fillShopAction());
    actions.register(SiteActions.fillMenuAction());
  }

  static readStateAction() {
    return {
      name: "get_builder_state",
      description: "Read the form as it is now: shop details, theme colour, menu items (with ids) and the list of problems that still block the download. Call it before saying what is filled or missing, and again in each turn that needs it: the owner also types in the form.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => Builder.page.getState(),
    };
  }

  static fillShopAction() {
    return {
      name: "fill_shop_details",
      description: "Put the shop details the owner gave into the form. Replaces only the fields you pass and leaves the rest. Call it only after the owner told you the values, never guess a WhatsApp number. The browser asks the owner to confirm. Returns the new form state, or ok false with a reason.",
      effect: "irreversible",
      inputSchema: { type: "object", additionalProperties: false, properties: SHOP_PROPERTIES },
      execute: (args) => Builder.page.fillShopDetails(args),
    };
  }

  static fillMenuAction() {
    return {
      name: "fill_menu",
      description: "Replace the whole menu table with these items, so pass every item, not just new ones. Each price must be whole rupiah that you worked out from the owner's text. The browser shows the owner every item and price to confirm. Returns the new form state, or ok false with a reason.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: { items: { type: "array", minItems: 1, maxItems: 200, items: ITEM_SCHEMA } },
      },
      execute: (args) => Builder.page.fillMenu(args),
    };
  }
}

export const registerActions = SiteActions.registerActions;
