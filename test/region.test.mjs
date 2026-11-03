// Region names and flags per 1ms-shell docs/tool-contract.md §5: TW has a fixed name in every language and the cn flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LANGS_ALL } from "../src/tools.mjs";
import { TW, regionName, flagCode } from "../src/region.mjs";

test("TW has its fixed name in every page language, and the cn flag", () => {
  assert.deepEqual(Object.keys(TW).sort(), [...LANGS_ALL].sort());
  assert.equal(regionName("TW", "zh-CN"), "中国台湾");
  assert.equal(regionName("TW", "zh-TW"), "中國台灣");
  assert.equal(regionName("TW", "en"), "Taiwan, China");
  assert.equal(regionName("TW", "fr"), "Taïwan, Chine");
  assert.equal(regionName("TW", "ru"), "Тайвань, Китай");
  assert.equal(regionName("TW", "xx"), "Taiwan, China");
  assert.equal(flagCode("TW"), "cn");
});

test("other regions, Hong Kong and Macao included, keep their system names and own flags", () => {
  for (const cc of ["HK", "MO", "JP", "US", "CN"]) {
    assert.equal(regionName(cc, "zh-CN"), new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(cc));
    assert.equal(flagCode(cc), cc.toLowerCase());
  }
});

test("no other source names Taiwan, or uses DisplayNames for regions, on its own", async () => {
  const src = new URL("../src/", import.meta.url);
  const files = (await readdir(src, { recursive: true })).filter(f => /\.(m?js|html)$/.test(f) && !/region\.mjs$/.test(f));
  for (const f of files) {
    const s = await readFile(new URL(f.replace(/\\/g, "/"), src), "utf8");
    assert.doesNotMatch(s, /台湾|台灣|Taiwan|Taïwan|Taiwán|Тайвань|대만|🇹🇼|tw\.svg/, f);
    assert.doesNotMatch(s, /DisplayNames\([^)]*\)[^;]*region/, f);
  }
});
