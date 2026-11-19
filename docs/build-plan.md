# Warung Agent — build plan

Design: [design.md](design.md). Deadline: **Mon 11 Jan 2027, 16:00 UTC (23:00 WIB)**.
Our target: submitted by **Sun 10 Jan**, one day early.

## Status (20 Nov 2026)

The user lifted the "One Cut first" rule on 19 Nov, and Phases 0–3 were built early.

- **Done:**
  - **Sites:** the warung kit, 2 demo warungs, Pasar and the Builder (zip download with a `<slug>/` layout).
  - **Scripts:** `build-all`, `serve-all` (our own dev server, with CORS and an Authorization log) and `set-origins`.
  - **Deploy:** the Pages workflow.
  - **Security:** reviewed, with all 11 findings fixed. That included one HIGH: the bridge order never returned, because `window.open` with `noopener` returns `null`.
  - **Checks:** `npm test` passes 110 of 110 (scripted model), and `check_partner.mjs` is OK for both warungs.
  - **Browser smoke test:** all four pages load in Chrome. The warung page's own WhatsApp order works, and no request to the warung origin carried `Authorization`.
- **Not yet verified:**
  - any run with a real LLM: agent answers, consent cards, Pasar → warung calls, the order window opened from Pasar;
  - the Builder zip uploaded to a real host;
  - mobile layout.
- **Blocked on the user:**
  - GitHub CLI login and git name/email (no commits yet);
  - a Cloudflare account;
  - an LLM key for live testing;
  - real warung data.

## Next

1. You: unblock the four items above.
2. **Live check, with a key:**
   - run every network's sample queries;
   - run Pasar → both warungs → an order through the warung window;
   - check the consent card text;
   - check `requests-warungs.jsonl` shows `authorization: false`.
3. **Deploy:**
   - run `set-origins` with the live origins;
   - upload `demo/` to Cloudflare Pages;
   - push to GitHub, which runs the Pages workflow;
   - run `check_partner.mjs` against the https URLs.
4. Phase 4 polish and Phase 5 submission as below. Set the safety milestone (a conforming entry live and saved as a Devpost draft) as soon as step 3 is done.

## Original plan

Rule until 8 Dec 2026 (since lifted): One Cut comes first. Only the "Before 8 Dec" list happens here.

## Before 8 Dec (small, no build)

- [ ] Install the GitHub CLI and log in: `brew install gh`, then `gh auth login`.
- [ ] Set your git name and email (`git config --global user.name …` and `user.email …`).
- [ ] Create a free Cloudflare account (for Pages).
- [ ] Get an LLM key for testing: Otari credits if you have the voucher, or an OpenRouter
      account. Never paste the key into a chat or the repo.
- [ ] Ask 1–2 real warung owners (family or friends) for permission, their menu text,
      hours, area and the WhatsApp number that takes orders. Fallback: your own number as a
      test shop.

## Phase 0 — setup (8–9 Dec)

- Create the public repo `warung-agent`, MIT licence, with `docs/` moved in. Enable GitHub Pages.
- Re-pull agentic-web. Read its log since `45dedb1` for runtime or bridge changes, then
  copy `skills/agentify-website/runtime/` and write the commit to `RUNTIME_VERSION`.
- Check once that the binding spec (`fd872b9`) still says what design.md assumes.
- Layout:

  ```
  site/            → GitHub Pages root: landing + Builder (network warung_builder)
  site/pasar/      → Pasar (network pasar)
  template/warung/ → the warung site; the Builder zips this folder plus warung.json
  demo/            → the two generated demo warungs, deployed to Cloudflare Pages
  tests/
  ```

## Phase 1 — warung template (9–14 Dec)

Build one warung by hand first. The Builder only copies this folder.

- `index.html` and `styles.css`: a mobile menu from `warung.json`, a basket and an order
  button. It must work with no assistant.
- `warung.hocon` → `warung.network.json` with 2 agents, built with `build_network.mjs`.
- `site-actions.js`: `get_warung_state`, `set_basket`, `send_order_whatsapp` (wa.me link,
  order code, receipt with `confirmed: false`).
- `bridge/bridge-actions.js`: `get_warung_state` shared with `"*"`. `bridge/place-order.js`
  is the write window, with callers set to the Pasar origin only.
- `agent-manifest.json`, `links.json`, `_headers`, and the `site.js` mount.
- Tests: the skill's harness (scripted model) for every action, including refusals and
  invalid prices.
- **Done when:** locally, a real model answers menu questions, edits the basket, and opens
  WhatsApp with the right text.

## Phase 2 — Pasar and the second origin (15–21 Dec)

- Make demo warungs 1 and 2 by copying the template plus two `warung.json` files. Deploy
  them to Cloudflare Pages.
- Check the live headers with `curl`, and run `check_partner.mjs` on both network URLs.
- `site/pasar/`: `pasar.hocon` (2 agents), the `list_warungs` action and `warungs.json`.
  Each peer goes in `tools`, `link_labels`, `allowed_peers` and `links.json`.
- Deploy `site/` to GitHub Pages.
- Run the spec §6 checklist from design.md on the live URLs, by hand. Write each result
  and how to reproduce it in the README. Take the DevTools screenshot that shows no key
  goes to the warung origin.
- **Milestone (21 Dec): a conforming entry is live.** Save a Devpost draft with the URL.
  Everything after this improves the score. If time runs out, this is what gets submitted.

## Phase 3 — Builder (22–28 Dec; holiday week, lighter)

- A form for shop details plus a menu table; preview shows the warung page in an iframe.
- `warung_builder.hocon` (2 agents) with the `get_builder_state`, `set_shop_details`,
  `set_menu_items` and `download_site_zip` actions.
- Zip: fetch the `template/warung/` files from our own origin, add `warung.json` and the
  patched manifest, and zip with vendored JSZip.
- A "Put it online" page with the drag-and-drop steps for Cloudflare Pages, plus a "join
  Pasar" pull-request link.
- Tests: menu-text parsing on 5 real WhatsApp menu samples; zip contents; validation
  refusals.
- **Done when:** a demo warung re-made with the Builder and uploaded works with Pasar,
  with no hand edits.

## Phase 4 — polish (29 Dec – 4 Jan)

- Swap in the real warung data. Make the landing page show three doors: I sell food, I'm
  hungry, I'm a developer.
- Mobile pass on Android Chrome. Indonesian-first copy on the warung pages; English on the
  landing page for judges.
- For English-only judges:
  - add bilingual labels to the warung page's buttons and states (for example
    "Pesan via WhatsApp · Order on WhatsApp" and "Habis · Sold out"), and update the
    tests that assert them;
  - leave the menu and the WhatsApp message in Indonesian;
  - add one line defining "warung" (a small family food stall) on the landing page and
    in the video.

  The rules require only the video, description and testing instructions in English.
- Make "Connect with OpenRouter" the first thing a judge sees in settings. Test on a fresh
  profile with no stored key.
- README: what it is, a 30-second judge path, the spec checklist, and how to make your own
  warung.
- Open a PR to agentic-web adding Warung Agent and Pasar to `docs/agentic_websites.md`.

## Phase 5 — submission (5–10 Jan)

- Freeze features on **7 Jan**. Only fix bugs after that.
- Screenshots: Builder, warung chat, Pasar comparison table, consent card, WhatsApp
  hand-off, and DevTools with no key.
- Video, under 2:00, you on camera or voice, not AI-generated:
  1. 0:00–0:15 — the problem: warung live on WhatsApp, invisible to agents.
  2. 0:15–0:45 — the Builder: paste the menu, download, upload. The site is live.
  3. 0:45–1:25 — Pasar: "cheap spicy lunch near Kemang" → consent card → two warungs
     compared → order → WhatsApp opens on the owner's phone.
  4. 1:25–1:50 — why it's safe: the buyer's key and address never reach other sites; it
     costs the owner nothing.
  5. 1:50–2:00 — open-source template, URL.
- Devpost text description; Otari email and one Otari problem if we used Otari.
- Submit on **10 Jan**. On 11 Jan, re-check that all live URLs load.

## Definition of done

- Live HTTPS URLs for the Builder, Pasar and 2 warungs on a second origin; all §6 checks
  pass by hand.
- Tests pass: `node --test tests/`.
- A fresh browser with only OpenRouter Connect can go from question to WhatsApp in under 2
  minutes.
- Public repo, MIT licence, README, video and screenshots submitted.
