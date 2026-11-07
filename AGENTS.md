# AGENTS.md

For anyone working on this repository, people or AI agents. The README says what Network X-Ray is for visitors.
This file covers how to work on it. The technical reasons behind the design are in [docs/design.md](docs/design.md).
1ms.dog's operating notes are in the private repository 1ms-shell.

## What this is

Network X-Ray (网络透视, check.1ms.dog) is a static page on a Cloudflare Worker. It runs eight other 1ms.dog tools
in frames, in three phases. Each tool measures and shows its own result. The page then collects the results the
tools post back and grades them into one report, with a link and a card to share. **No measurement code lives here.**
A number in the report that looks wrong is almost always the tool's number: check the tool first.

## Layout

| Path | What it is |
|---|---|
| `src/tools.mjs` | The tools, the phases, the five sections and their weights, the tools' names in 10 languages, the development origins |
| `src/report.mjs` | The scores, the section and overall grades, and the cross-tool findings. Pure functions, unit-tested |
| `src/share.mjs` | The report in a link (`/<lang>/r/<summary>#<full>`) and back |
| `src/region.mjs` | Region names and flags. TW has a fixed name in every language and the `cn` flag (see the decisions) |
| `src/app.js` | The page: the runner, the message handling, the report, the share card. Bundled by esbuild |
| `src/worker.js` | Preview titles and images for `/r/<summary>`. Anything else gets a bare 404 |
| `src/i18n/*.mjs` | Every visible string in 10 languages: en, zh-CN, zh-TW, ja, ko, es, fr, de, pt, ru |
| `src/page.html`, `src/*.css` | The page template and its styles |
| `scripts/build.mjs` | Builds `public/`: the pages per language, hashed assets, `_headers` (CSP with the tools' hosts as `frame-src`), sitemap, robots.txt, llms.txt |
| `scripts/assets.mjs` | The link preview images in `public/og/`. Commit its output |
| `public/assets/share/` | The shared 1ms.dog share dialog, copied **verbatim** from 1ms-shell. Don't edit it here |
| `test/fixtures/` | One real result message per tool, as the tools post it. `?mock=1` plays these back |

`public/` is generated, but it is committed. The tests fail when it is out of date with `src/`.

## Run it locally

```bash
npm install
npm run build        # writes public/
npm run dev          # wrangler dev on http://localhost:8797
```

- `http://localhost:8797/zh-cn/?mock=1` runs the whole report from `test/fixtures/` without framing any tool.
  Use it for the report, the findings, the share link and the card.
- A real run (`?start=1`) does not work from localhost. The tools only let the checkup's deployed origin frame
  them (`frame-ancestors`), so every tool ends as "stopped". To test against real tools, use the deployed site.
- A shared report can be built in Node from the fixtures with `encodeSummary`, `summaryOf` and `encodeFull`
  (`src/share.mjs`), using `overall` and `keyStats` (`src/report.mjs`). Opening that link on the local server or
  the live site is the quickest way to see a finding that your own connection doesn't produce, such as a tunnel
  or UDP loss. Change the facts in the fixtures first.

## Test

`npm test` runs `build.mjs --check` (is `public/` up to date) and then every `test/*.test.mjs`. It takes about a
second, so run all of it. The table says which file covers what, so you know where to add a test:

| You changed | Test file |
|---|---|
| Scores, grades, cross-tool findings (`src/report.mjs`) | `test/report.test.mjs` |
| The link format (`src/share.mjs`) | `test/share.test.mjs` |
| A string, or a key the page uses | `test/strings.test.mjs`. Every language needs every key with the same `{placeholders}`, and the new key goes in its list of keys the page uses |
| Region names (`src/region.mjs`) | `test/region.test.mjs`. Nothing else in `src/` may name Taiwan or call `Intl.DisplayNames` for regions itself |
| The build, headers, CSP, page markup, the share component copy | `test/site.test.mjs`. It also fails if any served script contains a regex lookbehind |

Test by hand as well:

- **Anything visible:** look at it on a phone width (375 px). There must be no horizontal scroll, no text under
  12 px, no field under 16 px, and links on touch screens at least 32 px tall. Check Russian and German, which
  wrap the most.
- **The share card:** open it in en, de, ru and fr, using the longest real result. `window.__msShareClips` must
  stay empty: the card is not allowed to cut a word off with "…".
- **Strings:** French uses a no-break space before `:` `;` `?` `!`. Country names come from `Intl.DisplayNames`
  in the nominative form, so write the country in parentheses or after a colon, never as "in {cc}".

## Deploy

`npx wrangler deploy` uploads `public/` and the Worker. With Cloudflare Workers Builds connected to the
repository, every push to `main` runs `npm ci && npm test` and then `npx wrangler deploy`, and the change is live
30–90 seconds later. To confirm a deploy, compare the hash in `public/assets/app.*.js` with the one
`https://<your-domain>/zh-cn/` references.

`wrangler.toml` binds no domain. Bind `<your-domain>` to the Worker in the Cloudflare dashboard, then build with
`SITE_URL=https://<your-domain> FRAME_SRC="https://<tools-domain> https://*.<tools-domain>" npm run build`. Whatever
sits in front of the page has to inject the `<meta name="<id>">` tags for the tools. The tools themselves have to
implement the embed protocol and allow `<your-domain>` to frame them.

## What it depends on

The page reads each tool's address from a `<meta name="<id>" content="https://…">` tag that the shell injects.
Never hard-code a domain. Without the tag, a tool is marked unavailable. On localhost, the addresses in
`DEFAULT_ORIGINS` (`src/tools.mjs`) are used instead.

| Tool id | What the report uses |
|---|---|
| `who` | Identity and privacy facts: time zone and language mismatches, WebRTC leak, DNS country, data center IP, tunnel guess from the TCP MSS |
| `ipqs` | IP score, grade, type (hosting, residential, …), country |
| `egress` | Exits, leaks, split routing, the country AI services see |
| `ipv6` | IPv6 score, path MTU, PMTU black hole |
| `dns` | The fastest resolver, and the visitor's resolver country as the authoritative DNS saw it |
| `unlock` | Services that work, per service and country |
| `home` (1ms.dog) | Latency to common services |
| `speed` | Download, upload, bufferbloat, UDP loss, QUIC |
| `lag` | Not framed. The packet-loss and stall findings link to it |

**The embed protocol.** Each tool is framed with `?embed=checkup` and posts `progress`, `size`, `result` and
`error` messages to the checkup's origin only. The page accepts messages only from frames it opened, and only from each
tool's own origin. A `result` carries `grade`, `score`, `headline`, `stats`, `findings`, `path` and `facts`. The
`facts` keys are fixed per tool: **every key may be missing, and the report must still work without it.** The
authoritative description of the protocol is `docs/checkup.md` in 1ms-shell. The keys this page reads are the ones
in `src/report.mjs`.

**The share dialog** (`public/assets/share/`) is versioned in 1ms-shell. Update it by copying the files over
unchanged and bumping `?v=` in both imports in `src/app.js`.

## Rules that are easy to break

- **No regex lookbehind** (`(?<=`, `(?<!`) in anything served. Safari before 16.4 then fails to parse the whole
  script. The build refuses it.
- **No IP address** in a shared link, the share card or a preview image. Facts carry countries and numbers only.
- **Shared reports are not indexed. The language pages are.** A shared report opened in another language keeps
  its path: `/r/…` goes to `/<lang>/r/…`.
- A country shown from the dns tool's resolver data needs the DB-IP credit next to it (CC BY 4.0). The page adds
  it.
- Finding parameters that are two-letter codes are shown as country names. Anything else (an MTU, a percentage)
  is shown as it is.
