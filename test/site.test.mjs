// The built pages keep the 1ms.dog tool contract (1ms-shell docs/tool-contract.md) and draw every slot up front.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS, FRAME_SRC } from "../scripts/build.mjs";
import { TOOLS, SECTIONS, nameOf } from "../src/tools.mjs";

const page = slug => readFile(new URL(`../public/${slug ? slug + "/" : ""}index.html`, import.meta.url), "utf8");

test("every language page keeps the shell contract", async () => {
  for (const [lang, slug] of LANGS) {
    const h = await page(slug);
    assert.match(h, new RegExp(`<html lang="${lang}"`), lang);
    assert.match(h, /<head>\r?\n<meta charset="utf-8">\r?\n<script>/, lang + ": charset first, then the pre-paint script");
    assert.match(h, /id="helpBtn"[^>]*aria-haspopup="dialog"/, lang + ": help button");
    assert.match(h, /<div class="scrim" id="help" hidden>/, lang + ": help dialog hidden by default");
    assert.match(h, /class="logo-light" src="\/assets\/logo-light.svg" width="90" height="36"[^>]*loading="lazy"/);
    assert.ok(!/\{\{[\w:]+\}\}/.test(h), lang + ": unfilled placeholder");
    assert.ok(h.length < 60000, lang + ": page is " + h.length + " bytes");
    assert.equal((h.match(/<script>/g) || []).length, 1, lang + ": the only inline script is the pre-paint one");
    assert.equal((h.match(/<div data-ms-more><\/div>/g) || []).length, 1, lang + ": one place for the shell's tool list");
    assert.ok(h.indexOf("data-ms-more") < h.indexOf('class="scrim"'), lang + ": tool list before the dialogs");
    const order = ["id=\"lang\"", "id=\"helpBtn\"", "class=\"icon-btn gh\"", "id=\"theme\""].map(s => h.indexOf(s));
    assert.deepEqual([...order].sort((a, b) => a - b), order, lang + ": header button order");
    assert.match(h, /<link rel="canonical" href="https:\/\/check\.1ms\.dog\//, lang + ": canonical");
    assert.match(h, /hreflang="x-default"/, lang);
    assert.match(h, /"@type":"FAQPage"/, lang + ": FAQ structured data");
    assert.match(h, /<meta property="og:image" content="https:\/\/check\.1ms\.dog\/og\/[a-z-]+\.png">/, lang);
    assert.ok(!/manifest|serviceWorker/.test(h), lang + ": no manifest or service worker of our own");
    assert.ok(!/id="shareDlg"/.test(h), lang + ": no share dialog of its own");
    // the tool names on the page are the bar's
    for (const id of TOOLS) assert.ok(h.includes(`<span class="t-name">${nameOf(id, lang).replace(/&/g, "&amp;")}</span>`), `${lang}: ${id}'s name`);
  }
});

test("every slot of the report is drawn before anything runs", async () => {
  const h = await page("");
  for (const id of TOOLS) assert.match(h, new RegExp(`<article class="tool card" data-tool="${id}" data-st="wait" data-open="0"`), id + ": collapsed by default");
  assert.match(h, /<section class="tools card" id="tools" data-open="0" hidden>/, "the test log starts collapsed");
  for (const id of TOOLS) assert.match(h, new RegExp(`<li data-tool="${id}" data-st="wait">`), id + " chip");
  for (const s of SECTIONS) for (const p of ["sg", "sh", "ss", "sf", "sl"]) assert.match(h, new RegExp(`id="${p}-${s.id}"`), `${p}-${s.id}`);
  for (const id of ["vGrade", "vHead", "vSub", "vMiss", "kIpqs", "kUnlock", "kDown", "finds", "progTxt", "go", "shareBtn"]) assert.match(h, new RegExp(`id="${id}"`), id);
  assert.match(h, /<section class="hero card" id="hero" data-st="idle">/);
});

test("the CSP frames the tools' hosts and nothing frames this page", async () => {
  const hd = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  assert.ok(hd.includes("frame-src 'self' " + FRAME_SRC), FRAME_SRC);
  assert.ok(hd.includes("frame-ancestors 'none'"));
  assert.ok(hd.includes(`/assets/share/*
  ! Cache-Control
  Cache-Control: public, max-age=0, must-revalidate`), "the share dialog revalidates");
});

test("shared reports are not indexed, the pages are", async () => {
  const r = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
  assert.match(r, /Disallow: \/r\//); assert.match(r, /Disallow: \/zh-cn\/r\//); assert.match(r, /Sitemap: https:\/\/check\.1ms\.dog\/sitemap\.xml/);
});
