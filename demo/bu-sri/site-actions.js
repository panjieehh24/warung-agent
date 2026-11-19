// Registers this warung's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
// Each action wraps App.page (app.js), so the assistant and the page's own buttons
// share one set of rules. place_order is not here: only the bridge shares it.
import { App } from "./app.js";
import { MAX_NOTE, MAX_QTY } from "./order.js";

/**
 * Describes the warung page's operations as actions the agents can call.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.readStateAction());
    actions.register(SiteActions.sendOrderAction());
  }

  static menuIds() {
    return App.page === null ? [] : App.page.data.menu.map((item) => item.id);
  }

  static readStateAction() {
    return {
      name: "get_warung_state",
      description: "Read this warung: name, area, opening hours, whether it offers pickup and delivery, the WhatsApp number, the whole menu (ids, prices in rupiah, descriptions, tags, whether each item is available) and the buyer's current basket on the page. Changes nothing. Call it before answering about the menu or prices, and again in each turn that needs it: the buyer can also use the page.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.readState,
    };
  }

  static readState() {
    return App.requirePage().getState();
  }

  static sendOrderAction() {
    const ids = SiteActions.menuIds();
    const idSchema = {
      type: "string",
      description: "Menu id from website_get_warung_state. Only available items.",
    };
    if (ids.length > 0) {
      idSchema.enum = ids;
    }
    return {
      name: "send_order_whatsapp",
      description: "Hand an order to this warung's WhatsApp, after the buyer says what they want and whether it is pickup or delivery. Read website_get_warung_state first in the same turn and use its ids. The browser asks the buyer to confirm, then opens WhatsApp with the order filled in for the warung's number. Never put names, phone numbers or addresses in note: the shop asks in chat. Returns the order code and total with confirmed false: the warung confirms in WhatsApp, so never say the order is confirmed or paid.",
      effect: "irreversible",
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
                id: idSchema,
                qty: {
                  type: "integer",
                  minimum: 1,
                  maximum: MAX_QTY,
                  description: "How many.",
                },
              },
            },
          },
          fulfilment: {
            type: "string",
            enum: ["pickup", "delivery"],
            description: "pickup or delivery, as the buyer chose. Only what the warung offers.",
          },
          note: {
            type: "string",
            maxLength: MAX_NOTE,
            description: "Optional food note such as less spicy. No names, phone numbers or addresses.",
          },
        },
      },
      execute: SiteActions.sendOrder,
    };
  }

  /**
   * Send the order through the same function the page's own button uses.
   *
   * :return: The receipt, or {ok: false, reason} when the page refuses the order.
   */
  static sendOrder(args) {
    return App.requirePage().sendOrder(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
