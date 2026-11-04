// Grades and cross-tool findings from the sample results (test/fixtures: one result message per tool).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { TOOLS, SECTIONS, PHASES, NAMES, LANGS_ALL } from "../src/tools.mjs";
import { toolScore, overall, crossFindings, keyStats, sectionStats, sectionFindings, gradeOfScore, scoreOfGrade, gradeKey } from "../src/report.mjs";

const fixtures = new URL("./fixtures/", import.meta.url);
async function samples() {
  const out = {};
  for (const f of (await readdir(fixtures)).filter(f => f.endsWith(".json"))) {
    const m = JSON.parse(await readFile(new URL(f, fixtures), "utf8"));
    out[m.tool] = m;
  }
  return out;
}

test("the fixtures are result messages in the checkup's format, one per tool", async () => {
  const R = await samples();
  assert.deepEqual(Object.keys(R).sort(), [...TOOLS].sort());
  for (const [id, m] of Object.entries(R)) {
    assert.equal(m.ms, "checkup", id); assert.equal(m.v, 1, id); assert.equal(m.type, "result", id); assert.equal(m.tool, id);
    assert.ok(typeof m.path === "string" && (m.path === "" || m.path.startsWith("/")), id + ": path");
    assert.ok(["A+", "A", "B", "C", "D", "F", null].includes(m.grade), id + ": grade");
    assert.ok(m.score === null || (typeof m.score === "number" && m.score >= 0 && m.score <= 100), id + ": score");
    assert.ok(typeof m.headline === "string" && m.headline, id + ": headline");
    assert.ok(Array.isArray(m.stats) && m.stats.length >= 2 && m.stats.length <= 4, id + ": 2 to 4 stats");
    assert.ok(Array.isArray(m.findings) && m.findings.length <= 4 && m.findings.every(f => ["bad", "warn", "ok"].includes(f.level) && f.text), id + ": findings");
    assert.equal(typeof m.facts, "object", id + ": facts");
  }
});

test("every tool's sample gets a score, every section a grade, and the whole a grade", async () => {
  const R = await samples();
  for (const id of TOOLS) { const s = toolScore(id, R[id]); assert.ok(s != null && s >= 0 && s <= 100, `${id}: ${s}`); }
  const ov = overall(R);
  assert.ok(ov.grade, "overall grade");
  assert.equal(ov.used, 100);
  assert.deepEqual(ov.missing, []);
  for (const s of SECTIONS) assert.ok(ov.sections[s.id].grade, s.id);
  // the sample: a leaking, mismatched disguise (privacy F), a clean IP (B), a throttled download (speed F)
  assert.equal(ov.sections.privacy.grade, "F");
  assert.equal(ov.sections.ipqs.grade, "B");
  assert.equal(ov.sections.speed.grade, "F");
  assert.equal(ov.sections.conn.grade, "A");
});

test("a tool that didn't finish counts for nothing, and the report says so", async () => {
  const R = await samples();
  delete R.speed; delete R.ipqs;
  const ov = overall(R);
  assert.deepEqual(ov.missing.sort(), ["ipqs", "speed"]);
  assert.equal(ov.used, 55);
  assert.equal(ov.sections.speed.grade, null);
  assert.equal(ov.sections.ipqs.score, null);
  assert.ok(ov.grade);
  assert.equal(overall({}).grade, null);
  assert.equal(overall({}).used, 0);
});

test("the tool's own grade wins, except the speed test's bufferbloat grade", () => {
  assert.equal(toolScore("ipqs", { grade: "A", score: 20, facts: { score: 10 } }), scoreOfGrade("A"));
  assert.equal(toolScore("unlock", { grade: null, score: null, facts: { works: 33, total: 33 } }), 100);
  assert.equal(toolScore("unlock", { grade: null, score: null, facts: { works: 0, total: 33 } }), 0);
  assert.ok(toolScore("speed", { grade: "A+", facts: { down: 2, up: 1, bloat: "A+" } }) < 40, "a 2 Mbps line is slow whatever its bufferbloat");
  assert.ok(toolScore("speed", { grade: "F", facts: { down: 900, up: 500, bloat: "F" } }) >= 70);
  assert.equal(toolScore("who", { facts: {} , findings: [{ level: "bad", text: "x" }, { level: "warn", text: "y" }] }), 58);
  assert.equal(toolScore("who", { facts: { problems: 0, webrtcLeak: false, tzMismatch: false } }), 100);
  assert.equal(toolScore("egress", { facts: { leak: true, split: true } }), 55);
  assert.equal(toolScore("ipv6", { score: 100, facts: { v6: true } }), 100);
  assert.equal(toolScore("ipv6", { grade: null, score: null, facts: { v6: false } }), 50);
  assert.equal(toolScore("dns", { facts: { winnerMs: 7.6 } }), 100);
  assert.equal(toolScore("home", { facts: { median: 110, unreachable: ["x", "y"] } }), 70 - 16);
  assert.equal(toolScore("home", {}), null);
  assert.equal(toolScore("home", null), null);
});

test("grades and scores map both ways", () => {
  for (const g of ["A+", "A", "B", "C", "D", "F"]) assert.equal(gradeOfScore(scoreOfGrade(g)), g);
  assert.equal(gradeOfScore(null), null);
  assert.equal(gradeKey("A+"), "ap"); assert.equal(gradeKey("F"), "f"); assert.equal(gradeKey(null), "");
});

test("the cross-tool findings fire on the sample, worst first, four at most, the leak once", async () => {
  const R = await samples();
  const x = crossFindings(R), keys = x.map(f => f.key);
  assert.ok(x.length <= 4);
  assert.ok(keys.includes("x_hosting_tz"), "hosting + tz mismatch");
  assert.ok(keys.includes("x_leak"), "a leak (who and egress both say so)");
  assert.equal(keys.filter(k => k === "x_leak").length, 1);
  assert.ok(keys.includes("x_dns_region"));
  assert.deepEqual(x.find(f => f.key === "x_dns_region").params, { a: "CN", b: "JP" });
  const lv = x.map(f => ({ bad: 0, warn: 1, ok: 2 })[f.level]);
  assert.deepEqual(lv, [...lv].sort());
  assert.ok(!keys.includes("x_split"), "every service sees the same country: no split to report");
});

test("each rule on its own", () => {
  const f = (results) => crossFindings(results).map(x => x.key);
  assert.deepEqual(f({ ipqs: { facts: { type: "hosting" } }, who: { facts: { tzMismatch: true } } }), ["x_hosting_tz"]);
  assert.deepEqual(f({ ipqs: { facts: { type: "residential" } }, who: { facts: { tzMismatch: true } } }), []);
  assert.deepEqual(f({ egress: { facts: { leak: true } } }), ["x_leak"]);
  const split = crossFindings({ egress: { facts: { split: true, aiCountry: "US" } }, unlock: { facts: { countries: { chatgpt: "US", netflix: "JP", disney: "JP" }, netflix: "JP" } } });
  assert.deepEqual(split, [{ level: "ok", key: "x_split", params: { a: "US", b: "JP" } }]);
  assert.deepEqual(f({ egress: { facts: { aiCountry: "CN" } }, unlock: { facts: { ai: { chatgpt: false, claude: false } } } }), ["x_ai_blocked"]);
  assert.deepEqual(f({ egress: { facts: { aiCountry: "JP" } }, unlock: { facts: { ai: { chatgpt: false, claude: false } } } }), []);
  assert.deepEqual(f({ who: { facts: { dnsCountry: "CN", ipCountry: "JP" } } }), ["x_dns_region"]);
  assert.deepEqual(f({ speed: { facts: { bloat: "D" } }, home: { facts: { median: 300 } } }), ["x_bloat"]);
  assert.deepEqual(f({ speed: { facts: { bloat: "D" } }, home: { facts: { median: 30 } } }), []);
  assert.deepEqual(f({ ipv6: { facts: { v6: true, slower: true } } }), ["x_v6_slow"]);
  assert.deepEqual(f({ ipv6: { facts: { v6: false } } }), []);
});

test("key numbers, section stats and findings from the sample", async () => {
  const R = await samples();
  const k = keyStats(R);
  assert.deepEqual(k.ipqs, { grade: "B", score: 73 });
  assert.deepEqual(k.unlock, { works: 24, total: 33 });
  assert.equal(k.down, 2.1);
  const conn = SECTIONS.find(s => s.id === "conn");
  assert.equal(sectionStats(conn, R).length, 4);
  assert.ok(sectionFindings(conn, R).length <= 4);
  const priv = SECTIONS.find(s => s.id === "privacy");
  const pf = sectionFindings(priv, R);
  assert.equal(pf[0].level, "bad");
  assert.ok(sectionStats(priv, R).every(s => s.tool));
});

test("the tools, phases and names are complete", () => {
  assert.equal(TOOLS.length, 8);
  assert.deepEqual(PHASES.map(p => p.length), [5, 2, 1]);
  assert.deepEqual(SECTIONS.flatMap(s => s.tools).sort(), [...TOOLS].sort());
  assert.equal(SECTIONS.reduce((a, s) => a + s.weight, 0), 100);
  for (const id of TOOLS) for (const l of LANGS_ALL) assert.ok(NAMES[id][l], `${id} has no name in ${l}`);
});

test("line and tunnel: UDP, QUIC, the path MTU and a tunnel to a data center (each fact optional)", () => {
  const f = results => crossFindings(results);
  const keys = results => f(results).map(x => x.key);
  // QUIC blocked wins over the loss figure; loss under 5% says nothing
  assert.deepEqual(keys({ speed: { facts: { quic: false, udpLoss: 40 } } }), ["x_udp_blocked"]);
  assert.deepEqual(f({ speed: { facts: { quic: true, udpLoss: 12.4 } } }), [{ level: "warn", key: "x_udp_loss", params: { loss: 12 } }]);
  assert.deepEqual(keys({ speed: { facts: { quic: true, udpLoss: 3 } } }), []);
  // the black hole names the largest size that got through, or 1400 when none was measured
  assert.deepEqual(f({ ipv6: { facts: { v6: false, blackhole: true, mtu: 1420 } } })[0].params, { mtu: 1420 });
  assert.deepEqual(f({ ipv6: { facts: { v6: true, blackhole: true, mtu: 1420, mtu6: 1400 } } })[0].params, { mtu: 1400 });
  assert.deepEqual(f({ ipv6: { facts: { blackhole: true } } })[0], { level: "bad", key: "x_blackhole", params: { mtu: 1400 } });
  // a tunnel alone is no finding; with a data center IP it is
  assert.deepEqual(keys({ who: { facts: { tunnel: "wireguard" } } }), []);
  assert.deepEqual(keys({ who: { facts: { tunnel: "wireguard", dc: true } } }), ["x_tunnel_dc"]);
  assert.deepEqual(keys({ who: { facts: { tunnel: "pppoe", dc: true } } }), []);
  assert.deepEqual(keys({ who: { facts: { tunnel: "other" } }, ipqs: { facts: { type: "hosting" } } }), ["x_tunnel_dc"]);
  // the authoritative DNS's resolver country comes before who's guess
  assert.deepEqual(f({ dns: { facts: { resolverCountry: "US" } }, who: { facts: { dnsCountry: "JP", ipCountry: "JP" } } })[0].params, { a: "US", b: "JP" });
  assert.deepEqual(keys({ dns: { facts: { resolverCountry: "JP" } }, who: { facts: { dnsCountry: "US", ipCountry: "JP" } } }), []);
});

test("line and tunnel in the scores: UDP in the speed test, the black hole in IPv6, a tunnel costs nothing", () => {
  const sp = { down: 300, up: 100, bloat: "A" };
  const base = toolScore("speed", { facts: sp });
  assert.equal(toolScore("speed", { facts: { ...sp, udpLoss: 1 } }), base);
  assert.ok(toolScore("speed", { facts: { ...sp, udpLoss: 10 } }) < base);
  assert.ok(toolScore("speed", { facts: { ...sp, quic: false } }) < toolScore("speed", { facts: { ...sp, udpLoss: 10 } }));
  assert.equal(toolScore("ipv6", { facts: { v6: true, native: true } }) - toolScore("ipv6", { facts: { v6: true, native: true, blackhole: true } }), 15);
  assert.equal(toolScore("who", { facts: { problems: 0, tunnel: "wireguard", mss: 1380 } }), toolScore("who", { facts: { problems: 0 } }));
});
