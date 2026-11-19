// Shared setup for the warung tests: a DOM stand-in, a fetch that reads warung.json from
// disk, and helpers that build the runtime's objects. Not a test file: each *.test.mjs
// imports it, so each test file runs in its own process with its own page.
import { readFile } from "node:fs/promises";
import { ActionRegistry } from "../runtime/actions.js";
import { AgentNetwork } from "../runtime/kernel.js";
import { buildToolTable } from "../runtime/runner.js";
import { TraceBus } from "../runtime/trace.js";
import { StubDocument } from "./stub_document.mjs";
import { StubElement } from "./stub_element.mjs";

export const NETWORK_NAME = "warung";
export const BASE = "http://localhost:8080";
export const WARUNG = JSON.parse(await readFile(new URL("../warung.json", import.meta.url), "utf8"));

/** Every window.open(url, ...) the page made, newest last. */
export const opened = [];

globalThis.document = StubDocument.fromHtml(await readFile(new URL("../index.html", import.meta.url), "utf8"), `${BASE}/`);
globalThis.document.head = new StubElement("head");
globalThis.document.body.classList = { add() {} };
globalThis.open = (url, _target, features = "") => {
  opened.push(url);
  return features.includes("noopener") ? null : {}; // browsers return null with noopener
};
globalThis.fetch = async (url) => {
  const name = new URL(url).pathname.split("/").pop();
  const text = await readFile(new URL(`../${name}`, import.meta.url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

export const { App } = await import("../app.js");
export const { registerActions } = await import("../site-actions.js");
export const { AssistantMount } = await import("../site.js");

export async function load() {
  const config = JSON.parse(await readFile(new URL(`../${NETWORK_NAME}.network.json`, import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../agent-manifest.json", import.meta.url), "utf8"));
  return { config, manifest, network: new AgentNetwork(config, NETWORK_NAME) };
}

export const scope = () => ({ base: BASE, network: NETWORK_NAME });

export async function registry() {
  const actions = new ActionRegistry();
  await registerActions({ register: actions.register.bind(actions, scope()) });
  return actions;
}

export function context(loaded, actions, model, confirm, agentName = loaded.network.findFrontMan()) {
  return {
    network: loaded.network,
    manifest: loaded.manifest,
    actions,
    baseOrigin: BASE,
    displayOrigin: new URL(BASE).host,
    trace: new TraceBus(),
    isTop: true,
    frontMan: loaded.network.findFrontMan(),
    history: [],
    llm: model,
    confirmWebsiteActions: confirm,
    agentName,
  };
}

export async function tool(loaded, ctx, name, agent = loaded.network.findFrontMan()) {
  const table = await buildToolTable(ctx, loaded.network.getAgentSpec(agent), [], null);
  return table.toolByName.get(`website_${name}`);
}

export const approve = async () => true;
export const decline = async () => false;

/** Run the page's read action directly and return its result. */
export async function readState(actions) {
  const entry = actions.catalog(scope()).find((item) => item.name === "get_warung_state");
  const plan = actions.prepare({ kind: "action", action: entry.ref, arguments: {} });
  return (await actions.execute(plan, approve, "test-read"))[0].result;
}

/** Empty the basket and the confirmation panel, so the next test starts clean. */
export function resetPage() {
  for (const line of App.page.basketItems()) {
    App.page.changeQty(line.id, -line.qty);
  }
  document.getElementById("confirmation").hidden = true;
  App.page.lastReceipt = null;
  opened.length = 0;
}
