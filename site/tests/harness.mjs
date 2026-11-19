// Shared setup for the Builder's tests. Not a .test.mjs file, so tests may import it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ActionRegistry } from "../runtime/actions.js";
import { AgentNetwork } from "../runtime/kernel.js";
import { TraceBus } from "../runtime/trace.js";
import { ScriptedModel } from "./scripted_model.mjs";
import { StubDocument } from "./stub_document.mjs";
import { StubElement } from "./stub_element.mjs";
import { StubOption } from "./stub_option.mjs";

export const NETWORK_NAME = "warung_builder";
export const BASE = "http://localhost:8080";
export { ScriptedModel, StubElement };

// Page scripts touch the DOM when they load, so give them a stand-in first.
globalThis.document = StubDocument.fromHtml(await readFile(new URL("../index.html", import.meta.url), "utf8"), `${BASE}/`);
globalThis.Option = StubOption;

export const { registerActions } = await import("../site-actions.js");
export const { AssistantMount } = await import("../site.js");
export const { Builder, BuilderPage } = await import("../builder.js");
export const core = await import("../builder-core.js");

export async function load() {
  const config = JSON.parse(await readFile(new URL(`../${NETWORK_NAME}.network.json`, import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../agent-manifest.json", import.meta.url), "utf8"));
  return { config, manifest, network: new AgentNetwork(config, NETWORK_NAME) };
}

export const scope = () => ({ base: BASE, network: NETWORK_NAME });

export async function registry() {
  const reg = new ActionRegistry();
  await registerActions({ register: reg.register.bind(reg, scope()) });
  return reg;
}

export function context(loaded, reg, model, confirm) {
  return {
    network: loaded.network,
    manifest: loaded.manifest,
    actions: reg,
    baseOrigin: BASE,
    displayOrigin: new URL(BASE).host,
    trace: new TraceBus(),
    isTop: true,
    frontMan: loaded.network.findFrontMan(),
    history: [],
    llm: model,
    confirmWebsiteActions: confirm,
  };
}

export function ref(reg, name) {
  for (const entry of reg.catalog(scope())) {
    if (entry.name === name) {
      return entry.ref;
    }
  }
  throw new Error(`Action ${name} is not registered.`);
}

export const approve = async () => true;
export const decline = async () => false;

export async function readState(reg) {
  const plan = reg.prepare({ kind: "action", action: ref(reg, "get_builder_state"), arguments: {} });
  const receipts = await reg.execute(plan, approve, "test-read");
  return receipts[0].result;
}

/** The irreversible call as the runtime hands it to review(). */
export const callItem = (action, args, origin = BASE) => ({ action, origin, effect: "irreversible", arguments: args });

/** Open review()'s dialog for an item and press the button with this label (null = Escape). */
export function answerDialog(item, label) {
  const answer = AssistantMount.review([item]);
  const dialog = document.body.children.at(-1);
  assert.equal(dialog?.open, true, "review() did not open the dialog.");
  const title = dialog.children[0];
  assert.equal(title.textContent, AssistantMount.DIALOGS[item.action].title);
  assert.equal(title.autofocus, true);
  assert.equal(title.tabIndex, -1);
  if (label === null) {
    dialog.pressEscape();
    return answer;
  }
  for (const button of dialog.querySelectorAll("button")) {
    if (button.textContent === label) {
      button.dispatch("click");
      return answer;
    }
  }
  throw new Error(`The dialog has no "${label}" button.`);
}

export const SAMPLE_ITEMS = [
  { name: "Nasi Goreng", category: "Makanan", price: 15000, tags: ["pedas"] },
  { name: "Mie Goreng", category: "Makanan", price: 14000 },
  { name: "Es Teh", category: "Minuman", price: 4000 },
  { name: "Es Teh", category: "Minuman", price: 5000, available: false },
];
