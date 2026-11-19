# Warung Agent

Your warung on the agentic web in one minute.

Indonesia's small food sellers take orders on WhatsApp and are invisible to AI agents.
Warung Agent turns a WhatsApp menu into a complete [open agentic website](https://github.com/cognizant-ai-labs/agentic-web)
that any agent can call. It needs no server, costs the owner nothing, and every order
lands in the owner's own WhatsApp.

- **Builder** (`site/`): the owner pastes their menu and downloads a ready site (.zip).
- **Warung site** (`site/kit/warung/`): a menu page whose assistant answers from the real
  menu and sends the order to WhatsApp, after the buyer confirms.
- **Pasar** (`site/pasar/`): a market whose agents ask several warung sites on another
  origin, compare them in one table, and hand the order to the chosen warung's own window.

Design: [docs/design.md](docs/design.md). Plan: [docs/build-plan.md](docs/build-plan.md).

## Try it in 30 seconds (judges)

1. Open the Pasar page, then **⚙ AI model settings** → **Connect with OpenRouter** (no
   key to paste), or paste an [Otari](https://otari.ai) key.
2. Ask: *"Something spicy under Rp20.000 for pickup?"* Approve the two consent cards.
   Each names the warung site that will be asked.
3. Ask to order one item. The warung's own window opens. **Kirim ke WhatsApp** opens
   WhatsApp with the order. The demo shops use placeholder numbers, so WhatsApp says the
   number isn't registered.

## Run locally

Requires Node 22 or newer. There are no npm dependencies.

```shell
npm run build   # build every network, the kit and the demo warungs, then check them
npm test        # all unit and network tests (scripted model, no key needed)
npm run serve   # main site on http://localhost:8080, warungs on http://127.0.0.1:8081
```

The two local origins use different host names on purpose. On loopback hosts the
runtime keeps the key in a cookie, and a `localhost` cookie reaches every port.
`requests-warungs.jsonl` logs every request to the warung origin, with
`authorization: true|false`. It's the evidence that the visitor's key never reaches a
peer site.

## How it meets the spec

Binding spec: [MVP Profile 0.2](https://github.com/cognizant-ai-labs/agentic-web/blob/fd872b9/docs/worldwide_agentic_web_mvp_spec.md),
the version at the start of the submission period. The runtime is the agentify-website
skill's copy of nsDeploy's runtime, pinned in [vendor/VENDORED.md](vendor/VENDORED.md).

| Spec §6 check | Where |
| --- | --- |
| Two-agent network and manifest on HTTPS | each site's `agent-manifest.json` and `*.network.json`; 2 agents each |
| Default router, plus visitor-supplied key | hosted Otari default; OpenRouter Connect or a pasted key in the runtime's settings |
| Internal agent plus a grounded capability | registered site actions (`website_get_warung_state`, `website_list_warungs`, …) |
| Exact named network from a second origin, after consent | Pasar → `<warung origin>/bu-sri/warung` and `/pak-budi/warung` |
| The peer never gets the key or changes the router | `requests-warungs.jsonl` shows `authorization: false` on every request |
| No private context at the peer | Pasar sends no sly_data; requests carry food, quantity and area only |
| Visible errors for an invalid network, a cycle, an over-budget request or a denied origin | runtime limits (4 partner calls and 24 agent calls per message, 5 levels deep, closed `peer_policy`) |

Every action an agent can call is a `read` or an `irreversible` one. The runtime shows
its confirmation dialog only for `irreversible` actions, and spec §3.1 requires showing
the user any write first.

## Deploy

Live now: main site `https://panjieehh24.github.io/warung-agent/`; demo warungs
`https://warung-agent-demo.warung-agent.workers.dev/` (`/bu-sri/`, `/pak-budi/`).

1. Switch the origins and rebuild:

   ```shell
   node scripts/set-origins.mjs --main https://<github-user>.github.io --warungs https://warung-agent-demo.<account>.workers.dev
   ```

2. Upload `demo/` to Cloudflare. New Cloudflare accounts host "Pages" on Workers, so
   `wrangler pages deploy` can't find the project. Use:

   ```shell
   npx wrangler login
   npx wrangler deploy --assets demo --name warung-agent-demo --compatibility-date 2026-11-01
   ```

   `demo/_headers` sets CORS, and Cloudflare applies it. Cloudflare redirects
   `bridge/action-bridge.html` to `bridge/action-bridge`; the runtime follows the redirect
   (`check_partner.mjs` passes). A brand-new `workers.dev` address can take a few minutes
   before HTTPS works.
3. Push to `main`. [.github/workflows/pages.yml](.github/workflows/pages.yml) runs the tests,
   checks the generated files are current, and publishes `site/` to GitHub Pages, which
   sends CORS on every file.
4. `REPO_URL` in `site/config.js` points to this repo; change it if you fork.

`node scripts/set-origins.mjs --local` switches back for local work.

On GitHub Pages the allowed caller origin `https://<user>.github.io` is shared by all of that user's project sites, so any of them could ask a warung's `place_order`. The buyer still has to tap Send in the warung's own window. Use a dedicated GitHub account or org for the main site if that matters.

## A shop owner's own site

The Builder's zip holds `<shop-slug>/…`, a root `_headers` and a redirecting
`index.html`. Uploaded to any static host, the network URL is
`https://<host>/<shop-slug>/warung`. The slug folder matters because the runtime names a
partner tool after the URL path. Two shops both at `/warung` would collide in Pasar.

## Repo notes

- Never edit `vendor/` or any `runtime/` folder. Re-copy from upstream and update
  `vendor/VENDORED.md`.
- Never hand-edit generated files (`*.network.json`, `agent-mcp.json`, `.well-known/`,
  `bridge/action-bridge.html`, `bridge/agent-manifest.json`, `site/kit/warung/files.json`,
  `demo/`). Change the `.hocon` or the manifest and run `npm run build`.
- Knowledge graph (graphify): build it from our own code only, excluding `vendor/`, every
  `runtime/`, `demo/` and `site/lib/`. The runtime is copied several times and would flood
  the graph with same-named functions.

## Licence

Apache-2.0, the same as the vendored runtime.
