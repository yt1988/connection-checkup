#!/usr/bin/env node
// Builds the static site in public/ from src/:
//   index.html, <lang>/index.html              the page per language, with every slot of the report drawn
//   assets/app.<hash>.js, assets/app.<hash>.css the page's code and styles, shared by every language
//   assets/l.<lang>.<hash>.js                    the strings the browser code needs, per language
//   assets/mock.<hash>.json                      the sample results in test/fixtures/, for ?mock=1
//   (assets/share/: the 1ms.dog share dialog, copied verbatim from 1ms-shell and committed; not built here)
//   og/*.png                                     link preview images: made by scripts/assets.mjs, committed, not here
//   sitemap.xml, robots.txt, llms.txt, _headers  SEO and security headers (CSP: the tools' hosts as frame-src)
// The Worker (src/worker.js: shared reports' preview titles) is deployed from source by wrangler.
// Usage: node scripts/build.mjs          write the files
//        node scripts/build.mjs --check  exit 1 if anything in public/ is out of date (CI)
// Environment: SITE_URL (default https://check.1ms.dog); FRAME_SRC, the origins the page may frame (default: the
// site's parent domain and its subdomains, where the 1ms.dog tools live).
import { mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build as bundle, transform } from "esbuild";
import { TOOLS, SECTIONS, nameOf } from "../src/tools.mjs";

const SITE = (process.env.SITE_URL || "https://check.1ms.dog").replace(/\/+$/, "");
const parent = new URL(SITE).hostname.split(".").slice(-2).join(".");
export const FRAME_SRC = process.env.FRAME_SRC || `https://${parent} https://*.${parent}`;
const pub = new URL("../public/", import.meta.url), src = new URL("../src/", import.meta.url), fixtures = new URL("../test/fixtures/", import.meta.url);
// language, URL folder, og:locale; the first is the root
export const LANGS = [["en", "", "en_US"], ["zh-CN", "zh-cn", "zh_CN"], ["zh-TW", "zh-tw", "zh_TW"], ["ja", "ja", "ja_JP"], ["ko", "ko", "ko_KR"],
  ["es", "es", "es_ES"], ["fr", "fr", "fr_FR"], ["de", "de", "de_DE"], ["pt", "pt", "pt_BR"], ["ru", "ru", "ru_RU"]];

// Runs before first paint: apply the saved theme. On the English root, send visitors to their language's page
// (a saved choice first, then the browser languages), keeping the rest of the path, so a shared report /r/... opens as
// /<lang>/r/...; crawlers and English readers stay.
const PREPAINT = `(function(){var d=document.documentElement,th=null,s=null;try{th=localStorage.getItem("checkup:theme");s=localStorage.getItem("checkup:lang")}catch(e){}if(th==="light"||th==="dark")d.setAttribute("data-theme",th);if(!d.hasAttribute("data-root"))return;var P=JSON.parse(d.getAttribute("data-paths")||"{}"),l=null;try{var q=new URLSearchParams(location.search).get("lang");if(P[q])l=q}catch(e){}if(!l&&P[s])l=s;for(var ls=navigator.languages||[navigator.language||"en"],i=0;!l&&!s&&i<ls.length;i++){var x=String(ls[i]).toLowerCase(),b=x.split("-")[0];l=b==="zh"?(/tw|hk|mo|hant/.test(x)?"zh-TW":"zh-CN"):P[b]?b:null}if(l&&l!=="en")location.replace(P[l]+location.pathname.slice(1)+location.search+location.hash)})();`;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hash = s => createHash("sha256").update(s).digest("hex").slice(0, 10);
const sha = s => createHash("sha256").update(s).digest("base64");

async function loadI18n() {
  const out = {};
  for (const f of (await readdir(new URL("i18n/", src))).filter(f => f.endsWith(".mjs")))
    out[f.slice(0, -4)] = (await import(new URL("i18n/" + f, src).href + "?" + Date.now())).default;
  return out;
}

// Strings only the build uses (the page already shows them); everything else goes to the browser
const BUILD_ONLY = new Set(["name", "seo_title", "seo_desc", "seo_kw", "og_sub", "h1", "docs", "lang_label", "faq_h", "og_tag", "weight"]);
const CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

export async function build({ check = false } = {}) {
  const I = await loadI18n(), en = I.en;
  const langs = LANGS.filter(([l]) => I[l]);
  for (const [l] of langs) for (const k of Object.keys(en)) if (!(k in I[l])) throw new Error(`i18n/${l}.mjs is missing "${k}"`);
  const tpl = await readFile(new URL("page.html", src), "utf8");

  const root = fileURLToPath(new URL("..", import.meta.url));
  const js = (await bundle({ entryPoints: [fileURLToPath(new URL("app.js", src))], bundle: true, minify: true, format: "iife", target: "es2020",
    legalComments: "none", write: false, absWorkingDir: root, external: ["/assets/*"] })).outputFiles[0].text;
  // regex lookbehind, (?<= or (?<!, is a syntax error in Safari before 16.4: the whole script fails to parse there
  if (/\(\?<[=!]/.test(js)) throw new Error("src/: regex lookbehind (?<= or (?<! in the page script; Safari before 16.4 can't parse it");
  const cssFull = (await Promise.all(["fonts.css", "base.css", "style.css"].map(f => readFile(new URL(f, src), "utf8")))).join("\n");
  const css = (await transform(cssFull, { loader: "css", minify: true, legalComments: "none" })).code;
  const jsName = `app.${hash(js)}.js`, cssName = `app.${hash(css)}.css`;
  const files = { ["assets/" + jsName]: js, ["assets/" + cssName]: css };
  // the sample results, one message per tool, for ?mock=1
  const mock = {};
  for (const f of (await readdir(fixtures)).filter(f => f.endsWith(".json")).sort()) mock[f.slice(0, -5)] = JSON.parse(await readFile(new URL(f, fixtures), "utf8"));
  const mockText = JSON.stringify(mock), mockName = `mock.${hash(mockText)}.json`;
  files["assets/" + mockName] = mockText;

  const path = slug => "/" + (slug ? slug + "/" : "");
  for (const [lang, slug, locale] of langs) {
    const d = I[lang], T = (k, v) => { if (!(k in d)) throw new Error(`i18n/${lang}.mjs has no "${k}"`); let s = d[k]; if (v) for (const x in v) s = s.split("{" + x + "}").join(v[x]); return s; };
    const strings = Object.fromEntries(Object.keys(en).filter(k => !BUILD_ONLY.has(k)).map(k => [k, T(k)]));
    const sjs = `window.L1MS=${JSON.stringify(strings).replace(/</g, "\\u003c")};\n`;
    const sName = `l.${lang.toLowerCase()}.${hash(sjs)}.js`;
    files["assets/" + sName] = sjs;

    const url = SITE + path(slug), docs = T("docs");
    const alts = langs.map(([l, sl]) => `<link rel="alternate" hreflang="${l}" href="${SITE + path(sl)}">`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${SITE}/">`;
    const graph = [
      { "@type": "WebApplication", name: T("app_name") + " · 1ms.dog", url, applicationCategory: "UtilitiesApplication", operatingSystem: "Any",
        browserRequirements: "Requires JavaScript", description: T("seo_desc"), inLanguage: lang, isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      { "@type": "FAQPage", mainEntity: docs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.replace(/\n+/g, " ") } })) },
    ];
    const head = [
      `<title>${esc(T("seo_title"))}</title>`,
      `<meta name="description" content="${esc(T("seo_desc"))}">`,
      `<meta name="keywords" content="${esc(T("seo_kw"))}">`,
      ...(lang === "zh-CN" ? [`<meta http-equiv="Cache-Control" content="no-transform">`, `<meta http-equiv="Cache-Control" content="no-siteapp">`, `<meta name="applicable-device" content="pc,mobile">`] : []),
      `<meta name="robots" content="index, follow, max-image-preview:large">`,
      `<meta name="application-name" content="${esc(T("app_name"))}">`,
      `<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)">`,
      `<meta name="theme-color" content="#1c1c1c" media="(prefers-color-scheme: dark)">`,
      `<link rel="canonical" href="${url}">`, alts,
      `<link rel="icon" href="/favicon.ico" sizes="any">`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
      `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="1ms.dog">`,
      `<meta property="og:title" content="${esc(T("seo_title"))}">`, `<meta property="og:description" content="${esc(T("og_sub"))}">`, `<meta property="og:url" content="${url}">`,
      `<meta property="og:locale" content="${locale}">`,
      `<meta property="og:image" content="${SITE}/og/${lang.toLowerCase()}.png">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${esc(T("seo_title"))}">`,
      `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:image" content="${SITE}/og/${lang.toLowerCase()}.png">`,
      `<meta name="twitter:title" content="${esc(T("seo_title"))}">`, `<meta name="twitter:description" content="${esc(T("og_sub"))}">`,
      `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`,
    ].join("\n");

    const helpNav = docs.map(([q], i) => `<button type="button" role="tab" data-hq="${i}" aria-selected="${i === 0}">${esc(q)}</button>`).join("");
    const helpC = docs.map(([q, a], i) => `<article data-hqb="${i}"${i ? " hidden" : ""}><h3>${esc(q)}</h3>${a.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</article>`).join("");
    const langOpts = langs.map(([l]) => `<option value="${l}"${l === lang ? " selected" : ""}>${esc(I[l].name)}</option>`).join("");
    const paths = Object.fromEntries(langs.map(([l, sl]) => [l, path(sl)]));
    const names = Object.fromEntries(TOOLS.map(id => [id, nameOf(id, lang)]));
    const chips = TOOLS.map(id => `<li data-tool="${id}" data-st="wait"><i></i>${esc(names[id])}<em></em></li>`).join("");
    // the five sections and the eight tools, every slot in place before anything runs
    const secs = SECTIONS.map(s => `<article class="sec card" data-sec="${s.id}"><div class="sec-h"><span class="sec-g" id="sg-${s.id}">–</span><h2>${esc(T("sec_" + s.id))}</h2><span class="w">${esc(T("weight", { w: s.weight }))}</span></div>` +
      `<p class="sec-head m" id="sh-${s.id}">&nbsp;</p><ul class="stats" id="ss-${s.id}"></ul><ul class="finds" id="sf-${s.id}"></ul><p class="sec-links" id="sl-${s.id}"></p></article>`).join("");
    const tools = TOOLS.map(id => `<article class="tool card" data-tool="${id}" data-st="wait" data-open="0"><div class="t-h"><span class="t-name">${esc(names[id])}</span><span class="t-st" data-st-txt>${esc(T("st_wait"))}</span><span class="t-head" data-head></span>` +
      `<button class="btn t-tog" type="button" data-tog aria-expanded="false" aria-label="${esc(T("expand"))}"><span data-tog-txt>${esc(T("expand"))}</span>${CHEV}</button></div><div class="t-body"><div data-frame></div><div class="t-res" data-res></div><p class="t-err" data-err></p></div></article>`).join("");

    const html = tpl
      .replace(/(<(\w+)\b[^>]*\sdata-i="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, k, inner, close) => open + esc(T(k)) + close)
      .replace(/\{\{a:(\w+)\}\}/g, (m, k) => esc(T(k)))
      .replace("{{lang}}", lang).replace("{{pathsAttr}}", esc(JSON.stringify(paths))).replace("{{rootAttr}}", slug ? "" : " data-root")
      .replace("{{prepaint}}", PREPAINT).replace("{{head}}", head).replace("{{css}}", cssName).replace("{{js}}", jsName).replace("{{strings}}", sName)
      .split("{{homeHref}}").join(path(slug)).replace("{{langOpts}}", langOpts).replace("{{h1}}", esc(T("h1")))
      .replace("{{chips}}", chips).replace("{{secs}}", secs).replace("{{tools}}", tools)
      .replace("{{helpNav}}", helpNav).replace("{{helpC}}", helpC)
      .replace("{{data}}", JSON.stringify({ lang, paths, names, mock: "/assets/" + mockName }).replace(/</g, "\\u003c"));
    if (/\{\{[\w:]+\}\}/.test(html)) throw new Error("unfilled placeholder in " + path(slug) + ": " + /\{\{[\w:]+\}\}/.exec(html)[0]);
    files[(slug ? slug + "/" : "") + "index.html"] = html;
  }

  files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    langs.map(([, s]) => `  <url>\n    <loc>${SITE + path(s)}</loc>\n` + langs.map(([l, s2]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE + path(s2)}"/>`).join("\n") +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>\n  </url>`).join("\n") + "\n</urlset>\n";
  files["robots.txt"] = `User-agent: *\nAllow: /\nDisallow: /r/\n${langs.slice(1).map(([, s]) => `Disallow: /${s}/r/\n`).join("")}\nSitemap: ${SITE}/sitemap.xml\n`;
  files["llms.txt"] = `# ${en.app_name} · 1ms.dog

> One run that chains eight 1ms.dog network tools into one graded report: Who Are You (what websites can tell about
> the visitor), IP Quality Test, EgressLens (which exit each site sees), IPv6 Test, DNS Test, the Streaming & AI
> Unlock Check, 1ms.dog's service latency test and the Speed Test. Each tool runs in its own frame inside the page and
> posts its result back; nothing is measured twice. Three phases (bandwidth last), about 90 seconds. Five sections
> graded A+ to F (IP quality 25 %, unlock 20 %, speed 20 %, identity and privacy 20 %, connectivity 15 %) make the
> overall grade; tools that didn't finish are left out and named. Cross-tool findings (an incomplete disguise, a
> leaking IP, split routing, AI blocked by region, DNS in another region, a congested line, slow IPv6) sit on top.
> Runs in the visitor's browser: it measures the connection in use right now, a proxy or an airport node included.

- Page: ${SITE}/ (also ${langs.slice(1).map(([, s]) => "/" + s + "/").join(", ")})
- Shared reports: ${SITE}/r/<summary>#<full> (format in src/share.mjs)
- Source code: https://github.com/yt1988/connection-checkup

`;
  // The only inline script is the pre-paint snippet, identical on every page: one hash covers the site.
  const csp = ["default-src 'self'", `script-src 'self' 'sha256-${sha(PREPAINT)}'`, "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:",
    "connect-src 'self'", "frame-src 'self' " + FRAME_SRC,
    "manifest-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join("; ");
  files["_headers"] = `# Generated by scripts/build.mjs
/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
/assets/*
  Cache-Control: public, max-age=604800
/assets/app.*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/l.*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/mock.*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/fonts/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/share/*
  ! Cache-Control
  Cache-Control: public, max-age=0, must-revalidate
/og/*
  Cache-Control: public, max-age=604800
/llms.txt
  Access-Control-Allow-Origin: *
  Content-Type: text/plain; charset=utf-8
`;

  const gen = async () => { try { return (await readdir(new URL("assets/", pub))).filter(f => /^(app|l|mock)\..+\.(js|css|json)$/.test(f)).map(f => "assets/" + f); } catch (e) { return []; } };
  const stale = [];
  for (const [f, body] of Object.entries(files)) {
    let cur = null; try { cur = await readFile(new URL(f, pub), "utf8"); } catch (e) {}
    if (cur !== body) stale.push(f);
  }
  const orphans = (await gen()).filter(f => !(f in files));
  if (check) return [...stale, ...orphans];
  for (const f of stale) { await mkdir(new URL(".", new URL(f, pub)), { recursive: true }); await writeFile(new URL(f, pub), files[f]); }
  for (const f of orphans) await rm(new URL(f, pub));
  return [...stale, ...orphans];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const changed = await build({ check });
  if (check && changed.length) { console.error("public/ is out of date: " + changed.join(", ") + "\nRun npm run build and commit public/."); process.exit(1); }
  console.log(check ? "public/ is up to date" : changed.length ? "wrote " + changed.join(", ") : "nothing to do");
}
