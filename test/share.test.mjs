// A report in a link, and back (src/share.mjs); the Worker's preview title (src/worker.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSummary, decodeSummary, encodeFull, decodeFull, sharePath, summaryOf, FORMAT } from "../src/share.mjs";
import { overall, keyStats } from "../src/report.mjs";
import { titleParts } from "../src/worker.js";
import en from "../src/i18n/en.mjs";
import zh from "../src/i18n/zh-CN.mjs";

const S = { ts: 1793595078165, total: "C", sections: { privacy: "F", ipqs: "B", unlock: "B", conn: "A", speed: "F" }, ipqsScore: 73, works: 24, all: 33, down: 2.1, up: 819.3 };

test("the summary round-trips and stays short", () => {
  const code = encodeSummary(S);
  assert.ok(code.length < 100, code);
  assert.ok(code.startsWith(FORMAT + "~"));
  const r = decodeSummary(code);
  assert.equal(r.total, "C"); assert.deepEqual(r.sections, S.sections);
  assert.equal(r.ipqsScore, 73); assert.equal(r.works, 24); assert.equal(r.all, 33); assert.equal(r.down, 2.1); assert.equal(r.up, 819);
  assert.equal(Math.round(r.ts / 1000), Math.round(S.ts / 1000));
});

test("a summary with gaps: sections that didn't run, numbers not measured", () => {
  const r = decodeSummary(encodeSummary({ ts: Date.now(), total: "A+", sections: { ipqs: "A+" } }));
  assert.equal(r.total, "A+"); assert.equal(r.sections.ipqs, "A+"); assert.equal(r.sections.speed, null);
  assert.equal(r.works, null); assert.equal(r.down, null); assert.equal(r.ipqsScore, null);
});

test("what isn't a summary is refused", () => {
  for (const bad of ["", "2~a~A~A~A~A~A~A~1~1-1~1~1", "1~a~A~A~A~A~A~A~1~1-1~1", "1~a~X~A~A~A~A~A~1~1-1~1~1", "1~a~A~A~A~A~A~A~abc~1-1~1~1", "1~~A~A~A~A~A~A~1~1-1~1~1", "x".repeat(200)])
    assert.equal(decodeSummary(bad), null, bad);
});

test("the full report round-trips through the fragment", () => {
  const rep = { v: 1, ts: 1, lang: "zh-CN", tools: { who: { path: "/zh-cn/r/2.x", grade: null, score: null, headline: "7 处可能暴露你", stats: [{ label: "a", value: "b" }], findings: [{ level: "bad", text: "é ü 中" }], facts: { problems: 7 } } }, missing: { speed: "timeout" } };
  const frag = encodeFull(rep);
  assert.match(frag, /^[\w-]+$/);
  assert.deepEqual(decodeFull(frag), rep);
  assert.equal(decodeFull("not base64!"), null);
  assert.equal(decodeFull(encodeFull({ v: 2, tools: {} })), null);
  assert.equal(decodeFull(encodeFull({ v: 1 })), null);
});

test("share paths", () => {
  assert.deepEqual(sharePath("/r/1~a~A~A~A~A~A~A~1~1-1~1~1"), { slug: "", code: "1~a~A~A~A~A~A~A~1~1-1~1~1" });
  assert.deepEqual(sharePath("/zh-cn/r/1~a~A+~~~~~~~~~/"), { slug: "zh-cn", code: "1~a~A+~~~~~~~~~" });
  assert.equal(sharePath("/zh-cn/"), null);
  assert.equal(sharePath("/zh-cn/r/"), null);
  assert.equal(sharePath("/r/a b"), null);
});

test("the summary of a report, and the Worker's preview title", () => {
  const results = { ipqs: { grade: "A", score: 90, facts: {} }, unlock: { facts: { works: 30, total: 33 } }, speed: { facts: { down: 313.4, up: 52 } } };
  const ov = overall(results), keys = keyStats(results);
  const sum = decodeSummary(encodeSummary(summaryOf({ ts: Date.now() }, ov, keys)));
  assert.equal(sum.sections.ipqs, "A"); assert.equal(sum.works, 30); assert.equal(sum.down, 313);
  assert.equal(titleParts(zh, sum).join(" · "), `网络透视 ${ov.grade} · IP 质量 A · 可用服务 30/33 · 下载 313 Mbps`);
  assert.equal(titleParts(en, decodeSummary(encodeSummary({ ts: 1, total: "B" }))).join(" · "), "Network X-Ray B");
});

test("an unreadable result code is a 404, never a redirect home (contract §4)", async () => {
  const { default: worker } = await import("../src/worker.js");
  const env = { ASSETS: { fetch: async () => { throw new Error("must not fetch the page for an unreadable code"); } } };
  for (const p of ["/zh-cn/r/zz", "/r/zz", "/r/1~tnv0rh~B", "/ja/r/9~tnv0rh~B~F~B~B~A~A~73~24-33~396~19", "/zh-cn/r/1~tnv0rh~X~F~B~B~A~A~73~24-33~396~19"]) {
    const r = await worker.fetch(new Request("https://check.1ms.dog" + p), env);
    assert.equal(r.status, 404, p);
    assert.ok(!(r.headers.get("content-type") || "").includes("html"), p + ": a bare 404, the shell draws the page");
  }
  const r = await worker.fetch(new Request("https://check.1ms.dog/nope"), env);
  assert.equal(r.status, 404);
});
