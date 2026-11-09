// What the "Report a problem" dialog shows about a run (1ms-shell docs/tool-contract.md, "报告问题"): one sentence in
// the visitor's language, the run as JSON that reproduces the report (under the dialog's 6 KB, IP addresses masked),
// and the readings as one-tap picks. Pure: the page passes its t() and language; nothing here reads the DOM.
//
// The data's keys are short to stay inside 6 KB (above that the dialog sends only the summary). The shape:
//   { v, ts, lang, page, shared, overall: { grade, score }, sections: { privacy, ipqs, unlock, conn, speed },
//     done, cross: [{ level, key, params }],
//     tools: { <id>: { st: status, g: grade, sc: score, h: headline, s: stats ("label: value" lines),
//                      f: findings ("level: text" lines), d: facts } } }
// The tools' own share paths are left out: they are long, and the facts and findings reproduce the report.
import { TOOLS, SECTIONS, nameOf } from "./tools.mjs";
import { crossFindings, gradeKey, keyStats } from "./report.mjs";
import { regionName } from "./region.mjs";

// the dialog's own limits (1ms-shell public/_ms/report.js): summary 300 characters, data 6 KB of JSON, picks 8 × 60
export const LIMITS = { summary: 300, data: 6000, picks: 8, pick: 60 };
// the 6 KB check counts the JSON as the dialog indents it; keep a few bytes spare
const BUDGET = LIMITS.data - 20;
const enc = new TextEncoder();
const bytes = s => enc.encode(s).length;
const mbps = v => (typeof v === "number" && isFinite(v) ? (v >= 10 ? String(Math.round(v)) : v.toFixed(1)) : null);

/* ---------- masking: a full IP address must never reach the dialog ---------- */
// The tools mask the visitor's own address before they post a result (who's WebRTC line arrives as "203.0.•.•").
// This catches anything that still looks complete, so the report can never carry one: an IPv4 keeps its first two
// octets, an IPv6 its first two groups.
export function maskIps(v) {
  if (typeof v === "string") return maskText(v);
  if (Array.isArray(v)) return v.map(maskIps);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = maskIps(v[k]); return o; }
  return v;
}
const maskV6 = m => m.split(":").slice(0, 2).join(":") + ":…";
// an IPv6 must be a compressed one ("::") or the full eight groups: "12:34:56" in a line is not an address
const V6 = /(^|[^\w:])((?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4})(?![\w:])/gi;
const maskText = s => s
  .replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (m, a, b, c, d) => (+a > 255 || +b > 255 || +c > 255 || +d > 255 ? m : a + "." + b + ".*.*"))
  .replace(V6, (m, pre, ip) => (/::/.test(ip) || ip.split(":").filter(Boolean).length >= 6 ? pre + maskV6(ip) : m));

/* ---------- the sentence: what was measured, and how it came out ---------- */
// The tagline says what a checkup measures; the verdict and the count say how this run came out. If a language's
// sentence would pass the dialog's byte cut, the less important part goes.
export function reportSummary(rep, ov, opts) {
  const t = opts.t, g = ov && ov.grade ? ov.grade : null;
  const verdict = g ? g + " · " + t("v_" + gradeKey(g)) : t("v_none");
  const app = t("app_name");
  const done = { done: ov && ov.done ? ov.done.length : 0, all: TOOLS.length };
  const candidates = rep
    ? [[app, t("og_sub"), verdict, t("tools_sum", done)], [app, verdict, t("tools_sum", done)], [app, verdict]]
    : [[app, verdict, t("partial")], [app, verdict]];
  let s = candidates[0].join(" · ");
  for (const c of candidates) { s = c.join(" · "); if (bytes(s) <= 590) break; }
  return s.slice(0, LIMITS.summary);
}

/* ---------- the readings: what the visitor can tap when they say "the result is wrong" ---------- */
const sectionGrade = (ov, id) => {
  if (!ov || !ov.sections) return null;
  const s = ov.sections[id];
  return typeof s === "string" ? s : (s && s.grade) || null;
};
const place = (cc, lang) => { if (!cc) return null; try { return regionName(cc, lang); } catch (e) { return cc; } };

export function reportPicks(rep, ov, opts) {
  const t = opts.t, lang = opts.lang, sep = /^(zh|ja)/.test(lang) ? "：" : ": ";
  const R = (rep && rep.tools) || {};
  const facts = id => (R[id] && R[id].facts) || {};
  const out = [];
  const put = (label, value) => {
    if (out.length >= LIMITS.picks || !label || value == null || value === "") return;
    out.push((label + sep + String(value)).slice(0, LIMITS.pick));
  };
  // the five graded parts first: "which part is wrong" usually means one of them
  for (const s of SECTIONS) put(t("sec_" + s.id), sectionGrade(ov, s.id));
  // then the numbers the visitor read: the three key ones, then each tool's own headline reading
  const k = keyStats(R), dns = facts("dns"), eg = facts("egress"), v6 = facts("ipv6"), home = facts("home"), un = facts("unlock");
  put(t("k_unlock"), k.unlock ? k.unlock.works + " / " + k.unlock.total : un.works != null ? un.works + " / " + un.total : null);
  put(t("k_down"), mbps(k.down) ? mbps(k.down) + " Mbps" : null);
  put(nameOf("dns", lang), place(dns.winnerCountry, lang));
  put(nameOf("egress", lang), eg.exits ? [...new Set(eg.exits.map(x => x.country).filter(Boolean))].map(cc => place(cc, lang)).join(" · ") : null);
  put(nameOf("ipv6", lang), v6.v6 === true && R.ipv6 && R.ipv6.stats[0] ? R.ipv6.stats[0].value : null);
  put(nameOf("home", lang), home.median != null ? home.median + " ms" : null);
  put(nameOf("ipqs", lang), R.ipqs ? [R.ipqs.grade, R.ipqs.score != null ? R.ipqs.score + " / 100" : null].filter(Boolean).join(" · ") : null);
  return out;
}

/* ---------- the data: the run as JSON, small enough for the dialog ---------- */
// The dialog sends the data only when its indented JSON stays under 6 KB (above that only the summary goes), so the
// findings lose their room in stages: full, shorter, only the worst one or two per tool, only their level, gone; then
// the stats, the headline and (only if a tool sent something huge) the facts.
const rank = { bad: 0, warn: 1, ok: 2 };
const findingsOf = (r, stage) => {
  const fs = (r.findings || []).slice();
  if (stage == null) return null;
  if (stage === "levels") return fs.map(f => f.level + ": ");
  if (stage === "top1" || stage === "top2") {
    fs.sort((a, b) => rank[a.level] - rank[b.level]);
    return fs.slice(0, stage === "top1" ? 1 : 2).map(f => f.level + ": " + f.text.slice(0, 80));
  }
  return fs.map(f => f.level + ": " + f.text.slice(0, stage));
};
const STAGES = [
  { f: 160 }, { f: 80 }, { f: 40 }, { f: "top2" }, { f: "top1" }, { f: "levels" }, { f: null },
  { f: null, stats: false }, { f: null, stats: false, headline: false }, { f: null, stats: false, headline: false, facts: false },
];

function pack(rep, ov, opts, stage) {
  const R = rep.tools || {}, miss = rep.missing || {}, tools = {};
  for (const id of TOOLS) {
    const r = R[id];
    if (!r) { tools[id] = { st: miss[id] || "none" }; continue; }
    const x = { st: "done", g: r.grade || null, sc: typeof r.score === "number" ? r.score : null };
    if (stage.headline !== false) x.h = r.headline || "";
    if (stage.stats !== false) x.s = (r.stats || []).map(s => s.label + ": " + s.value).join("\n");
    const f = findingsOf(r, stage.f);
    if (f && f.length) x.f = f.join("\n");
    if (stage.facts !== false) x.d = r.facts || {};
    tools[id] = x;
  }
  const d = { v: 1, ts: rep.ts || Date.now(), lang: rep.lang || opts.lang, page: opts.page || "", shared: !!opts.shared,
    overall: ov && ov.grade ? { grade: ov.grade, score: typeof ov.score === "number" ? ov.score : null } : null,
    sections: {}, done: ov && ov.done ? ov.done.length : 0, tools };
  for (const s of SECTIONS) d.sections[s.id] = sectionGrade(ov, s.id);
  d.cross = crossFindings(R).map(f => ({ level: f.level, key: f.key, params: f.params || {} }));
  return d;
}

export function reportData(rep, ov, opts) {
  let d = pack(rep, ov, opts, STAGES[STAGES.length - 1]);
  for (const stage of STAGES) {
    const x = pack(rep, ov, opts, stage);
    if (bytes(JSON.stringify(x, null, 1)) <= BUDGET) { d = x; break; }
  }
  return maskIps(d);
}

/* ---------- the summary-only shared link: the grades, nothing to reproduce ---------- */
function summaryData(ov, opts) {
  const d = { v: 1, ts: opts.ts || Date.now(), lang: opts.lang, page: opts.page || "", shared: true, partial: true,
    overall: ov && ov.grade ? { grade: ov.grade, score: null } : null, sections: {} };
  for (const s of SECTIONS) d.sections[s.id] = sectionGrade(ov, s.id);
  return maskIps(d);
}

// rep: the full report on screen ({ ts, lang, tools, missing }) or null for a summary-only shared link;
// ov: its overall() (grade, score, sections, done); opts: { t, lang, page, shared, ts }
export function msReport(rep, ov, opts) {
  if (!ov) return null;
  if (!rep) return { summary: reportSummary(null, ov, opts), data: summaryData(ov, opts), picks: [] };
  return { summary: reportSummary(rep, ov, opts), data: reportData(rep, ov, opts), picks: reportPicks(rep, ov, opts) };
}
