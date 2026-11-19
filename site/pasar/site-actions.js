// Registers Pasar's one agent action. agent-manifest.json loads this module through
// "actions.module"; the name in "actions.agentTools" becomes the tool website_list_warungs.
// The page's data and rules stay in app.js; this file only wraps them.
import { App } from "./app.js";

/**
 * Describes Pasar's operations as actions the agents can call. Pasar has no action that
 * changes anything: ordering happens in a warung's own window.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.listWarungsAction());
  }

  /**
   * Describe the read that returns the warung list.
   *
   * :return: The action definition.
   */
  static listWarungsAction() {
    return {
      name: "list_warungs",
      description: "Read the warung that Pasar lists: name, area, the kinds of food, the network URL of its assistant and the link to its page. It has no menu or prices: ask the warung for those. Call it before choosing whom to ask, and give the buyer a warung's page link from it. Changes nothing.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.listWarungs,
    };
  }

  /**
   * Return the warung list once the page has loaded it.
   *
   * :return: A promise of {warungs: [...]}.
   */
  static async listWarungs() {
    await App.page.ready;
    return { warungs: App.page.getWarungs() };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
