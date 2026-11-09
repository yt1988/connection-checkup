// What the "Report a problem" dialog gets about a run (1ms-shell docs/tool-contract.md, "报告问题"): one sentence,
// the run as JSON small enough for the dialog (IPs masked) and the readings as one-tap picks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOOLS, SECTIONS } from "../src/tools.mjs";
import { overall } from "../src/report.mjs";
import { LIMITS, maskIps, msReport } from "../src/msreport.mjs";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");
const bytes = s => new TextEncoder().encode(s).length;
const LANGS = ["en", "zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt", "ru"];
const size = d => bytes(JSON.stringify(d, null, 1));   // the dialog's own 6 KB check counts the indented JSON

async function fixtures() {
  const R = {};
  for (const id of TOOLS) R[id] = JSON.parse(await read("test/fixtures/" + id + ".json"));
  return R;
}
async function tr(lang) {
  const d = (await import(`../src/i18n/${lang}.mjs`)).default;
  return (k, v) => { let s = d[k]; if (v) for (const x of Object.keys(v)) s = s.split("{" + x + "}").join(v[x]); return s; };
}
const report = (R, lang = "zh-CN") => ({ v: 1, ts: 1710000000000, lang, tools: R, missing: {} });

test("the dialog gets a sentence, the run as JSON, and the readings", async () => {
  const R = await fixtures(), rep = report(R), ov = overall(R);
  const out = msReport(rep, ov, { t: await tr("zh-CN"), lang: "zh-CN", page: "/zh-cn/" });
  assert.ok(out.summary.includes("网络透视"), out.summary);
  assert.ok(out.summary.length <= LIMITS.summary && bytes(out.summary) <= 590, "summary " + bytes(out.summary) + " bytes");
  assert.deepEqual(Object.keys(out.data.tools), TOOLS);
  for (const s of SECTIONS) assert.match(String(out.data.sections[s.id]), /^(A\+|A|B|C|D|F)$/, s.id);
  assert.ok(out.data.cross.length >= 1, "the cross-tool findings are part of the report's judgment");
  assert.ok(out.data.tools.who.f, "the findings' text is there");
  assert.ok(out.data.tools.who.d && out.data.tools.who.s, "the facts and the stats are there");
  assert.ok(size(out.data) <= LIMITS.data, "the dialog's 6 KB: " + size(out.data));
  assert.ok(out.picks.length > 0 && out.picks.length <= LIMITS.picks);
  for (const p of out.picks) assert.ok(p.length <= LIMITS.pick, p);
});

test("the summary stays inside the dialog's limits in every language", async () => {
  const R = await fixtures(), ov = overall(R);
  for (const lang of LANGS) {
    const out = msReport(report(R, lang), ov, { t: await tr(lang), lang, page: "/" });
    assert.ok(out.summary.length <= LIMITS.summary, lang + ": " + out.summary.length + " characters");
    assert.ok(bytes(out.summary) <= 590, lang + ": " + bytes(out.summary) + " bytes");
  }
});

test("long tool text is cut back rather than over the 6 KB", async () => {
  const R = await fixtures();
  for (const id of TOOLS) R[id].findings = R[id].findings.map(f => ({ ...f, text: "很长的发现文本".repeat(40) }));
  R.who.headline = "很长的判定句".repeat(30);
  const out = msReport(report(R), overall(R), { t: await tr("zh-CN"), lang: "zh-CN", page: "/zh-cn/" });
  assert.ok(size(out.data) <= LIMITS.data, size(out.data) + " bytes");
  for (const id of TOOLS) assert.ok(out.data.tools[id].st, id + " kept its status");
});

test("no full IP address reaches the dialog", async () => {
  const R = await fixtures();
  R.who.facts = { ...R.who.facts, address: "198.51.100.7", v6: "2001:db8:85a3::8a2e:370:7334" };
  R.dns.findings = [{ level: "ok", text: "普通 DNS 最快：AliDNS（223.5.5.5, 223.6.6.6）。" }, ...R.dns.findings];
  const json = JSON.stringify(msReport(report(R), overall(R), { t: await tr("zh-CN"), lang: "zh-CN", page: "/zh-cn/" }).data);
  assert.doesNotMatch(json, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "a full IPv4");
  assert.doesNotMatch(json, /(?:[0-9a-f]{1,4}:){3,}[0-9a-f]{1,4}/i, "a full IPv6");
  // a full address is cut to its first two parts, in the tools' own masking style; a clock time is not an address
  assert.equal(maskIps("203.0.113.9"), "203.0.*.*");
  assert.equal(maskIps("2001:db8:85a3::8a2e:370:7334"), "2001:db8:…");
  assert.equal(maskIps("203.0.•.•"), "203.0.•.•");
  assert.equal(maskIps("12:34:56"), "12:34:56");
});

test("the picks are the readings, in the visitor's language", async () => {
  const R = await fixtures();
  const out = msReport(report(R, "en"), overall(R), { t: await tr("en"), lang: "en", page: "/" });
  assert.ok(out.picks[0].startsWith("Identity & privacy: "), out.picks[0]);
  assert.ok(out.picks.includes("Services that work: 24 / 33"), out.picks.join(" | "));
  assert.ok(out.picks.includes("Download: 2.1 Mbps"), out.picks.join(" | "));
  assert.ok(out.picks.some(p => p.startsWith("DNS Test: ")), out.picks.join(" | "));
});

test("nothing before a report; a summary-only shared link has no data to reproduce", async () => {
  const t = await tr("en");
  assert.equal(msReport(null, null, { t, lang: "en", page: "/" }), null);
  const ov = { grade: "B", sections: Object.fromEntries(SECTIONS.map(s => [s.id, "B"])) };
  const out = msReport(null, ov, { t, lang: "en", page: "/r/1~x", shared: true, ts: 1710000000000 });
  assert.deepEqual(out.picks, []);
  assert.equal(out.data.partial, true);
  assert.equal(out.data.overall.grade, "B");
  assert.ok(out.summary.includes("summary"), out.summary);
});
