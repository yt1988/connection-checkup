// The Network X-Ray (Connection Checkup) Worker. Files in ./public are served before it runs, so it only sees paths that are not
// files:
//   /r/<summary>, /<lang>/r/<summary>   a shared report: that language's page with the grades in its title, description
//                              and preview image (what chat apps show), not indexed; the page itself reads the summary,
//                              and the full report after the # when the link carries one (src/share.mjs)
//   anything else              a bare 404; 1ms-shell puts the shared 1ms.dog 404 page in front of it

import { decodeSummary, sharePath } from "./share.mjs";
import { gradeKey } from "./report.mjs";
import en from "./i18n/en.mjs";
import zhCN from "./i18n/zh-CN.mjs";
import zhTW from "./i18n/zh-TW.mjs";
import ja from "./i18n/ja.mjs";
import ko from "./i18n/ko.mjs";
import es from "./i18n/es.mjs";
import fr from "./i18n/fr.mjs";
import de from "./i18n/de.mjs";
import pt from "./i18n/pt.mjs";
import ru from "./i18n/ru.mjs";

// each language's strings by its folder ("" is English, at the root)
const STR = { "": en, "zh-cn": zhCN, "zh-tw": zhTW, ja, ko, es, fr, de, pt, ru };
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m);
const mbps = v => v >= 10 ? String(Math.round(v)) : v.toFixed(1);

// the preview title's parts: the overall grade, then the sections' key numbers that were measured
export function titleParts(S, r) {
  const parts = [`${S.app_name} ${r.total || "–"}`];
  if (r.sections.ipqs) parts.push(`${S.k_ipqs} ${r.sections.ipqs}`);
  if (r.works != null && r.all) parts.push(`${S.k_unlock} ${r.works}/${r.all}`);
  if (r.down != null) parts.push(`${S.k_down} ${mbps(r.down)} Mbps`);
  return parts;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed\n", { status: 405 });
    const sp = sharePath(url.pathname);
    if (sp && STR[sp.slug] && env.ASSETS) return shared(req, env, url, sp);
    return new Response(req.method === "HEAD" ? null : "Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
    });
  },
};

// A shared report: the language's page as it is, with the title, description, their Open Graph and Twitter copies
// and the preview image carrying the grades. A summary this page can't read goes to the language's page instead.
async function shared(req, env, url, { slug, code }) {
  const home = "/" + (slug ? slug + "/" : "");
  const r = decodeSummary(code);
  if (!r) return Response.redirect(new URL(home, url).toString(), 302);
  const S = STR[slug];
  const title = titleParts(S, r).join(" · ");
  const desc = fill(S.share_desc, { n: 8, total: r.total || "–" });
  const img = `${url.origin}/og/${slug || "en"}${r.total ? "-" + gradeKey(r.total) : ""}.png`;
  const page = await env.ASSETS.fetch(new Request(new URL(home, url), { headers: req.headers }));
  if (!page.ok) return page;
  const attr = (val, name = "content") => ({ element: e => e.setAttribute(name, val) });
  const out = new HTMLRewriter()
    .on("title", { element: e => e.setInnerContent(title) })
    .on('meta[name="description"]', attr(desc))
    .on('meta[property="og:title"]', attr(title)).on('meta[name="twitter:title"]', attr(title))
    .on('meta[property="og:description"]', attr(desc)).on('meta[name="twitter:description"]', attr(desc))
    .on('meta[property="og:image"]', attr(img)).on('meta[name="twitter:image"]', attr(img)).on('meta[property="og:image:alt"]', attr(title))
    .on('meta[property="og:url"]', attr(url.origin + url.pathname))
    .on('meta[name="robots"]', attr("noindex, follow"))
    .transform(page);
  const h = new Headers(out.headers);
  h.delete("etag");
  h.set("cache-control", "public, max-age=3600");
  h.set("x-robots-tag", "noindex");
  return new Response(req.method === "HEAD" ? null : out.body, { status: 200, headers: h });
}
