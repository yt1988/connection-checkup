// From the tools' results to the report: a score for each tool, a grade for each section and for the whole, and the
// cross-tool findings (1ms-shell docs/checkup.md). Pure functions; the texts are the page's (keys and parameters only).
//
// A tool's result is the `result` message it posted: { grade, score, headline, stats, findings, facts, path }.
// `results` maps a tool id to its result; a tool that didn't finish is simply absent and counts for nothing.
import { SECTIONS, sectionOf } from "./tools.mjs";

export const GRADES = ["A+", "A", "B", "C", "D", "F"];
const G2S = { "A+": 100, A: 90, B: 78, C: 62, D: 47, F: 25 };
export const scoreOfGrade = g => (g in G2S ? G2S[g] : null);
export const gradeOfScore = s => s == null ? null : s >= 95 ? "A+" : s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F";
// the color tier of a grade (t1 best … t5 worst), and whether it reads as fine, a warning or bad
export const gradeTier = g => ({ "A+": "t1", A: "t1", B: "t2", C: "t3", D: "t4", F: "t5" })[g] || "";
export const gradeLevel = g => !g ? "" : g === "D" || g === "F" ? "bad" : g === "C" ? "warn" : "ok";
// a grade as a key in strings and file names: "A+" → "ap", "B" → "b"
export const gradeKey = g => g ? g.toLowerCase().replace("+", "p") : "";

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const first = (...vs) => { for (const v of vs) if (v != null) return v; return null; };
// a tiered score: thresholds low to high (lower is better), scores for each band and for beyond the last
const tiers = (v, th, sc) => { v = num(v); if (v == null) return null; for (let i = 0; i < th.length; i++) if (v < th[i]) return sc[i]; return sc[th.length]; };

// without a grade, a score or usable facts: the findings say how bad it is
function fromFindings(r) {
  if (!Array.isArray(r.findings)) return null;
  let s = 100;
  for (const f of r.findings) s -= f && f.level === "bad" ? 30 : f && f.level === "warn" ? 12 : 0;
  return Math.max(20, s);
}
function speedScore(f) {
  let s = tiers(f.down, [10, 25, 50, 100, 200, 500], [30, 48, 62, 75, 85, 92, 100]);
  if (s == null) return null;
  if (num(f.up) != null && f.up < 5 && f.up < f.down / 20) s -= 8;      // an upload far behind the download
  s -= { C: 8, D: 15, F: 25 }[f.bloat] || 0;                            // latency under load
  if (num(f.idle) != null && f.idle > 100) s -= 5;
  // UDP from the Tokyo server (rtc.1ms.dog): calls, games and HTTP/3 ride on it
  if (f.quic === false) s -= 8;
  else s -= tiers(f.udpLoss, [2, 5, 20], [0, 3, 6, 12]) || 0;
  return clamp(s);
}
function whoScore(f) {
  const known = ["webrtcLeak", "tzMismatch", "langMismatch", "fpSame", "dc", "dnsCountry", "problems"].some(k => k in f);
  if (!known) return null;
  let s = 100;
  if (f.webrtcLeak) s -= 35;
  if (f.tzMismatch) s -= 25;
  if (f.dnsCountry && f.ipCountry && f.dnsCountry !== f.ipCountry) s -= 15;
  if (f.langMismatch) s -= 10;
  if (f.fpSame) s -= 10;
  if (f.dc) s -= 5;
  if (s === 100 && num(f.problems)) s -= 15 * f.problems;     // problems the facts don't name
  return clamp(s);
}
function egressScore(f) {
  if (!("leak" in f) && !("split" in f) && !("exits" in f)) return null;
  return clamp(100 - (f.leak ? 45 : 0));
}
function homeScore(f) {
  let s = tiers(f.median, [50, 100, 200, 400], [100, 85, 70, 55, 35]);
  if (s == null) return null;
  if (Array.isArray(f.unreachable)) s -= Math.min(30, 8 * f.unreachable.length);
  return clamp(s);
}
function dnsScore(f) {
  let s = tiers(f.winnerMs, [20, 50, 100, 200], [100, 85, 70, 55, 35]);
  if (s == null) return null;
  if (f.leak) s -= 15;
  return clamp(s);
}
function v6Score(f) {
  const hole = f.blackhole === true ? 15 : 0;    // big packets vanish: some sites hang
  if (f.v6 === true) return (f.slower ? 70 : f.native === false ? 85 : 95) - hole;
  if (f.v6 === false) return 50 - hole;
  return null;
}

// A tool's score, 0 to 100, or null when nothing in its result can be graded. Its own grade or score first (the tool
// knows best), except the speed test, whose grade is only the bufferbloat; then its facts; then its findings.
export function toolScore(id, r) {
  if (!r || typeof r !== "object") return null;
  const f = r.facts && typeof r.facts === "object" ? r.facts : {};
  const own = first(scoreOfGrade(r.grade), num(r.score));
  switch (id) {
    case "ipqs": return first(own, num(f.score), scoreOfGrade(f.grade), fromFindings(r));
    case "unlock": return first(own, num(f.total) > 0 && num(f.works) != null ? clamp(100 * f.works / f.total) : null, fromFindings(r));
    case "speed": return first(speedScore(f), num(r.score), fromFindings(r));
    case "who": return first(own, whoScore(f), fromFindings(r));
    case "egress": return first(own, egressScore(f), fromFindings(r));
    case "ipv6": return first(own, num(f.score), v6Score(f), fromFindings(r));
    case "dns": return first(own, dnsScore(f), fromFindings(r));
    case "home": return first(own, homeScore(f), fromFindings(r));
    default: return first(own, fromFindings(r));
  }
}

// a section: the mean of its finished tools' scores; its grade; which tools finished and which didn't
export function sectionResult(sec, results) {
  const done = sec.tools.filter(id => results[id]), missing = sec.tools.filter(id => !results[id]);
  const scores = done.map(id => toolScore(id, results[id])).filter(s => s != null);
  const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return { id: sec.id, weight: sec.weight, score, grade: gradeOfScore(score), done, missing };
}

// the whole report: the weighted mean of the sections that could be graded (the others count for nothing)
export function overall(results) {
  const sections = SECTIONS.map(s => sectionResult(s, results));
  const graded = sections.filter(s => s.score != null);
  const used = graded.reduce((a, s) => a + s.weight, 0);
  const score = used ? Math.round(graded.reduce((a, s) => a + s.score * s.weight, 0) / used) : null;
  const bySec = Object.fromEntries(sections.map(s => [s.id, s]));
  return { score, grade: gradeOfScore(score), sections: bySec, list: sections, used, total: SECTIONS.reduce((a, s) => a + s.weight, 0),
    done: Object.keys(results).filter(id => results[id]), missing: SECTIONS.flatMap(s => s.tools).filter(id => !results[id]) };
}

// Where AI services turn visitors away by region (the exit's country, from EgressLens)
export const AI_RESTRICTED = new Set(["CN", "HK", "MO", "RU", "BY", "IR", "KP", "CU", "SY", "VE"]);
const AI_IDS = ["chatgpt", "openai", "claude", "anthropic", "gemini", "copilot", "grok", "perplexity", "mistral", "poe", "characterai", "sora"];
const mostCommon = arr => { const c = new Map(); for (const v of arr) if (v) c.set(v, (c.get(v) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || null; };

// The cross-tool findings (docs/checkup.md: seven rules, and the line-and-tunnel four), worst first, at most four.
// Each is a string key with its parameters (country codes, for the page to name in its language; numbers as they
// are) and a level: "bad" | "warn" | "ok". `lag`: loss or a line that stalls, which Network Diagnosis (lag) can locate.
export function crossFindings(results) {
  const F = id => (results[id] && results[id].facts && typeof results[id].facts === "object" ? results[id].facts : null);
  const who = F("who"), ipqs = F("ipqs"), eg = F("egress"), un = F("unlock"), v6 = F("ipv6"), sp = F("speed"), home = F("home"), dns = F("dns");
  const out = [];
  if (ipqs && who && ipqs.type === "hosting" && who.tzMismatch) out.push({ level: "bad", key: "x_hosting_tz" });
  if ((who && who.webrtcLeak) || (eg && eg.leak)) out.push({ level: "bad", key: "x_leak" });
  if (eg && eg.split && un && un.countries && typeof un.countries === "object") {
    const cs = Object.entries(un.countries).filter(([, c]) => typeof c === "string" && c);
    const distinct = new Set(cs.map(([, c]) => c));
    if (distinct.size >= 2) {
      const a = eg.aiCountry || mostCommon(cs.filter(([k]) => AI_IDS.includes(k)).map(([, c]) => c));
      const b = (typeof un.netflix === "string" && un.netflix) || mostCommon(cs.filter(([k]) => !AI_IDS.includes(k)).map(([, c]) => c));
      if (a && b && a !== b) out.push({ level: "ok", key: "x_split", params: { a, b } });
    }
  }
  if (un && un.ai && typeof un.ai === "object" && eg && AI_RESTRICTED.has(eg.aiCountry)) {
    const vals = Object.values(un.ai);
    if (vals.length && vals.every(v => v === false)) out.push({ level: "bad", key: "x_ai_blocked", params: { cc: eg.aiCountry } });
  }
  // the resolver as the authoritative DNS saw it (dns) when there is one, else as who guessed it
  const resolver = (dns && dns.resolverCountry) || (who && who.dnsCountry), exit = (who && who.ipCountry) || (ipqs && ipqs.country);
  // the authoritative DNS locates resolvers with DB-IP, whose licence (CC BY 4.0) wants a credit wherever it shows
  if (resolver && exit && resolver !== exit) out.push({ level: "warn", key: "x_dns_region", params: { a: resolver, b: exit }, ...(dns && dns.resolverCountry ? { geo: "dbip" } : {}) });
  if (sp && home && (sp.bloat === "D" || sp.bloat === "F") && num(home.median) != null && home.median > 150) out.push({ level: "warn", key: "x_bloat", lag: true });
  if (v6 && v6.v6 === true && v6.slower) out.push({ level: "warn", key: "x_v6_slow" });
  // line and tunnel: what the Tokyo server sees of UDP (speed), the path MTU (ipv6) and the TCP handshake (who)
  if (v6 && v6.blackhole === true) {
    // the largest packet that got through, or a size that passes on most tunnels
    const ok = [v6.mtu, v6.mtu6].filter(m => num(m) != null && m >= 1280 && m <= 1500);
    out.push({ level: "bad", key: "x_blackhole", params: { mtu: ok.length ? Math.min(...ok) : 1400 } });
  }
  if (sp && sp.quic === false) out.push({ level: "warn", key: "x_udp_blocked" });
  else if (sp && num(sp.udpLoss) != null && sp.udpLoss >= 5) out.push({ level: "warn", key: "x_udp_loss", params: { loss: Math.round(sp.udpLoss) }, lag: true });
  // PPPoE shrinks the MTU too, but it's the home line, not a proxy
  if (who && who.tunnel && who.tunnel !== "pppoe" && ((ipqs && ipqs.type === "hosting") || who.dc)) out.push({ level: "warn", key: "x_tunnel_dc" });
  const lv = { bad: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => lv[a.level] - lv[b.level]).slice(0, 4);
}

// the three key numbers on the first screen: IP quality, services that work, download speed
export function keyStats(results) {
  const ipqs = results.ipqs, un = results.unlock && results.unlock.facts, sp = results.speed && results.speed.facts;
  return {
    ipqs: ipqs ? { grade: ipqs.grade || null, score: num(ipqs.score) } : null,
    unlock: un && num(un.total) > 0 && num(un.works) != null ? { works: un.works, total: un.total } : null,
    down: sp && num(sp.down) != null ? sp.down : null,
    up: sp && num(sp.up) != null ? sp.up : null,
  };
}

// the findings of a section's tools, worst first, at most `max`
export function sectionFindings(sec, results, max = 4) {
  const lv = { bad: 0, warn: 1, ok: 2 };
  return sec.tools.flatMap(id => (results[id] && Array.isArray(results[id].findings) ? results[id].findings.map(f => ({ ...f, tool: id })) : []))
    .filter(f => f && lv[f.level] != null && typeof f.text === "string")
    .sort((a, b) => lv[a.level] - lv[b.level]).slice(0, max);
}
// the numbers on a section's card: a single tool's stats as they are, two or three tools' first ones, at most four
export function sectionStats(sec, results, max = 4) {
  const done = sec.tools.filter(id => results[id] && Array.isArray(results[id].stats));
  if (!done.length) return [];
  const per = done.length === 1 ? max : done.length === 2 ? 2 : 1;
  const out = done.flatMap(id => results[id].stats.slice(0, per).map(s => ({ ...s, tool: id })));
  // a third tool's second number when the first two left room
  for (const id of done) for (const s of results[id].stats.slice(per)) if (out.length < max) out.push({ ...s, tool: id });
  return out.slice(0, max);
}

// the whole report's worst findings: the cross-tool ones, then the tools', without repeats, at most `max`
export function topFindings(results, max = 4) {
  const lv = { bad: 0, warn: 1, ok: 2 };
  const own = SECTIONS.flatMap(s => sectionFindings(s, results, 8)).sort((a, b) => lv[a.level] - lv[b.level]);
  return own.slice(0, max);
}

export { sectionOf };
