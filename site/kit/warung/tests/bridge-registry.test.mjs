// Registers the bridge's shared actions through the runtime's real ActionRegistry, the
// way runtime/action-transport.js does in the partner's hidden frame. A stubbed registry
// once let callerOrigins "*" (a string, not a list) reach production.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { registerActions } from "../bridge/bridge-actions.js";

const SCOPE = { base: "https://warung.example/bu-sri/", network: "warung" };

function registerAll() {
  const registry = new ActionRegistry();
  const definitions = [];
  registerActions({
    register: (definition) => {
      definitions.push(definition);
      return registry.register(SCOPE, definition);
    },
  });
  return { catalog: registry.catalog(SCOPE), definitions };
}

test("every bridge action passes the runtime's own registration checks", () => {
  const names = registerAll().catalog.map((entry) => entry.name).sort();
  assert.deepEqual(names, ["get_warung_state", "place_order"]);
});

test("the menu read is shared with every site, the order with exact origins only", () => {
  const byName = Object.fromEntries(registerAll().definitions.map((d) => [d.name, d]));
  assert.deepEqual(byName.get_warung_state.callerOrigins, ["*"]);
  assert.ok(byName.place_order.callerOrigins.length > 0);
  assert.ok(byName.place_order.callerOrigins.every((o) => o !== "*" && new URL(o).origin === o));
});
