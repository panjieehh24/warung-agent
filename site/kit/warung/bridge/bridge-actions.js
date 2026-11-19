// The actions this warung shares with other agent sites, through its action bridge.
// bridge/agent-manifest.json loads this module in a hidden frame on this site's origin,
// which has no warung page. So the read loads warung.json afresh, and has no basket.
// The order is in place-order.js.
import { publicState } from "../order.js";
import { loadWarung } from "./load-warung.js";
import { PlaceOrder } from "./place-order.js";

/**
 * Shares the menu (to every site) and an order window (to the Pasar only).
 */
class BridgeActions {
  /**
   * Register the shared read and the order with the bridge's registry.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(BridgeActions.readStateAction());
    actions.register(PlaceOrder.definition());
  }

  static readStateAction() {
    return {
      name: "get_warung_state",
      description: "Read this warung: name, area, opening hours, whether it offers pickup and delivery, the WhatsApp number and the whole menu (ids, prices in rupiah, descriptions, tags, whether each item is available). Changes nothing. Call it before answering about the menu or prices.",
      effect: "read",
      availability: "bridge",
      // The menu is what the public page already shows, so every site may read it.
      callerOrigins: ["*"],
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: BridgeActions.readState,
    };
  }

  /**
   * Read warung.json fresh, so a shop's edit shows at once.
   */
  static async readState() {
    const data = await loadWarung();
    return publicState(data);
  }
}

// The bridge calls the module's registerActions export.
export const registerActions = BridgeActions.registerActions;
