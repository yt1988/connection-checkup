// Exercise the actual app visibility function without adding a browser dependency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const sync = app.match(/  function syncReportEntry\(\) \{[\s\S]*?\n  \}/)[0];

test("result report entry needs a report, the shell, and a top-level non-embed page", () => {
  for (const [name, overrides, visible] of [
    ["finished report", {}, true],
    ["summary-only shared report", { LAST: null }, true],
    ["initial page", { OV: null }, false],
    ["running again", { RUN: {} }, false],
    ["no shell", { window: { self: 1, top: 1 } }, false],
    ["embed flag", { Q: new URLSearchParams("embed=checkup") }, false],
    ["empty embed flag", { Q: new URLSearchParams("embed") }, false],
    ["framed", { window: { self: 1, top: 2, msOpenReport() {} } }, false],
  ]) {
    const button = { hidden: true, setAttribute(k, v) { this[k] = v; } };
    const context = { $: () => button, OV: {}, RUN: null, Q: new URLSearchParams(),
      window: { self: 1, top: 1, msOpenReport() {} }, t: k => k === "report_prompt" ? "这个结果不对：" : k, ...overrides };
    vm.runInNewContext(sync + "\nsyncReportEntry();", context);
    assert.equal(!button.hidden, visible, name);
    assert.equal(button["data-ms-report"], "这个结果不对：", name + ": nonempty localized shell prefill");
  }
});

test("reset, full report rendering, and summary sharing refresh the report entry", () => {
  for (const name of ["reset", "render", "showShared"]) {
    const start = app.indexOf("  function " + name + "(");
    const next = app.indexOf("\n  function ", start + 1);
    assert.ok(app.slice(start, next < 0 ? undefined : next).includes("syncReportEntry();"), name);
  }
});

test("every language ships a hidden result entry next to the verdict with localized prefill", async () => {
  const { LANGS } = await import("../scripts/build.mjs");
  for (const [lang, slug] of LANGS) {
    const h = await readFile(new URL(`../public/${slug ? slug + "/" : ""}index.html`, import.meta.url), "utf8");
    const L = (await import(`../src/i18n/${lang}.mjs`)).default;
    assert.match(h, /id="vMiss"[\s\S]*?id="reportResult"[^>]*data-ms-report[^>]*aria-haspopup="dialog"[^>]*hidden/, lang);
    assert.ok(L.report_result.length > 3 && L.report_prompt.length > 3, lang);
    assert.ok(h.includes(L.report_result.replace(/&/g, "&amp;")), lang + ": translated button");
  }
});
