// A report in a link: /<lang>/r/<summary>#<full>
//   summary   in the path, so the server reads it for the link's preview title and image: the format version, when,
//             the overall grade, the five sections' grades, and the key numbers. Under 100 characters.
//   full      after the #, never sent to the server: every tool's path, headline, stats, findings and facts (JSON,
//             base64url). The page rebuilds the whole report from it. A link without it shows the summary only.
//
// Summary format 1:  1~<time, base 36 s>~<overall>~<privacy>~<ipqs>~<unlock>~<conn>~<speed>~<IP score>~<works>-<all>~<down>~<up>
//   grades are A+ A B C D F, or empty for a section that didn't run; numbers are empty when not measured; speeds in
//   Mbps (one decimal under 10).

export const FORMAT = 1;
export const SECS = ["privacy", "ipqs", "unlock", "conn", "speed"];
const GRADE = /^(A\+|A|B|C|D|F)$/;
const g = v => (GRADE.test(v || "") ? v : "");
const mbps = v => (typeof v !== "number" || !Number.isFinite(v) || v < 0 ? "" : v >= 10 ? String(Math.round(v)) : v.toFixed(1));
const int = v => (typeof v !== "number" || !Number.isFinite(v) || v < 0 ? "" : String(Math.round(v)));

// { ts, total, sections: { privacy, ipqs, unlock, conn, speed }, ipqsScore, works, all, down, up } → summary
export function encodeSummary(s) {
  const works = s.works != null && s.all > 0 ? `${int(s.works)}-${int(s.all)}` : "";
  return [FORMAT, Math.round((s.ts || Date.now()) / 1000).toString(36), g(s.total), ...SECS.map(k => g(s.sections && s.sections[k])), int(s.ipqsScore), works, mbps(s.down), mbps(s.up)].join("~");
}

// summary → the fields, or null when it isn't one this page can read
export function decodeSummary(code) {
  if (typeof code !== "string" || code.length > 120) return null;
  const p = code.split("~");
  if (p[0] !== String(FORMAT) || p.length !== 12 || !/^[0-9a-z]{1,8}$/.test(p[1])) return null;
  const grades = p.slice(2, 8);
  if (!grades.every(x => x === "" || GRADE.test(x))) return null;
  if (!/^(\d{1,3})?$/.test(p[8]) || !/^(\d{1,4}-\d{1,4})?$/.test(p[9]) || !/^(\d{1,6}(\.\d)?)?$/.test(p[10 - 1 + 1] || "") || !/^(\d{1,6}(\.\d)?)?$/.test(p[9 + 1] || "")) return null;
  const [works, all] = p[9] ? p[9].split("-").map(Number) : [null, null];
  const out = { v: FORMAT, ts: parseInt(p[1], 36) * 1000, total: grades[0] || null, sections: Object.fromEntries(SECS.map((k, i) => [k, grades[i + 1] || null])),
    ipqsScore: p[8] ? +p[8] : null, works, all, down: p[10] ? +p[10] : null, up: p[11] ? +p[11] : null };
  return out;
}

// the full report ↔ the fragment (UTF-8 JSON, base64url)
const B64 = typeof btoa === "function";
export function encodeFull(report) {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const b = B64 ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeFull(frag) {
  if (typeof frag !== "string" || frag.length < 8 || frag.length > 200000 || !/^[\w-]+$/.test(frag)) return null;
  try {
    const b = frag.replace(/-/g, "+").replace(/_/g, "/");
    const bin = B64 ? atob(b) : Buffer.from(b, "base64").toString("binary");
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const r = JSON.parse(new TextDecoder().decode(bytes));
    if (!r || r.v !== 1 || typeof r.tools !== "object" || !r.tools) return null;
    return r;
  } catch (e) { return null; }
}

// /r/<summary> or /<lang folder>/r/<summary> → { slug, code }, or null
export function sharePath(pathname) {
  const m = /^\/(?:([a-z]{2}(?:-[a-z]{2})?)\/)?r\/([0-9A-Za-z~+._-]+)\/?$/.exec(pathname);
  return m ? { slug: m[1] || "", code: decodeURIComponent(m[2]) } : null;
}

// a report plus its overall() → the summary's fields
export function summaryOf(report, ov, keys) {
  return { ts: report.ts, total: ov.grade, sections: Object.fromEntries(SECS.map(k => [k, ov.sections[k] && ov.sections[k].grade])),
    ipqsScore: keys.ipqs && keys.ipqs.score, works: keys.unlock && keys.unlock.works, all: keys.unlock && keys.unlock.total, down: keys.down, up: keys.up };
}
