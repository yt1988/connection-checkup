#!/usr/bin/env node
// Renders the link-preview images with resvg (dev dependency), 1200 × 630:
//   public/og/<lang>.png            the page's own preview: the headline and a sample report card
//   public/og/<lang>-<grade>.png    a shared report's preview, one per overall grade (ap, a, b, c, d, f): that grade
//                                   big, with the sentence the report shows for it
// A Worker can't draw text, so the shared report's image is picked from these by grade (src/worker.js). Run when the
// headline, the subtitle or the verdict sentences change, and commit the output. Uses system fonts (Windows: Segoe UI,
// Microsoft YaHei, Microsoft JhengHei, Yu Gothic UI, Malgun Gothic), as the other 1ms.dog tools do.
// Usage: node scripts/assets.mjs
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { GRADES, gradeKey } from "../src/report.mjs";
import { SECTIONS } from "../src/tools.mjs";

const pub = new URL("../public/", import.meta.url), src = new URL("../src/", import.meta.url);
const HOST = new URL(process.env.SITE_URL || "https://check.1ms.dog").host;
const FONTS = { "zh-CN": "Microsoft YaHei", "zh-TW": "Microsoft JhengHei", ja: "Yu Gothic UI", ko: "Malgun Gothic" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const b64 = async f => Buffer.from(await readFile(new URL(f, pub))).toString("base64");
const render = svg => new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" } }).render().asPng();
const INK = "#e879f9";
const TIER = { "A+": "#3ecf8e", A: "#3ecf8e", B: "#9fd356", C: "#f5c524", D: "#f59e42", F: "#f56565" };
// the sample report on the page's own image
const SAMPLE = { total: "B", secs: { privacy: "C", ipqs: "A", unlock: "B", conn: "A", speed: "B" } };

const wide = ch => /[　-鿿가-힯＀-￯]/.test(ch), est = (t, px) => [...t].reduce((a, ch) => a + (wide(ch) ? 1 : .56) * px, 0);
const wrap = (text, px, width) => {
  const out = [];
  let cur = "";
  for (const word of text.split(/(?<=[ ，、？?,：:。])/)) {
    for (const piece of est(word, px) > width ? [...word] : [word]) {
      if (cur && est(cur + piece, px) > width) { out.push(cur.trim()); cur = ""; }
      cur += piece;
    }
  }
  return [...out, cur.trim()].filter(Boolean);
};

async function card(lang, d, grade) {
  const ff = `${FONTS[lang] ? `'${FONTS[lang]}', ` : ""}'Segoe UI', 'Microsoft YaHei', sans-serif`;
  const logo = await b64("assets/logo-dark.svg");
  // left column (500 px): the headline (or the grade's sentence) and the subtitle
  const h1 = grade ? d["v_" + gradeKey(grade)] : d.h1;
  let size = grade ? 44 : 58, lines;
  for (; (lines = wrap(h1, size, 500)).length > (grade ? 3 : 2) && size > 34; size -= 4);
  const subs = wrap(grade ? `${d.app_name} ${grade}` : d.og_sub, 26, 500).slice(0, 2);
  const top = 214 - (subs.length - 1) * 18 + (lines.length > 1 ? 0 : 26) - (lines.length > 2 ? 30 : 0);
  const head = lines.map((l, i) => `<text x="72" y="${top + i * (size + 12)}" font-size="${size}" font-weight="700" fill="#ededed">${esc(l)}</text>`).join("");
  const subY = top + (lines.length - 1) * (size + 12) + 58;
  const subText = subs.map((l, i) => `<text x="72" y="${subY + i * 36}" font-size="26" fill="#a0a0a0">${esc(l)}</text>`).join("");
  const barY = subY + (subs.length - 1) * 36 + 42;
  // the panel: the overall grade big, the five sections' grades under it
  const g = grade || SAMPLE.total, col = TIER[g];
  const secs = SECTIONS.map((s, i) => {
    const x = 632 + i * 104, sg = grade ? null : SAMPLE.secs[s.id], c = sg ? TIER[sg] : "#363636";
    // the label fits 96 px: wide (CJK) characters count double
    const name = d["sec_" + s.id], w = [...name].reduce((a, ch) => a + (/[　-鿿가-힯]/.test(ch) ? 2 : 1), 0);
    const label = w > 13 ? [...name].slice(0, w > 20 ? 6 : 11).join("") + "…" : name;
    return `<rect x="${x}" y="398" width="96" height="88" rx="16" fill="${c}" opacity="${sg ? .18 : .5}"/>` +
      `<text x="${x + 48}" y="455" font-size="40" font-weight="800" text-anchor="middle" fill="${sg ? c : "#6e6e78"}">${sg || "·"}</text>` +
      `<text x="${x + 48}" y="516" font-size="14" text-anchor="middle" fill="#a0a0a0">${esc(label)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${ff}">
<rect width="1200" height="630" fill="#1c1c1c"/>
<rect x="600" y="150" width="568" height="384" rx="20" fill="#232323" stroke="#363636"/>
<image x="72" y="56" width="180" height="72" href="data:image/svg+xml;base64,${logo}"/>
${head}
${subText}
<rect x="72" y="${barY}" width="120" height="6" rx="3" fill="${INK}"/>
<rect x="640" y="186" width="190" height="190" rx="34" fill="${col}" opacity=".16"/>
<text x="735" y="320" font-size="150" font-weight="800" text-anchor="middle" fill="${col}">${esc(g)}</text>
<text x="860" y="248" font-size="24" fill="#a0a0a0">${esc(d.app_name)}</text>
<text x="860" y="300" font-size="${[...d.card_sub].length > 18 ? 24 : 30}" font-weight="700" fill="#ededed">${esc(d.card_sub)}</text>
<text x="860" y="346" font-size="22" fill="#a0a0a0">${esc(d.og_tag)}</text>
${secs}
<text x="72" y="574" font-size="26" font-weight="600" fill="${INK}">${HOST}</text>
<text x="1128" y="574" font-size="22" fill="#a0a0a0" text-anchor="end">A+ · A · B · C · D · F</text>
</svg>`;
}

await mkdir(new URL("og/", pub), { recursive: true });
let total = 0;
for (const f of (await readdir(new URL("i18n/", src))).filter(f => f.endsWith(".mjs"))) {
  const lang = f.slice(0, -4), d = (await import(new URL("i18n/" + f, src).href)).default;
  for (const grade of [null, ...GRADES]) {
    const png = render(await card(lang, d, grade));
    const name = `og/${lang.toLowerCase()}${grade ? "-" + gradeKey(grade) : ""}.png`;
    await writeFile(new URL(name, pub), png);
    total += png.length;
  }
  console.log(`og/${lang.toLowerCase()}*.png`);
}
console.log(`${Math.round(total / 1024)} KB in all`);
