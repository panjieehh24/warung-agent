# Warung Agent — design

Open Agentic Web Challenge entry. Status: design, 19 Nov 2026. Build starts 8 Dec 2026.

## The problem

Indonesia has about 65 million micro-businesses (UMKM). Most food sellers (warung, home
caterers, kue sellers) take orders through WhatsApp and Instagram and have no website. The
open agentic web promises that "businesses can make their services discoverable to any
agent", but a warung owner cannot write an agent manifest, a HOCON network and a runtime
bundle, and cannot pay for a server or for LLM calls.

## The product

Three things, one story:

1. **Builder** — "I sell food." The owner pastes the menu they already send on WhatsApp,
   adds their shop name, hours, area and WhatsApp number, checks the preview and downloads
   a zip. The zip is a complete, conforming agentic website for their warung. They drag it
   onto a free static host. Cost to the owner: zero. Visitors pay for their own model calls.
2. **Warung site** (what the Builder makes) — a mobile menu page with an assistant. Buyers
   ask "what's vegetarian and under Rp20.000?", build a basket, and order. Ordering opens
   WhatsApp with the order pre-filled to the shop's number, after the runtime's
   confirmation. That is how warung already take orders, so no backend is needed.
3. **Pasar** — "I'm hungry." A market site whose agents find food across several warung
   sites on other origins, compare them, and hand the order to the chosen warung. Each
   warung's agents run in the buyer's browser on the buyer's key.

A developer door, **the warung template**, is the open-source kit behind the Builder. It is
the shared community tool that the Impact criterion rewards.

### Why it is non-obvious

- An agentic site whose job is to produce other agentic sites, entirely in the browser.
- It brings the people the agentic web is supposed to include, but who are least able to
  build for it, onto the web as callable peers in about a minute.
- The order still ends in the owner's own WhatsApp. The web adds agent reach without
  adding a platform that takes a cut or owns the customer.

### Out of scope

Payments, delivery, live order tracking, stock levels, menu photos or vision models, user
accounts, any server, an automatic warung registry, and coded-tool bundles.

## Sites and origins

| Site | Host (origin) | Network | Role |
| --- | --- | --- | --- |
| Builder + landing | GitHub Pages, `https://<user>.github.io/warung-agent/` | `warung_builder` | Main submission URL |
| Pasar | same origin, `/warung-agent/pasar/` | `pasar` | Caller of peer networks |
| Demo warung 1 and 2 | Cloudflare Pages, `https://<project>.pages.dev/<shop>/` | `warung` | Peers on a second origin, made with the Builder |

Each site has its own folder with its own `agent-manifest.json`, network JSON,
`links.json`, `runtime/`, `bridge/` and `_headers`. GitHub Pages already sends
`Access-Control-Allow-Origin: *` (checked 19 Nov 2026). Cloudflare Pages reads `_headers`.
The demo warungs must sit on a different origin from Pasar. Every project site on one
GitHub user shares the single origin `<user>.github.io`.

## Agent networks

All networks are written in HOCON and built to `.network.json` with the agentify skill's
`build_network.mjs`. Grounding follows the skill's rules: facts come only from `website_*`
tool results, with no `demo_mode` and no invented prices.

### Rule for every agent-callable action

The runtime shows its confirmation dialog only for `effect: "irreversible"`. A model-called
`effect: "write"` runs with no dialog, which spec §3.1 does not allow. So **every action an
agent can call is either `read` or `irreversible`.** The page's own buttons (basket, form
fields, Download) are for people only and are not agent tools.

### `warung` (fixed; identical for every warung)

- `warung_assistant` (front, CRUSE): greets the buyer, answers from the menu, and hands
  ordering to `order_taker`.
- `order_taker`: turns "2 nasi goreng, 1 es teh, pickup" into an order and sends it.
- Page actions (`site-actions.js`, data from `warung.json`):
  - `get_warung_state` (read): shop, hours, area, menu, and the page's basket.
  - `send_order_whatsapp` (irreversible): input `items[{id, qty}]`, `fulfilment`
    (`pickup` | `delivery`) and an optional `note` (max 120 characters, no personal
    details). The review dialog shows the items, prices, total, fulfilment and the shop's
    WhatsApp number. On confirm it opens `https://wa.me/<number>?text=<message>` and shows
    the same link on the page in case a popup is blocked.
- Bridge, so other sites can use the warung:
  - `get_warung_state` shared with `callerOrigins: "*"` (the menu is public; no basket).
  - `place_order` write window (`effect: "irreversible"`, `confirmsInWindow: true`), with
    callers set to the Pasar origin only. The same input as `send_order_whatsapp`. The
    window shows the order summary, a "Send on WhatsApp" button and "Don't order".
- No name, phone or address is ever collected. WhatsApp already shows the shop who is
  writing, and the shop asks for the address in chat, as warungs do today. Delivery fees
  are "confirmed by the shop in chat".
- Honest outcome: the receipt is `{ok: true, order_code, total, handed_to: "whatsapp",
  confirmed: false}`, and the assistant says the shop confirms in WhatsApp. This follows
  spec §3.1, which says to tell a returned response apart from a verified business outcome.
- Order message (Indonesian, since it goes to the owner):
  `Halo <shop>, saya mau pesan (kode <WA-XXXX>):` then one `- <qty>x <name> — Rp<subtotal>`
  line per item, `Total: Rp<total>`, `Ambil sendiri` or `Minta diantar (ongkir dikonfirmasi
  di chat)`, the optional `Catatan: <note>`, and `(dipesan lewat Warung Agent)`.

The generator changes no network text. It writes `warung.json` plus the manifest's
`brand`, `description`, `sample_queries` and `theme.primary`.

### `warung.json` (the only per-shop file)

```json
{
  "version": 1,
  "shop": {
    "name": "Warung Bu Sri",
    "tagline": "Masakan rumahan Jawa sejak 1998",
    "area": "Kemang, Jakarta Selatan",
    "hours": "Senin–Sabtu 07.00–15.00",
    "whatsapp": "6281234567890",
    "pickup": true,
    "delivery": true
  },
  "theme": { "primary": "#9a3412" },
  "menu": [
    {
      "id": "nasi-goreng-kampung",
      "name": "Nasi Goreng Kampung",
      "category": "Makanan",
      "price": 15000,
      "description": "Nasi goreng dengan teri dan telur ceplok",
      "tags": ["pedas", "halal"],
      "available": true
    }
  ]
}
```

Prices are whole rupiah. `whatsapp` holds digits only, in the form `62` followed by 8–13
digits. `id` is a slug and unique. `tags` is free text in the owner's words, such as
`vegetarian`, `pedas` or `halal`.

### `pasar`

- `pasar_guide` (front, CRUSE): understands the craving, budget and area, and shows the
  buyer one comparison table.
- `market_scout`: reads the warung list, asks the 1–3 warungs that fit, and returns their
  matching items and prices. For an order, it asks the chosen warung's `place_order`,
  which opens that warung's own window.
- Site action `list_warungs` (read, `warungs.json`): name, area, food types, network URL.
- Peer tools: each demo warung's network URL, listed in `tools`, `link_labels`,
  `allowed_peers` and `links.json`, with `peer_policy.mode: "closed"`.
- Rule: requests to warungs carry only food, quantity and area. They never include the
  buyer's name, phone or address.
- Runtime limits fit: at most 4 partner calls and 1 per network per message, so 2–3
  warungs per question.

### `warung_builder`

- `builder_guide` (front): walks the owner through the steps in Bahasa Indonesia or English.
- `menu_reader`: turns pasted WhatsApp menu text ("Nasi goreng 15rb, es teh 5rb…") into
  menu items and asks about anything unclear.
- Site actions:
  - `get_builder_state` (read): the form's shop details, menu and validation problems.
  - `fill_shop_details` (irreversible, dialog): replaces the shop fields.
  - `fill_menu` (irreversible, dialog): replaces the menu table. The dialog lists every
    item and price, so the owner checks the model's reading before it lands.
- The owner downloads the zip with the page's own **Download** button; it's not an agent
  tool. Before zipping, code checks that the WhatsApp number has the form `62…`, that
  prices are whole rupiah, and that every item has a name. Problems are shown next to the
  fields.
- The form works without any model. The agents only save typing.

## Repo layout

```
site/                 → GitHub Pages root (main origin)
  index.html            landing + Builder (network warung_builder)
  runtime/              vendored runtime
  pasar/                Pasar (network pasar), with its own runtime/ copy
  kit/warung/           the warung template, complete, with its own runtime/ and files.json
demo/                 → generated by scripts/make-demo.mjs; deployed to the warung origin
  bu-sri/  pak-budi/    template + one warung.json each
data/demo/            the demo warungs' warung.json files
vendor/agentify-website/  pinned skill: runtime, build and check scripts, templates
scripts/              make-demo, set-origins, serve-all
```

## Origins

| Name | Local | Live |
| --- | --- | --- |
| main (Builder, Pasar) | `http://localhost:8080` | `https://<github-user>.github.io` (repo path `/warung-agent/`) |
| warungs (demo) | `http://127.0.0.1:8081` | `https://warung-agent-demo.pages.dev` |

Locally, the two origins use different host names, not just different ports. The runtime
keeps the key in a cookie on loopback hosts, and a cookie on `localhost` reaches every
port. `serve_site.mjs --log` records whether any request to the warung origin carried an
`Authorization` header. That's our proof for the spec §6 "peer never gets the key" check.

Absolute URLs appear in only four places: Pasar's peer tools, `link_labels` and
`allowed_peers`; `warungs.json`; and each warung's `place_order` callers. `origins.json`
holds the current pair, and `scripts/set-origins.mjs` swaps them and rebuilds.

## Inference and keys

- Default router in every manifest: hosted Otari, model `alibaba/qwen3.8-flash`, the same
  as the official examples.
- BYOK panel from the runtime, with **Connect with OpenRouter** shown first so judges can
  sign in without pasting a key. The key stays in the buyer's browser and goes only to the
  chosen router (spec §4).
- A warung or Pasar peer inherits the caller's router. The warung never sees the key.

## How we meet the binding spec (commit `fd872b9`, Profile 0.2)

| Spec §6 check | How |
| --- | --- |
| Two-agent network and manifest on HTTPS | Every network has 2 agents. GitHub and Cloudflare Pages serve over HTTPS |
| Runs on the default router; BYOK path | Otari default; OpenRouter Connect or a pasted key |
| Internal agent plus a grounded capability | Front agent delegates; `website_*` site actions read `warung.json` |
| Load an exact named network from a 2nd origin after approval | Pasar loads `<pages.dev>/<shop>/warung` after the consent card |
| Peer never gets the key or changes the router | Runtime behaviour. Screenshot of DevTools: requests to the warung origin are plain GETs with no `Authorization` |
| No private context at peer | Pasar sends no sly_data, and buyer details are typed only on the warung's origin |
| Visible errors: invalid network, cycle, over budget, denied origin | Runtime behaviour. Checked once by hand and listed in the README with how to reproduce |
| CORS on public files | GitHub Pages default; `_headers` on Cloudflare |

## Stack

- Runtime: `agentic-web/skills/agentify-website/runtime/`, copied unchanged and pinned to
  one commit (noted in `RUNTIME_VERSION`).
- Plain HTML, CSS and ES modules with no framework and no build step beyond
  `build_network.mjs`.
- One vendored library: JSZip (MIT) for the Builder's zip.
- Tests: the skill's Node test harness (`templates/tests/`, scripted model) plus
  `check_partner.mjs` against the live URLs.

## Risks

| Risk | Plan |
| --- | --- |
| Runtime changes weekly; bridge writes are new (18 Nov) | Pin one commit. Re-check upstream once on 8 Dec before copying |
| Judges have no key | OpenRouter Connect first; video shows the flow; README gives a 30-second path |
| A small model misreads menus or routes badly | Code validates every action; test with qwen3.8-flash and one OpenRouter free model |
| Popup or WhatsApp deep link fails on some phones or desktops | Test on Android Chrome and desktop Chrome; fall back to a copyable order text |
| Scope creep | Out-of-scope list above; the 21 Dec milestone must be a conforming site first |
