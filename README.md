# Connection Checkup

**English** · [简体中文](README.zh-CN.md)

How healthy is your connection, all things considered? [Connection Checkup](https://check.1ms.dog) runs eight 1ms.dog network tools in one go, right in your browser, and turns their results into one graded report: who websites think you are, IP quality, which exit each site sees, IPv6, DNS, streaming and AI unlock, latency to common services, and speed. About 90 seconds, one A+ to F grade, one link and one card to share.

**Live:** https://check.1ms.dog

Unlike IPQuality or NodeQuality scripts, which run on a server over SSH and can only test the server's own IP, this measures the connection you are on right now: a home line, a phone, a proxy or an airport node, with the browser's own view of time zone, language and WebRTC.

## How it works

The report page frames each tool's own page with `?embed=checkup` and lets it run as usual; the tool shows its own progress and result in the frame and posts the numbers back with `postMessage`. Nothing is measured twice and no measurement code lives here. The protocol (messages, the `facts` keys each tool provides) is in 1ms-shell's `docs/checkup.md`.

| | |
|---|---|
| **Phase 1** | Who Are You, IP Quality Test, EgressLens, IPv6 Test, DNS Test, in parallel |
| **Phase 2** | Streaming & AI Unlock Check, 1ms.dog service latency, in parallel |
| **Phase 3** | Speed Test, alone, so the bandwidth test doesn't disturb the latency measurements |

Each phase waits for all its tools or 90 seconds. A tool that doesn't answer is marked as not finished and left out of the grade. The page only accepts messages from the frames it opened, from each tool's own origin, in the checkup's format.

### The report

Five sections, each graded A+ to F from its tools' own grades or facts (`src/report.mjs`), weighted into the overall grade: IP quality 25, unlock 20, speed 20, identity and privacy (Who Are You, EgressLens) 20, connectivity (IPv6, DNS, service latency) 15. Sections that didn't finish are left out and named. Each section card: one sentence, two to four numbers, up to four findings, and a link to the tool's full result.

Seven cross-tool findings sit on top: an incomplete disguise (data-center IP with a mismatched time zone), a leaking real IP, split routing (AI and streaming through different countries), AI blocked by the exit's region, DNS in another region than the exit, a congested line (bufferbloat plus high service latency), and IPv6 slowing things down.

### Sharing

The link is `/<lang>/r/<summary>#<full>` (`src/share.mjs`). The summary in the path, under 100 characters, carries the format version, the grades and the key numbers: the Worker reads it to give the link its preview title ("Connection Checkup B · IP quality A · Services available 24/33 · Download 313 Mbps"), description and a per-grade preview image. The full report after the `#` (every tool's result link, headline, numbers, findings and facts, as base64url JSON) never reaches the server; the page rebuilds the whole report from it. A link without it shows the summary and says the details weren't included. The share dialog is the shared 1ms.dog one (`public/assets/share/`, copied verbatim from 1ms-shell); the card shows the overall grade, the five sections and the top findings.

### Where the tools live

The page reads each tool's address from `<meta name="<id>" content="https://…">`, which the 1ms.dog shell injects. Without those metas (a self-hosted copy) the tools are marked unavailable; on localhost the addresses in `src/tools.mjs` stand in. `?mock=1` feeds the page the sample results in `test/fixtures/` instead of framing the tools, which is how the report, the link and the images are developed; `?start=1` starts the checkup as the page opens.

## Files

```
src/tools.mjs       the tools, phases, sections and weights, the tools' names in 10 languages
src/report.mjs      scores, section and overall grades, the cross-tool rules; pure, unit-tested
src/share.mjs       the report in a link (summary + full), and back
src/app.js          the page: the runner, the message handling, the report, the share card
src/worker.js       /r/<summary> previews; a bare 404 for anything else
src/i18n/*.mjs      10 languages
scripts/build.mjs   builds public/ (pages, assets, the mock data, CSP with the tools' hosts as frame-src)
scripts/assets.mjs  link preview images (public/og/: one per language, plus one per language and grade)
test/fixtures/      one result message per tool, as the tools post them
```

## Run and deploy

```bash
npm install
npm run build      # writes public/
npm test           # public/ up to date, contract, strings, report and share unit tests
npm run assets     # the preview images (needs system fonts; commit the output)
npm run dev        # http://localhost:8797  (try /zh-cn/?mock=1)
npx wrangler deploy
```

Static files on a Cloudflare Worker: files are served without running the script (not metered); `src/worker.js` only answers `/r/<summary>` and 404s. On 1ms.dog, pushes to `main` deploy through Workers Builds (`npm ci && npm test`, then `npx wrangler deploy`). `wrangler.toml` binds no domain: on 1ms.dog the shared shell routes `check.1ms.dog` to it. To self-host, bind your domain to the Worker in the Cloudflare dashboard and build with `SITE_URL=https://your.domain FRAME_SRC="https://tools.example https://*.tools.example" npm run build`; the tools you frame must announce themselves with the `<meta name="<id>">` tags and implement the embed protocol.

## License

MIT
