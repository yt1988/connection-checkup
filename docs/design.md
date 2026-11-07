# Design notes

The technical reasons behind Network X-Ray: why the code is the way it is, and what was measured to get there.
Where the code says it plainly, this only gives the reason.

## Shape

- **Embed the tools, don't re-measure.** Each tool runs its own page in a frame, so the numbers in the report are
  the ones the tool shows. Copying measurement code here would let the two drift apart.
- **Three phases.** The speed test fills the line, so it runs alone and last. Everything sensitive to latency
  runs before it.
- **Fail fast on ad blockers.** uBlock, AdGuard and similar extensions block the tools' probes in bulk, and that
  is the most common way a run fails. The run stops early with an explanation and a "retry with the blocker off"
  button, instead of waiting out every 90-second phase.
- **A run starts on Start.** A full run takes about 90 seconds and includes a speed test, which uses data. A
  checkbox turns on automatic runs, and `?start=1` starts a run from a link.

## The report

- **A tool's own grade wins**, because the tool knows its domain best. The exception is the speed test, whose
  grade only covers bufferbloat, so the report grades speed from the facts.
- **A section that didn't finish counts for nothing**, and the report names it. Averaging in a guess would hide
  that the result is partial.
- **Line and tunnel facts go into the existing sections.** These are UDP loss and QUIC (speed), path MTU and PMTU
  black holes (ipv6), a tunnel guess from the TCP MSS (who), and the resolver's country (dns). Putting them in the
  existing sections keeps the section weights and the summary format unchanged, so old shared links still decode.
  - UDP loss and blocked QUIC count against speed.
  - A black hole counts against IPv6, but only when the ipv6 tool didn't give its own score. That avoids counting
    it twice, because the tool includes an IPv6 black hole in its own score. An IPv4 black hole is only reported,
    not graded.
  - **A tunnel by itself costs nothing.** Using a proxy is not a fault. It only becomes a finding together with a
    data center IP, because that combination is what lets sites spot the proxy.
  - **PPPoE** also shrinks the MTU, but it is the home line, not a tunnel.
  - Phone networks sometimes lower the MSS. That alone never raises a finding, because the tunnel finding also
    needs a data center IP.
- **The Network Diagnosis link** (`lag`) appears on the packet-loss and stall findings only. QUIC blocked, a PMTU
  black hole and a tunnel have nothing on the path to locate.

## Sharing

- **The summary in the path is short and carries the grades**, so the server can write a preview title and pick
  a per-grade image. The full report after `#` never reaches the server.
- **The card loses no words.**
  - The verdict shrinks to 34 px and then wraps, the key numbers wrap, and the section names wrap over two lines.
  - The card grows taller to hold them. It stays 1200 × 630, the preview size, when everything fits on one line
    each.
  - Checked in en, de, ru and fr: `window.__msShareClips` stays empty.
- **The findings stay off the card.** At 1200 × 630 they are too long to stay readable in a chat preview.

## Language and regions

- **Region names** go through `src/region.mjs`. TW has a fixed name in each language and maps to the `cn` flag.
  Every other code, Hong Kong and Macao included, uses `Intl.DisplayNames` and its own flag. A test stops any other
  file from naming regions itself.
- **Country names come from `Intl.DisplayNames` in the nominative form.** So the strings put the country in
  parentheses or after a colon, never in "in {cc}", which would need a case or a preposition the API can't give.
- **The English root keeps the rest of the path** when it sends visitors to their language's folder before the
  first paint. That way a shared English report opens as the same report in the visitor's language. Without
  this, `/r/<summary>` was dropped and the visitor saw an empty checkup.

## Compatibility

- **No regex lookbehind in served scripts.** Safari before 16.4 can't parse it, and one occurrence stops the whole
  page script from loading. esbuild doesn't rewrite regexes for older targets, so the build and a test both check
  for it.
