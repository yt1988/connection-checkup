# Decisions

Why Network X-Ray is the way it is. Newest last within each part. Where the code says it plainly, this only gives
the reason.

## Shape of the product

- **Embed the tools, don't re-measure.** Each tool runs its own page in a frame, so the numbers in the report are
  the ones the tool shows. Copying measurement code here would let the two drift apart.
- **Three phases.** The speed test fills the line, so it runs alone and last. Everything sensitive to latency
  runs before it.
- **Fail fast on ad blockers.** uBlock, AdGuard and similar extensions block the tools' probes in bulk, and that
  is the most common way a run fails. The run stops early with an explanation and a "retry with the blocker off"
  button, instead of waiting out every 90-second phase.
- **The checkup does not start by itself by default.** It is heavy (about 90 seconds, plus a speed test), so it
  starts when the visitor presses Start. A checkbox lets the visitor turn on automatic runs, and `?start=1`
  starts it from a link.
- **The name** is Network X-Ray, 网络透视 in Chinese. The other eight languages follow the same meaning and are
  listed in `src/i18n/`.
- **CDN Radar is not in the checkup yet.** It is planned for a second version.

## The report

- Weights: IP quality 25, unlock 20, speed 20, identity and privacy 20, connectivity 15. A section that didn't
  finish counts for nothing, and the report says so.
- A tool's own grade wins, because the tool knows its domain best. The exception is the speed test, whose grade
  only covers bufferbloat, so the report grades speed from the facts.
- **Line and tunnel** (2026-11). These come from measurements made on 1ms.dog's Tokyo server: UDP loss and QUIC
  (speed), path MTU and PMTU black holes (ipv6), a tunnel guess from the TCP MSS (who), and the resolver as the
  authoritative DNS sees it (dns).
  - Where they count: in the existing sections, with no new section and no change to the weights, so old shared
    links still decode.
  - UDP loss and blocked QUIC count against speed.
  - A black hole counts against IPv6, but only when the ipv6 tool didn't give its own score. The tool includes
    an IPv6 black hole in its own score. An IPv4 black hole is only reported, not graded.
  - **A tunnel by itself costs nothing.** Using a proxy is not a fault. It only becomes a finding together with a
    data center IP, because that combination is what lets sites spot the proxy.
  - **PPPoE** also shrinks the MTU, but it is the home line, not a tunnel.
  - Phone networks sometimes lower the MSS. That alone never raises a finding, because the tunnel finding also
    needs a data center IP.
- **Turned down: a traceroute from the Tokyo server back to the visitor's IP.** It would show the return route
  and where loss starts. It was rejected because running a trace toward a visitor's address is hard to explain
  in privacy terms. Don't propose it again.
- **Network Diagnosis (lag) link** (2026-11-07). The packet-loss and stall findings carry a "find where it slows
  down" link to lag, in the page's language. It appears on those two only: QUIC blocked, a PMTU black hole and a
  tunnel have nothing on the path to locate. The style, a pill on its own line under the finding, was chosen by
  the site owner over an inline link.

## Sharing

- The summary in the path is short and carries the grades, so the server can write a preview title and pick a
  per-grade image. The full report after `#` never reaches the server.
- The share dialog and card come from the shared 1ms.dog component, copied unchanged.
- **The card loses no words.** The verdict shrinks to 34 px and then wraps, the key numbers wrap, and the section
  names wrap over two lines. The card grows taller to hold them. It stays 1200 × 630, the preview size, when
  everything fits on one line each.
- The findings stay on the page, not on the card: they are too long to stay readable in a 1200 × 630 preview.

## Language and regions

- Visible text follows 1ms.dog's translation guide: the conclusion, then the reason, then what to do, without
  overstating.
- **Taiwan** is named 中国台湾 / 中國台灣 / Taiwan, China (fixed per language in `src/region.mjs`, never the
  system name) and uses the `cn` flag. This is a site-wide 1ms.dog rule. Hong Kong and Macao keep their system
  names and their own flags. The language code zh-TW is unaffected.
- The English root sends visitors to their language's folder before the first paint and keeps the rest of the
  path. That way a shared English report opens as the same report in the visitor's language.

## Compatibility

- No regex lookbehind in served scripts. Safari before 16.4 can't parse it, and one occurrence breaks the whole
  page script. The build and a test both enforce this.
